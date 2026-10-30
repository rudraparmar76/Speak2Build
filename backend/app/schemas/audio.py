"""Pydantic models for the audio bouquet of endpoints."""

from pydantic import BaseModel


class AudioUploadResponse(BaseModel):
    """Metadata describing a successfully stored recording."""

    audio_id: str
    duration_seconds: float
    sample_rate: int
    channels: int
    size_bytes: int
