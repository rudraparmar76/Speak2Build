"""In-process microphone recorder for the backend.

Why record here instead of in the webview? Extension webviews run as sandboxed
iframes whose Chromium permissions policy denies `getUserMedia` outright
(microsoft/vscode#113916, #250568). The backend, being an ordinary desktop
process, only needs the OS-level microphone permission.

Design:
- PortAudio (`sounddevice`) opens a mono 16 kHz float32 InputStream with a
  callback that appends frames into an in-memory buffer.
- A watchdog timer enforces MAX_RECORDING_SECONDS independently of the webview
  (auto-stop also finalizes and stores the recording).
- The recorder is a process-global singleton: one mic, one active session.
- The stream abstraction is injectable so tests can run without hardware.
"""

import io
import threading
import time
import wave
from collections.abc import Callable
from dataclasses import dataclass

import numpy as np
import sounddevice as sd

from app.services import audio_store

MAX_RECORDING_SECONDS = 120.0
REQUEST_SAMPLE_RATE = 16000  # WASAPI shared mode performs the rate conversion


class RecorderError(Exception):
    """Base class for recorder failures with HTTP-mappable semantics."""


class RecordingBusyError(RecorderError):
    """Another session is already active."""


class NoActiveRecordingError(RecorderError):
    """Stop/cancel was called while no session was running."""


class MicrophoneUnavailableError(RecorderError):
    """PortAudio could not open any input device (probe the message + OS settings)."""


@dataclass(frozen=True)
class RecorderResult:
    """Metadata of a finalized stored recording."""

    audio_id: str
    duration_seconds: float
    sample_rate: int
    channels: int
    size_bytes: int


@dataclass(frozen=True)
class RecordingSessionInfo:
    """Facts about a session immediately after it starts."""

    sample_rate: int
    channels: int


class AudioStream:
    """Minimal stream interface so hardware can be faked in tests."""

    samplerate: int
    channels: int

    def start(self) -> None:
        raise NotImplementedError

    def stop(self) -> None:
        raise NotImplementedError

    def close(self) -> None:
        raise NotImplementedError


def _default_stream_factory(
    callback: sd.Callback,
    samplerate: int,
    channels: int,
) -> AudioStream:
    return sd.InputStream(  # type: ignore[return-value]
        samplerate=samplerate,
        channels=channels,
        dtype="float32",
        callback=callback,
    )


def _to_wav_bytes(samples: np.ndarray, sample_rate: int) -> bytes:
    """Convert float32 mono samples into a 16-bit PCM WAV byte string."""
    pcm = np.clip(samples, -1.0, 1.0)
    pcm = (pcm * 32767).astype(np.int16)
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(pcm.tobytes())
    return buffer.getvalue()


class MicrophoneRecorder:
    def __init__(
        self,
        stream_factory: Callable[[sd.Callback, int, int], AudioStream] | None = None,
    ) -> None:
        self._stream_factory = stream_factory or _default_stream_factory
        self._lock = threading.Lock()
        self._stream: AudioStream | None = None
        self._chunks: list[np.ndarray] = []
        self._state = "idle"  # idle | recording | stopping
        self._sample_rate = REQUEST_SAMPLE_RATE
        self._channels = 1
        self._auto_stop_timer: threading.Timer | None = None
        self._auto_result: RecorderResult | None = None

    @property
    def state(self) -> str:
        return self._state

    def start(self) -> RecordingSessionInfo:
        with self._lock:
            if self._state != "idle":
                raise RecordingBusyError("A recording session is already active.")
            self._chunks = []
            self._auto_result = None
            try:
                # Two failure shapes: PortAudioError for device problems,
                # OSError for driver/backend problems. Both mean "no mic".
                self._stream = self._stream_factory(
                    self._on_audio, self._sample_rate, self._channels
                )
                self._stream.start()
            except (sd.PortAudioError, OSError) as exc:
                self._stream = None
                raise MicrophoneUnavailableError(
                    f"No microphone could be opened ({exc}). "
                    "Check Windows microphone privacy settings."
                ) from exc
            self._state = "recording"
            self._auto_stop_timer = threading.Timer(MAX_RECORDING_SECONDS, self._auto_stop)
            self._auto_stop_timer.daemon = True
            self._auto_stop_timer.start()
            return RecordingSessionInfo(
                sample_rate=self._stream.samplerate,
                channels=self._stream.channels,
            )

    def stop(self) -> RecorderResult:
        with self._lock:
            # Auto-stop may have fired between the user clicking "Stop" and
            # this request arriving; the finished result is still valid.
            if self._auto_result is not None:
                return self._auto_result
            if self._state != "recording":
                raise NoActiveRecordingError("No recording session is active.")
            return self._finish_locked()

    def cancel(self) -> None:
        with self._lock:
            if self._state == "recording":
                self._cleanup_locked()
            elif self._auto_result is not None:
                # Cancel after auto-stop: discard the stored file to honor intent.
                try:
                    audio_store.path_for(self._auto_result.audio_id).unlink(missing_ok=True)
                except ValueError:
                    pass
                self._auto_result = None

    def _auto_stop(self) -> None:
        # Runs on the watchdog thread; the lock serializes with user actions.
        with self._lock:
            if self._state == "recording":
                self._auto_result = self._finish_locked()

    def _on_audio(self, indata, frames, t, status) -> None:
        """PortAudio audio thread. Copy frames out immediately under the lock.

        Runs from a PortAudio-native callback thread at high frequency, so it
        must stay tiny: append a copy, nothing else. `status` reports buffer
        overflow/underflow conditions we currently tolerate silently.
        """
        with self._lock:
            if self._state == "recording":
                # channels=1 → take column 0; copies to detach PortAudio's buffer.
                self._chunks.append(indata[:, 0].copy())

    def _cleanup_locked(self) -> None:
        stream, self._stream = self._stream, None
        self._chunks = []
        if stream is not None:
            stream.stop()
            stream.close()
        if self._auto_stop_timer is not None:
            self._auto_stop_timer.cancel()
            self._auto_stop_timer = None
        self._state = "idle"

    def _finish_locked(self) -> RecorderResult:
        stream, self._stream = self._stream, None
        chunks, self._chunks = self._chunks, []
        timer, self._auto_stop_timer = self._auto_stop_timer, None
        self._state = "stopping"
        try:
            if stream is not None:
                stream.stop()
                stream.close()
            if timer is not None:
                timer.cancel()
            audio = (
                np.concatenate(chunks) if chunks else np.zeros(1, dtype=np.float32)
            )
            wav_bytes = _to_wav_bytes(audio, self._sample_rate)
            audio_id = audio_store.save_wav(wav_bytes)
            info = audio_store.parse_wav_header(wav_bytes)
            return RecorderResult(
                audio_id=audio_id,
                duration_seconds=info.duration_seconds,
                sample_rate=info.sample_rate,
                channels=info.channels,
                size_bytes=len(wav_bytes),
            )
        finally:
            self._state = "idle"


def start_recording() -> RecordingSessionInfo:
    return _recorder.start()


def stop_recording() -> RecorderResult:
    return _recorder.stop()


def cancel_recording() -> None:
    _recorder.cancel()


_recorder = MicrophoneRecorder()
