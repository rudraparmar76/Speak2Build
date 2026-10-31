"""Pydantic models for the audio endpoints."""

from pydantic import BaseModel


class AudioUploadResponse(BaseModel):
    """Metadata describing a successfully stored recording."""

    audio_id: str
    duration_seconds: float
    sample_rate: int
    channels: int
    size_bytes: int


class RecordingStartResponse(BaseModel):
    """Technical facts about a recording session that just started."""

    sample_rate: int
    channels: int
