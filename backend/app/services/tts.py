"""Backend-owned loudspeakers (text-to-speech playback).

Why here, same reason as the microphone in `recorder.py`: webviews are
sandboxed iframes with a restrictive permissions policy, while the backend is
an ordinary desktop process allowed to open audio output devices.

Design:
- Synthesis uses Microsoft's free Edge neural voices (`edge-tts`, network
  call). The result is an MP3 stream, decoded by PyAV (`av`, already a
  faster-whisper dependency) into float32 PCM.
- Playback uses the PortAudio default output device through `sounddevice`'s
  play/stop pair — `sd.play()` drives playback on PortAudio's own thread and
  returns immediately, so HTTP requests never wait for the utterance to end.
- One speaker, one active utterance: starting a new utterance stops whatever
  was still playing (mirrors the single recording-session rule).
- Synthesis and playback are injectable so tests need neither the network
  nor a sound card.
"""

import asyncio
import io
import os
import threading
from collections.abc import Callable
from dataclasses import dataclass

import av
import numpy as np
import sounddevice as sd

from app.services import recorder, voice_local

VOICE_ENV = "SPEAK2BUILD_TTS_VOICE"
RATE_ENV = "SPEAK2BUILD_TTS_RATE"
ENGINE_ENV = voice_local.ENGINE_ENV  # "piper" (default) | "edge"

DEFAULT_VOICE = "en-US-AndrewNeural"
DEFAULT_RATE = "+0%"

MAX_TEXT_CHARS = 2000

_RATE_PATTERN = r"^[+-]\d{1,3}%$"


class TTSError(Exception):
    """Base class for speaker failures with HTTP-mappable semantics."""


class SynthesisError(TTSError):
    """The voice provider rejected the request or returned no audio."""


class PlaybackUnavailableError(TTSError):
    """PortAudio could not open any output device."""


@dataclass(frozen=True)
class SpeakResult:
    """Facts about a started utterance."""

    characters: int
    duration_seconds: float
    sample_rate: int
    voice: str
    rate: str
    engine: str = "piper"


def current_voice() -> tuple[str, str]:
    """Resolve (voice, rate) from the environment with package defaults."""
    voice = os.environ.get(VOICE_ENV, "").strip() or DEFAULT_VOICE
    rate = os.environ.get(RATE_ENV, "").strip() or DEFAULT_RATE
    return voice, rate


async def _edge_synthesize(text: str, voice: str, rate: str) -> bytes:
    """Collect the MP3 stream produced by edge-tts for one utterance."""
    import edge_tts  # deferred: keeps import cost off health checks

    communicate = edge_tts.Communicate(text, voice, rate=rate)
    chunks: list[bytes] = []
    try:
        async for part in communicate.stream():
            if part.get("type") == "audio":
                chunks.append(part["data"])  # type: ignore[union-attr]
    except Exception as exc:  # noqa: BLE001 - unify provider errors
        raise SynthesisError(f"voice provider rejected the request: {exc}") from exc
    data = b"".join(chunks)
    if not data:
        raise SynthesisError("voice provider returned no audio")
    return data


async def _hybrid_synthesize(text: str, voice: str, rate: str) -> bytes | tuple[np.ndarray, int]:
    """Engine selector: local Piper first, cloud edge-tts as fallback.

    'piper' (default): fully offline, ~0.5–1 s synthesis. Any failure
    (engine missing, voice not downloaded, ONNX error) silently falls back to
    edge-tts so the user hears a response either way.
    'edge': force the cloud engine, e.g. to compare voices.
    """
    engine = (os.environ.get(ENGINE_ENV) or "piper").strip().lower()
    if engine != "edge":
        try:
            return await voice_local.synthesize_local_async(text, rate=rate)
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001 - local engine is best-effort
            pass
    return await _edge_synthesize(text, voice, rate)


def _default_decode(mp3_bytes: bytes) -> tuple[np.ndarray, int]:
    """Decode MP3 into mono float32 samples in [-1.0, 1.0] plus sample rate."""
    try:
        container = av.open(io.BytesIO(mp3_bytes))
        stream = container.streams.audio[0]
        chunks: list[np.ndarray] = []
        for frame in container.decode(stream):
            chunk = frame.to_ndarray()
            if chunk.ndim == 2:  # (channels, samples) → mono
                chunk = chunk.mean(axis=0)
            chunks.append(chunk.reshape(-1))
        rate = int(stream.rate or 24000)
        container.close()
    except Exception as exc:  # noqa: BLE001
        raise SynthesisError(f"could not decode synthesized audio: {exc}") from exc
    if not chunks:
        raise SynthesisError("synthesized audio contained no decodable frames")
    samples = np.concatenate(chunks)
    if samples.dtype != np.float32:
        samples = samples.astype(np.float32)
        peak = float(np.max(np.abs(samples))) if samples.size else 1.0
        if peak > 1.0:
            samples = samples / peak / 2.0  # int-family scaling heuristic
    return samples, rate


class PlaybackController:
    """Thin seam over `sounddevice.play/stop` so tests can fake the hardware."""

    def play(self, samples: np.ndarray, samplerate: int) -> None:
        try:
            sd.play(samples, samplerate)
        except Exception as exc:  # noqa: BLE001
            raise PlaybackUnavailableError(f"no usable audio output device: {exc}") from exc

    def stop(self) -> None:
        try:
            sd.stop()
        except Exception:  # noqa: BLE001
            pass


class VoiceSpeaker:
    """Process-global singleton: one utterance at a time, cancellable."""

    def __init__(
        self,
        synthesizer=None,
        decode=None,
        playback: PlaybackController | None = None,
        barge_in_starter: Callable[[Callable[[], None]], bool] | None = None,
        barge_in_stopper: Callable[[], None] | None = None,
    ) -> None:
        self._synthesize = synthesizer or _hybrid_synthesize
        self._decode = decode or _default_decode
        self._playback = playback or PlaybackController()
        self._explicit_barge_in = barge_in_starter is not None
        self._barge_in_starter = barge_in_starter if barge_in_starter is not None else recorder.start_barge_in
        self._barge_in_stopper = barge_in_stopper if barge_in_stopper is not None else recorder.stop_barge_in
        self._lock = threading.Lock()
        self._utterance_counter = 0
        self._barge_in_timer: threading.Timer | None = None

    def stop(self) -> bool:
        with self._lock:
            was_playing = self._utterance_counter > 0
            self._utterance_counter = 0
            if self._barge_in_timer is not None:
                self._barge_in_timer.cancel()
                self._barge_in_timer = None
        self._playback.stop()
        try:
            from app.services import vad_listener
            threading.Timer(0.3, vad_listener.resume_auto_listen).start()
        except Exception:
            pass
        try:
            self._barge_in_stopper()
        except Exception:
            pass
        return was_playing

    async def speak(self, text: str, voice: str | None = None, rate: str | None = None) -> SpeakResult:
        """Synthesize then start non-blocking playback of one utterance.

        `stop()` from any concurrent request cancels whatever is playing;
        starting a new utterance also cancels the previous one implicitly.
        """
        resolved_voice, env_rate = current_voice()
        resolved_voice = voice or resolved_voice
        resolved_rate = rate or env_rate

        with self._lock:
            self._utterance_counter += 1
            if self._barge_in_timer is not None:
                self._barge_in_timer.cancel()
                self._barge_in_timer = None

        try:
            self._barge_in_stopper()
        except Exception:
            pass

        # Synthesis: local Piper returns (samples, rate) directly; the cloud
        # engine returns MP3 bytes that still need decoding.
        synth_result = await self._synthesize(text, resolved_voice, resolved_rate)
        used_engine = "edge"
        if isinstance(synth_result, tuple):
            samples, samplerate = synth_result
            used_engine = "piper"
            resolved_voice = f"piper:{voice_local.resolve_voice_name()}"
        else:
            samples, samplerate = await asyncio.to_thread(self._decode, synth_result)

        # Non-blocking: PortAudio drives playback on its own thread.
        self._playback.play(samples, samplerate)

        # Pause always-listening VAD during playback to prevent laptop speaker feedback
        try:
            from app.services import vad_listener
            vad_listener.pause_auto_listen()
            dur = (len(samples) / samplerate) if samplerate else 1.0
            vad_timer = threading.Timer(dur + 0.6, vad_listener.resume_auto_listen)
            vad_timer.daemon = True
            vad_timer.start()
        except Exception:
            pass

        # Barge-in: only start if enabled via SPEAK2BUILD_BARGE_IN to prevent speaker feedback loop
        enable_barge_in = self._explicit_barge_in or os.environ.get("SPEAK2BUILD_BARGE_IN", "0").lower() in ("1", "true", "yes")
        if enable_barge_in:
            def _on_barge_in() -> None:
                with self._lock:
                    self._utterance_counter = 0
                self._playback.stop()
                try:
                    from app.services import vad_listener
                    threading.Timer(0.3, vad_listener.resume_auto_listen).start()
                except Exception:
                    pass

            try:
                started = self._barge_in_starter(_on_barge_in)
                if started:
                    duration = (len(samples) / samplerate) if samplerate else 1.0
                    timer = threading.Timer(duration + 0.4, self._barge_in_stopper)
                    timer.daemon = True
                    with self._lock:
                        self._barge_in_timer = timer
                    timer.start()
            except Exception:
                pass

        return SpeakResult(
            characters=len(text),
            duration_seconds=round(len(samples) / samplerate, 2) if samplerate else 0.0,
            sample_rate=samplerate,
            voice=resolved_voice,
            rate=resolved_rate,
            engine=used_engine,
        )


speaker = VoiceSpeaker()


async def speak(text: str, voice: str | None = None, rate: str | None = None) -> SpeakResult:
    """Module-level entry point: play one utterance (swaps any current one)."""
    return await speaker.speak(text, voice, rate)


def stop() -> bool:
    """Module-level entry point: cancel current playback."""
    return speaker.stop()


__all__ = [
    "TTSError",
    "SynthesisError",
    "PlaybackUnavailableError",
    "SpeakResult",
    "PlaybackController",
    "VoiceSpeaker",
    "speaker",
    "current_voice",
    "MAX_TEXT_CHARS",
    "DEFAULT_VOICE",
    "VOICE_ENV",
    "RATE_ENV",
    "ENGINE_ENV",
]
