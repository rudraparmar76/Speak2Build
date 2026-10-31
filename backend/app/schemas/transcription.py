"""Pydantic models for transcription requests and responses."""

from pydantic import BaseModel, Field


class TranscribeRequest(BaseModel):
    """Reference to a previously stored recording (never raw audio bytes)."""

    audio_id: str = Field(pattern=r"^[0-9a-f]{32}$")


class TranscriptSegment(BaseModel):
    start: float
    end: float
    text: str


class TranscriptionResponse(BaseModel):
    audio_id: str
    language: str | None
    duration_seconds: float
    processing_seconds: float
    text: str
    segments: list[TranscriptSegment]
