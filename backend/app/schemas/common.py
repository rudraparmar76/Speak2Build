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


class LLMConfigRequest(BaseModel):
    """LLM provider configuration pushed from the VS Code extension settings."""

    base_url: str = Field(default="", max_length=500)
    model: str = Field(default="", max_length=200)
    api_key: str = Field(default="", max_length=500)
    timeout: int = Field(default=120, ge=10, le=600)


class LLMConfigResponse(BaseModel):
    """Current LLM configuration (key masked)."""

    base_url: str
    model: str
    has_api_key: bool
    timeout: int
    configured: bool


class LLMTestRequest(BaseModel):
    """Payload to test LLM credentials via a quick ping."""

    base_url: str = Field(min_length=1, max_length=500)
    model: str = Field(min_length=1, max_length=200)
    api_key: str = Field(default="", max_length=500)
    timeout: int = Field(default=15, ge=3, le=60)


class LLMTestResponse(BaseModel):
    """Validation test outcome."""

    valid: bool
    message: str
    latency_ms: float = 0.0
