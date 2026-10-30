"""Tests for the /api/audio upload endpoint."""

import io
import wave
from pathlib import Path

from fastapi.testclient import TestClient

from app.api.routes import MAX_AUDIO_SIZE_BYTES
from app.main import app
from app.services.audio_store import path_for

client = TestClient(app)


def make_wav_bytes(duration_s: float = 1.0, rate: int = 16000) -> bytes:
    """Build a minimal valid 16-bit mono WAV using the stdlib wave module."""
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(rate)
        wav.writeframes(b"\x00\x00" * int(rate * duration_s))
    return buffer.getvalue()


def test_upload_wav_returns_metadata_and_stores_file():
    payload = make_wav_bytes(duration_s=1.5)
    response = client.post("/api/audio", content=payload, headers={"Content-Type": "audio/wav"})

    assert response.status_code == 201
    body = response.json()
    assert body["duration_seconds"] == 1.5
    assert body["sample_rate"] == 16000
    assert body["channels"] == 1
    assert body["size_bytes"] == len(payload)

    stored: Path = path_for(body["audio_id"])
    try:
        assert stored.exists()
        assert stored.read_bytes() == payload
    finally:
        stored.unlink(missing_ok=True)


def test_upload_rejects_non_wav_payload():
    response = client.post("/api/audio", content=b"definitely not a wav", headers={"Content-Type": "audio/wav"})
    assert response.status_code == 415


def test_upload_rejects_empty_payload():
    response = client.post("/api/audio", content=b"", headers={"Content-Type": "audio/wav"})
    assert response.status_code == 400


def test_upload_rejects_oversized_payload():
    oversized = b"\x00" * (MAX_AUDIO_SIZE_BYTES + 1)
    response = client.post("/api/audio", content=oversized, headers={"Content-Type": "audio/wav"})
    assert response.status_code == 413


def test_parse_wav_header_rejects_compressed_formats():
    from app.services.audio_store import parse_wav_header

    with_tests_marked = bytearray(make_wav_bytes())
    # fmt chunk: audio_format member lives 20 bytes into the file; set it to 85 (MP3-style ID)
    with_tests_marked[20:22] = (85).to_bytes(2, "little")
    try:
        import pytest

        with pytest.raises(ValueError):
            parse_wav_header(bytes(with_tests_marked))
    finally:
        pass
