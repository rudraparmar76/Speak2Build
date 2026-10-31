"""Tests for POST /api/transcribe against a fake transcription service.

The real faster-whisper model is exercised separately (manual live probe):
unit tests here verify routing, validation, state handling, and the
audio_id → file → response contract.
"""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import audio_store, transcription
from tests.test_audio import make_wav_bytes

client = TestClient(app)


@pytest.fixture
def fake_ready_service(monkeypatch: pytest.MonkeyPatch):
    """Swap in a canned transcription result at the service boundary."""

    def fake_transcribe(path):
        return transcription.Transcription(
            language="en",
            duration_seconds=1.5,
            processing_seconds=0.2,
            segments=[
                transcription.Segment(start=0.0, end=1.4, text="hello world from the test"),
            ],
        )

    monkeypatch.setattr(transcription_service_module(), "transcribe", fake_transcribe)


def transcription_service_module():
    from app.api import routes

    return routes.transcription_service


def store_wav() -> str:
    return audio_store.save_wav(make_wav_bytes(1.5))


def test_transcribe_returns_text_and_segments(fake_ready_service):
    audio_id = store_wav()
    try:
        response = client.post("/api/transcribe", json={"audio_id": audio_id})
        assert response.status_code == 200
        body = response.json()
        assert body["audio_id"] == audio_id
        assert body["language"] == "en"
        assert body["text"] == "hello world from the test"
        assert body["segments"] == [
            {"start": 0.0, "end": 1.4, "text": "hello world from the test"}
        ]
        assert body["duration_seconds"] == 1.5
    finally:
        audio_store.path_for(audio_id).unlink(missing_ok=True)


def test_transcribe_joins_multiple_segments(fake_ready_service, monkeypatch):
    def multi(path):
        return transcription.Transcription(
            language="en",
            duration_seconds=3.0,
            processing_seconds=0.2,
            segments=[
                transcription.Segment(0.0, 1.4, "create a function"),
                transcription.Segment(1.4, 2.9, "that validates email"),
            ],
        )

    recording_service = transcription_service_module()
    monkeypatch.setattr(recording_service, "transcribe", multi)

    audio_id = store_wav()
    try:
        response = client.post("/api/transcribe", json={"audio_id": audio_id})
        assert response.json()["text"] == "create a function that validates email"
        assert len(response.json()["segments"]) == 2
    finally:
        audio_store.path_for(audio_id).unlink(missing_ok=True)


def test_transcribe_unknown_recording_returns_404(fake_ready_service):
    response = client.post("/api/transcribe", json={"audio_id": "0" * 32})
    assert response.status_code == 404
    assert "Record again" in response.json()["detail"]


def test_transcribe_rejects_malformed_audio_id():
    # Pydantic pattern enforces the UUID-hex shape before routing logic runs.
    response = client.post("/api/transcribe", json={"audio_id": "../../etc/passwd"})
    assert response.status_code == 422


def test_transcribe_when_model_not_ready_returns_503(monkeypatch):
    recording_service = transcription_service_module()

    def unavailable(path):
        raise transcription.TranscriptionUnavailableError("loading")

    monkeypatch.setattr(recording_service, "transcribe", unavailable)
    audio_id = store_wav()
    try:
        response = client.post("/api/transcribe", json={"audio_id": audio_id})
        assert response.status_code == 503
        assert "not ready" in response.json()["detail"]
    finally:
        audio_store.path_for(audio_id).unlink(missing_ok=True)
