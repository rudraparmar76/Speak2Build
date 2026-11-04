"""
Always-listening VAD (Voice Activity Detection) service using Silero VAD.

States:
  - disabled: microphone is closed
  - listening: microphone is active, monitoring for voice onset
  - recording: user is speaking, audio is being captured
  - captured: utterance finished and stored in audio_store; ready for processing
  - paused: temporarily paused (e.g. while TTS is speaking)
"""

import collections
import io
import threading
import time
import wave
from collections.abc import Callable
from typing import Optional

import numpy as np
import sounddevice as sd
import torch

try:
    from app.services import audio_store
except ImportError:
    from backend.app.services import audio_store

SAMPLE_RATE = 16000
CHANNELS = 1
CHUNK_SAMPLES = 512  # 32 ms at 16 kHz - required chunk size for Silero VAD
DTYPE = "float32"

_VAD_THRESHOLD = 0.5
_MIN_SILENCE_MS = 1200       # 1.2s silence ends utterance
_SPEECH_PAD_MS = 100         # 100ms padding
_MIN_SPEECH_SECONDS = 0.5    # Ignore blips under 0.5s
_MAX_SPEECH_SECONDS = 120.0  # Safety cap
_PRE_ROLL_CHUNKS = 8         # ~256ms pre-roll to prevent clipping start of speech


def _to_wav_bytes(samples: np.ndarray, sample_rate: int = SAMPLE_RATE) -> bytes:
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


class VadListener:
    """Singleton service for always-listening hands-free voice interaction."""

    def __init__(self, *, stream_factory=None):
        self._lock = threading.Lock()
        self._state: str = "disabled"
        self._stream: sd.InputStream | None = None
        self._stream_factory = stream_factory or self._default_stream_factory

        # Silero VAD
        self._model = None
        self._iterator = None

        # Audio buffers
        self._ring_buffer = collections.deque(maxlen=_PRE_ROLL_CHUNKS)
        self._chunks: list[np.ndarray] = []
        self._speech_start_time: float = 0.0

        # Captured result
        self._captured_audio_id: Optional[str] = None
        self._capture_duration: float = 0.0
        self._was_paused: bool = False

    def _default_stream_factory(self, callback):
        return sd.InputStream(
            samplerate=SAMPLE_RATE,
            channels=CHANNELS,
            dtype=DTYPE,
            blocksize=CHUNK_SAMPLES,
            callback=callback,
        )

    def _ensure_model(self):
        if self._model is not None:
            return
        from silero_vad import load_silero_vad, VADIterator
        self._model = load_silero_vad(onnx=True)
        self._iterator = VADIterator(
            self._model,
            threshold=_VAD_THRESHOLD,
            sampling_rate=SAMPLE_RATE,
            min_silence_duration_ms=_MIN_SILENCE_MS,
            speech_pad_ms=_SPEECH_PAD_MS,
        )

    def enable(self) -> dict:
        """Start always-listening mode."""
        with self._lock:
            if self._state not in ("disabled",):
                return {"status": "already_enabled", "state": self._state}
            self._ensure_model()
            self._chunks = []
            self._ring_buffer.clear()
            self._captured_audio_id = None
            self._capture_duration = 0.0
            if self._iterator is not None:
                self._iterator.reset_states()
            try:
                self._stream = self._stream_factory(self._on_audio)
                self._stream.start()
                self._state = "listening"
                return {"status": "enabled", "state": "listening"}
            except Exception as exc:
                self._state = "disabled"
                self._stream = None
                return {"status": "error", "message": str(exc)}

    def disable(self) -> dict:
        """Stop always-listening mode and release microphone."""
        with self._lock:
            if self._state == "disabled":
                return {"status": "already_disabled", "state": "disabled"}
            self._state = "disabled"
            stream = self._stream
            self._stream = None

        if stream:
            try:
                stream.stop()
                stream.close()
            except Exception:
                pass

        with self._lock:
            self._chunks = []
            self._ring_buffer.clear()
            self._captured_audio_id = None
            self._capture_duration = 0.0
            if self._iterator is not None:
                self._iterator.reset_states()
        return {"status": "disabled", "state": "disabled"}

    def pause(self) -> dict:
        """Temporarily pause listening (e.g. while TTS is active)."""
        with self._lock:
            if self._state in ("listening", "recording"):
                self._state = "paused"
                if self._iterator is not None:
                    self._iterator.reset_states()
                return {"status": "paused", "state": "paused"}
            return {"status": "ignored", "state": self._state}

    def resume(self) -> dict:
        """Resume listening after temporary pause."""
        with self._lock:
            if self._state == "paused":
                self._state = "listening"
                self._chunks = []
                self._ring_buffer.clear()
                if self._iterator is not None:
                    self._iterator.reset_states()
                return {"status": "resumed", "state": "listening"}
            return {"status": "ignored", "state": self._state}

    def status(self) -> dict:
        """Get current status of VAD listener."""
        with self._lock:
            return {
                "enabled": self._state != "disabled",
                "state": self._state,
                "audio_id": self._captured_audio_id,
                "duration_seconds": round(self._capture_duration, 2),
            }

    def consume_capture(self) -> Optional[str]:
        """Retrieve captured audio_id and return listener to 'listening' state."""
        with self._lock:
            if self._captured_audio_id is None:
                return None
            aid = self._captured_audio_id
            self._captured_audio_id = None
            self._capture_duration = 0.0
            self._chunks = []
            self._ring_buffer.clear()
            if self._state == "captured":
                self._state = "listening"
            if self._iterator is not None:
                self._iterator.reset_states()
            return aid

    def _on_audio(self, indata: np.ndarray, frames, time_info, status):
        """Audio callback from sounddevice thread."""
        chunk = indata[:, 0].copy()

        with self._lock:
            state = self._state

        if state not in ("listening", "recording"):
            return

        chunk_tensor = torch.from_numpy(chunk)
        vad_result = self._iterator(chunk_tensor)

        with self._lock:
            if self._state == "listening":
                self._ring_buffer.append(chunk)
                if vad_result is not None and "start" in vad_result:
                    # Speech onset detected!
                    self._state = "recording"
                    self._chunks = list(self._ring_buffer)
                    self._ring_buffer.clear()
                    self._speech_start_time = time.time()

            elif self._state == "recording":
                self._chunks.append(chunk)
                elapsed = time.time() - self._speech_start_time

                if vad_result is not None and "end" in vad_result:
                    # Silence detected after speech
                    if elapsed >= _MIN_SPEECH_SECONDS:
                        self._capture_duration = elapsed
                        threading.Thread(target=self._finalize_recording, daemon=True).start()
                    else:
                        # Too short - noise discard
                        self._state = "listening"
                        self._chunks = []
                        if self._iterator is not None:
                            self._iterator.reset_states()

                elif elapsed >= _MAX_SPEECH_SECONDS:
                    # Hit maximum recording limit
                    self._capture_duration = elapsed
                    threading.Thread(target=self._finalize_recording, daemon=True).start()

    def _finalize_recording(self):
        """Build WAV from recorded chunks and persist in audio store."""
        with self._lock:
            if self._state != "recording":
                return
            self._state = "captured"
            if not self._chunks:
                self._state = "listening"
                return
            all_samples = np.concatenate(self._chunks)

        wav_bytes = _to_wav_bytes(all_samples, SAMPLE_RATE)
        audio_id = audio_store.save_wav(wav_bytes)

        with self._lock:
            self._captured_audio_id = audio_id


# Process-global singleton
_vad_listener = VadListener()


def get_vad_listener() -> VadListener:
    return _vad_listener


def enable_auto_listen() -> dict:
    return _vad_listener.enable()


def disable_auto_listen() -> dict:
    return _vad_listener.disable()


def pause_auto_listen() -> dict:
    return _vad_listener.pause()


def resume_auto_listen() -> dict:
    return _vad_listener.resume()


def auto_listen_status() -> dict:
    return _vad_listener.status()


def consume_auto_listen_capture() -> Optional[str]:
    return _vad_listener.consume_capture()
