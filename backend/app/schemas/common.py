"""Pydantic models shared by the API layer.

These models are the backend's public contract: FastAPI validates every
incoming request against them and serializes every response through them.
Any endpoint that returns a JSON body should declare a response_model.
"""

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    """Liveness data so the extension can detect a running backend."""

    status: str = "ok"
    version: str
    transcription: str = "idle"


class PingRequest(BaseModel):
    """Payload for the echo endpoint used to verify the full message chain."""

    message: str = Field(min_length=1, max_length=2000)


class PingResponse(BaseModel):
    """Echoed data proving the request reached the backend unchanged."""

    echo: str
    received_chars: int
    timestamp: float
