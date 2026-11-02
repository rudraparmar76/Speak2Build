"""Local neural TTS engine: Microsoft-free speech, powered by Piper.

Piper 1.8 (piper-tts pip package) runs a VITS voice model exported to ONNX on
plain CPU — no PyTorch, no espeak server, no network. The voice files are
downloaded once from Hugging Face and cached under `backend/models/piper/`.

Why not Kokoro: Kokoro's quality edge requires PyTorch, which does not install
cleanly on Python 3.14 and drags in a ~2 GB dependency. Piper meets the same
product goals (offline, deployment-safe, sub-second synthesis) at a fraction
of the weight.

Contract with `tts.py`:
- `synthesize_local(text) -> (float32 samples, sample_rate)` — returns decoded
  audio directly (no MP3 decode step needed).
- Raises on any failure; the hybrid selector in tts.py falls back to the
  edge-tts cloud engine so the user never hears silence.
"""

import asyncio
import io
import os
import subprocess
import sys
import threading
import wave
from pathlib import Path

import numpy as np

ENGINE_ENV = "SPEAK2BUILD_TTS_ENGINE"  # "piper" (default) | "edge"
PIPER_VOICE_ENV = "SPEAK2BUILD_TTS_PIPER_VOICE"
DEFAULT_PIPER_VOICE = "en_US-lessac-medium"
DOWNLOAD_TIMEOUT_SECONDS = 600

# Voice files live next to the app package: <repo>/backend/models/piper/
MODELS_DIR = Path(__file__).resolve().parents[2] / "models" / "piper"

_load_lock = threading.Lock()
_loaded_voice: tuple[str, object] | None = None


def models_dir() -> Path:
    return MODELS_DIR


def voice_files(voice_name: str) -> tuple[Path, Path]:
    onnx = MODELS_DIR / f"{voice_name}.onnx"
    config = MODELS_DIR / f"{voice_name}.onnx.json"
    return onnx, config


def _rate_to_length_scale(rate: str | None) -> float:
    """Convert '+15%' style rate into Piper's length_scale (speech speed).

    Piper's length_scale stretches phonemes: 1.0 = normal, >1 slower,
    <1 faster. A '+15%' rate means 15% faster → scale = 1 / 1.15.
    """
    raw = (rate or "+0%").strip()
    try:
        value = int(raw.rstrip("%").lstrip("+-") or 0)
    except ValueError:
        return 1.0
    if raw.startswith("-") and value > 0:
        # '-20%' means 20% slower.
        return round(1.0 + value / 100.0, 4)
    return round(1.0 / (1.0 + value / 100.0), 4)


def _download_voice_files(voice_name: str) -> None:
    """Fetch the ONNX voice + config via piper's bundled downloader."""
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    command = [
        sys.executable,
        "-m",
        "piper.download_voices",
        voice_name,
        "--download-dir",
        str(MODELS_DIR),
    ]
    result = subprocess.run(
        command,
        capture_output=True,
        text=True,
        timeout=DOWNLOAD_TIMEOUT_SECONDS,
        check=False,
    )
    onnx, config = voice_files(voice_name)
    if not (onnx.is_file() and config.is_file()):
        detail = (result.stdout or result.stderr or "").strip()[-300:]
        raise RuntimeError(
            f"could not download Piper voice '{voice_name}': {detail}"
        )


def ensure_voice_files(voice_name: str) -> tuple[Path, Path]:
    onnx, config = voice_files(voice_name)
    if not (onnx.is_file() and config.is_file()):
        _download_voice_files(voice_name)
    return onnx, config


def _load_voice(voice_name: str):
    """Load (and cache) a PiperVoice from the model directory."""
    global _loaded_voice
    with _load_lock:
        if _loaded_voice is not None and _loaded_voice[0] == voice_name:
            return _loaded_voice[1]
        from piper import PiperVoice

        onnx, _ = ensure_voice_files(voice_name)
        loaded = PiperVoice.load(str(onnx))
        _loaded_voice = (voice_name, loaded)
        return loaded


def resolve_voice_name() -> str:
    return os.environ.get(PIPER_VOICE_ENV, "").strip() or DEFAULT_PIPER_VOICE


def synthesize_local(
    text: str,
    voice_name: str | None = None,
    rate: str | None = None,
) -> tuple[np.ndarray, int]:
    """Render text with the local Piper voice.

    Returns mono float32 samples in [-1, 1]. The first call downloads the
    voice (~60 MB) and warms the ONNX session (~1 s); later calls are fast.
    """
    resolved = voice_name or resolve_voice_name()
    voice = _load_voice(resolved)

    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav_file:
        try:
            from piper import SynthesisConfig

            voice.synthesize_wav(
                text,
                wav_file,
                syn_config=SynthesisConfig(length_scale=_rate_to_length_scale(rate)),
            )
        except ImportError:
            voice.synthesize_wav(text, wav_file)

    with wave.open(io.BytesIO(buffer.getvalue()), "rb") as wav_reader:
        sample_rate = wav_reader.getframerate()
        channels = wav_reader.getnchannels()
        raw = wav_reader.readframes(wav_reader.getnframes())
        sample_width = wav_reader.getsampwidth()

    if sample_width != 2:
        raise RuntimeError(f"unexpected Piper sample width: {sample_width}")
    samples = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    if channels > 1:
        samples = samples.reshape(-1, channels).mean(axis=1)
    if samples.size == 0:
        raise RuntimeError("Piper returned no audio frames")
    return samples, sample_rate


async def synthesize_local_async(
    text: str,
    voice_name: str | None = None,
    rate: str | None = None,
) -> tuple[np.ndarray, int]:
    """Async wrapper: heavy ONNX work stays off the event loop."""
    return await asyncio.to_thread(synthesize_local, text, voice_name, rate)


__all__ = [
    "ENGINE_ENV",
    "PIPER_VOICE_ENV",
    "DEFAULT_PIPER_VOICE",
    "MODELS_DIR",
    "models_dir",
    "voice_files",
    "ensure_voice_files",
    "resolve_voice_name",
    "synthesize_local",
    "synthesize_local_async",
    "_rate_to_length_scale",
]
