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


class BargeInStatusResponse(BaseModel):
    """Current state of voice barge-in monitoring / active recording."""

    barge_in_active: bool
    barge_in_triggered: bool
    state: str
    auto_audio_id: str | None = None
    duration_seconds: float = 0.0
