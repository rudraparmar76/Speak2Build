"""HTTP endpoint definitions.

Endpoints stay thin: parse request, delegate to logic, return a response
model. Business services will be added in later milestones and called from
here, never inlined into the endpoint bodies.
"""

import time

from fastapi import APIRouter, HTTPException, Request

from app.schemas.audio import AudioUploadResponse
from app.schemas.common import HealthResponse, PingRequest, PingResponse
from app.services import audio_store

router = APIRouter()

API_VERSION = "0.1.0"

MAX_AUDIO_SIZE_BYTES = 20 * 1024 * 1024  # 20 MB ≈ 10 minutes of 16 kHz mono WAV


@router.get("/api/health", response_model=HealthResponse)
def health() -> HealthResponse:
    """Simple liveness probe used by the extension on webview startup."""
    return HealthResponse(status="ok", version=API_VERSION)


@router.post("/api/ping", response_model=PingResponse)
def ping(payload: PingRequest) -> PingResponse:
    """Echo endpoint that proves the extension → backend message chain works."""
    return PingResponse(
        echo=payload.message,
        received_chars=len(payload.message),
        timestamp=time.time(),
    )


@router.post("/api/audio", response_model=AudioUploadResponse, status_code=201)
async def upload_audio(request: Request) -> AudioUploadResponse:
    """Accept a raw audio upload and store it temporarily.

    The body is the WAV file bytes themselves (Content-Type: audio/wav).
    Validation order: size → WAV structure → persist under a UUID filename.
    """
    body = await request.body()

    if len(body) == 0:
        raise HTTPException(status_code=400, detail="Empty audio payload.")
    if len(body) > MAX_AUDIO_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Audio payload exceeds the {MAX_AUDIO_SIZE_BYTES // (1024 * 1024)} MB limit.",
        )

    try:
        info = audio_store.parse_wav_header(body)
    except ValueError as exc:
        raise HTTPException(status_code=415, detail=f"Unsupported audio format: {exc}") from exc

    audio_id = audio_store.save_wav(body)

    return AudioUploadResponse(
        audio_id=audio_id,
        duration_seconds=info.duration_seconds,
        sample_rate=info.sample_rate,
        channels=info.channels,
        size_bytes=len(body),
    )
