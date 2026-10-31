"""Speech-to-text service using faster-whisper (CTranslate2 runtime).

Design decisions:
- The model is warm-loaded in a background thread so the HTTP service starts
  instantly, and the first transcription doesn't pay the multi-second model
  load (and possible one-time download) inline.
- Model/device/compute are env-configurable (quality vs speed vs memory is a
  deployment decision, not a code change).
- Readiness is a state machine (idle → loading → ready | error) exposed via
  /api/health so the sidebar and operators can see warm-up progress.
- Whisper's import is done inside the loader thread: importing
  faster_whisper pulls ctranslate2/av/tokenizers, and keeping it off the API
  boot path keeps server startup fast even before deps are exercised.
- Tests disable warm-up via SPEAK2BUILD_ENABLE_MODEL_LOAD=0 (conftest) and
  inject fake services at the route layer.
"""

import os
import threading
import time
from dataclasses import dataclass
from pathlib import Path

MODEL_NAME_ENV = "SPEAK2BUILD_WHISPER_MODEL"
DEVICE_ENV = "SPEAK2BUILD_WHISPER_DEVICE"
COMPUTE_TYPE_ENV = "SPEAK2BUILD_WHISPER_COMPUTE_TYPE"
ENABLE_LOAD_ENV = "SPEAK2BUILD_ENABLE_MODEL_LOAD"

DEFAULT_MODEL = "small"
DEFAULT_DEVICE = "cpu"
DEFAULT_COMPUTE_TYPE = "int8"

_AUTOLOAD_DISABLED_VALUES = {"0", "false", "off", "no"}


class TranscriptionUnavailableError(Exception):
    """The model is loading, failed, or was disabled — nothing to call."""

    def __init__(self, state: str, detail: str = "") -> None:
        message = f"Transcription model not ready (state={state}"
        if detail:
            message += f", error: {detail}"
        message += ")"
        super().__init__(message)


@dataclass(frozen=True)
class Segment:
    """One timestamped text piece, exactly as faster-whisper reports it."""

    start: float
    end: float
    text: str


@dataclass(frozen=True)
class Transcription:
    language: str | None
    duration_seconds: float
    processing_seconds: float
    segments: list[Segment]


class TranscriptionService:
    """Owns exactly one Whisper model instance and its lifecycle."""

    def __init__(self, model_name: str, device: str, compute_type: str) -> None:
        self._model_name = model_name
        self._device = device
        self._compute_type = compute_type
        self._lock = threading.Lock()
        self._state = "idle"
        self._error: str | None = None
        self._model = None

    @property
    def state(self) -> str:
        return self._state

    @property
    def error(self) -> str | None:
        return self._error

    def request_warmup(self) -> None:
        """Kick off background loading exactly once (idempotent)."""
        with self._lock:
            if self._state != "idle":
                return
            if os.environ.get(ENABLE_LOAD_ENV, "1").lower() in _AUTOLOAD_DISABLED_VALUES:
                return
            self._state = "loading"
        thread = threading.Thread(target=self._warm_up, daemon=True, name="whisper-warmup")
        thread.start()

    def _warm_up(self) -> None:
        try:
            from faster_whisper import WhisperModel

            model = WhisperModel(
                self._model_name,
                device=self._device,
                compute_type=self._compute_type,
            )
            self._model = model
            with self._lock:
                self._state = "ready"
                self._error = None
        except Exception as exc:  # download failure, CPU init, bad model name…
            # Keep the service alive: transcribe() will report this state as 503.
            with self._lock:
                self._state = "error"
                self._error = str(exc)

    def transcribe(self, path: Path) -> Transcription:
        model = self._model
        state = self._state
        if state != "ready" or model is None:
            raise TranscriptionUnavailableError(state, self._error or "")

        started = time.monotonic()
        # vad_filter off for MVP: faster-whisper's voice-activity detection
        # trims silence but adds an Ort dependency we haven't decided to carry.
        raw_segments, info = model.transcribe(str(path), vad_filter=False)
        segments = [
            Segment(start=seg.start, end=seg.end, text=seg.text.strip())
            for seg in raw_segments
            if seg.text.strip()
        ]
        return Transcription(
            language=info.language,
            duration_seconds=info.duration,
            processing_seconds=time.monotonic() - started,
            segments=segments,
        )


def _env(name: str, default: str) -> str:
    """Read an env var, treating empty strings as unset."""
    return os.environ.get(name) or default


service = TranscriptionService(
    model_name=_env(MODEL_NAME_ENV, DEFAULT_MODEL),
    device=_env(DEVICE_ENV, DEFAULT_DEVICE),
    compute_type=_env(COMPUTE_TYPE_ENV, DEFAULT_COMPUTE_TYPE),
)


def request_warmup() -> None:
    """Module-level entry point used by routes (delegates to the singleton).

    Module-level functions keep the route layer decoupled from how and where
    the service instance lives — and give tests a single patch point.
    """
    service.request_warmup()


def state() -> str:
    """Current readiness state of the model (idle/loading/ready/error)."""
    return service.state


def transcribe(path: Path) -> Transcription:
    return service.transcribe(path)
