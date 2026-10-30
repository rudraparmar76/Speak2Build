"""Temporary storage and validation for uploaded audio recordings.

Design notes:
- Files are stored in the OS temp directory under random UUID names, never
  names supplied by clients, so path traversal is impossible by construction.
- Uploaded bytes are validated with a minimal RIFF/WAVE header parser instead
  of trusting Content-Type headers, which clients can spoof.
- audio ids are opaque hex strings; `path_for()` re-validates the format to
  keep every downstream filename filesystem-safe.
"""

import re
import struct
import tempfile
import uuid
from dataclasses import dataclass
from pathlib import Path

_STORAGE_DIR = Path(tempfile.gettempdir()) / "speak2build-audio"

_AUDIO_ID_PATTERN = re.compile(r"^[0-9a-f]{32}$")


@dataclass(frozen=True)
class WavInfo:
    """Technical metadata parsed from a canonical PCM WAV file."""

    channels: int
    sample_rate: int
    duration_seconds: float


def parse_wav_header(data: bytes) -> WavInfo:
    """Validate that `data` is a well-formed uncompressed PCM WAV file.

    Walks the RIFF chunk list and checks the `fmt ` and `data` chunks.
    Raises ValueError with a readable reason on any structural problem.
    """
    if len(data) < 44:
        raise ValueError("file too short to be a WAV")

    if data[0:4] != b"RIFF" or data[8:12] != b"WAVE":
        raise ValueError("missing RIFF/WAVE identifiers")

    fmt: tuple[int, int, int, int, int, int] | None = None
    pos = 12  # skip past "RIFF" header and "WAVE" tag (12 bytes)
    while pos + 8 <= len(data):
        chunk_id = data[pos : pos + 4]
        (chunk_size,) = struct.unpack("<I", data[pos + 4 : pos + 8])

        if chunk_id == b"fmt " and chunk_size >= 16 and fmt is None:
            fmt = struct.unpack("<HHIIHH", data[pos + 8 : pos + 24])
        elif chunk_id == b"data":
            if fmt is None:
                raise ValueError("data chunk appears before fmt chunk")
            audio_format, channels, _sample_rate, byte_rate, _block_align, bits = fmt
            if audio_format != 1:
                raise ValueError(f"fmt declares format {audio_format}, not uncompressed PCM (1)")
            if channels < 1 or channels > 8:
                raise ValueError(f"implausible channel count {channels}")
            if bits != 16:
                raise ValueError(f"expected 16-bit samples, found {bits}")
            if byte_rate <= 0 or chunk_size == 0:
                raise ValueError("empty or malformed audio data")
            return WavInfo(
                channels=channels,
                sample_rate=_sample_rate,
                duration_seconds=chunk_size / byte_rate,
            )

        # RIFF chunks are word-aligned: odd sizes carry one padding byte.
        pos += 8 + chunk_size + (chunk_size % 2)

    raise ValueError("data chunk not found")


def save_wav(data: bytes) -> str:
    """Persist WAV bytes under a random UUID filename and return the id."""
    _STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    audio_id = uuid.uuid4().hex
    (_STORAGE_DIR / f"{audio_id}.wav").write_bytes(data)
    return audio_id


def path_for(audio_id: str) -> Path:
    """Resolve an audio id to its stored file path (used from M2 onward)."""
    if not _AUDIO_ID_PATTERN.fullmatch(audio_id):
        raise ValueError("malformed audio id")
    return _STORAGE_DIR / f"{audio_id}.wav"
