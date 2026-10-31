"""HTTP endpoint definitions.

Endpoints stay thin: parse request, delegate to logic, return a response
model. Business services will be added in later milestones and called from
here, never inlined into the endpoint bodies.
"""

import time

from fastapi import APIRouter, HTTPException, Request

from app.schemas.audio import AudioUploadResponse, RecordingStartResponse
from app.schemas.common import HealthResponse, PingRequest, PingResponse
from app.schemas.transcription import (
    TranscribeRequest,
    TranscriptionResponse,
    TranscriptSegment,
)
from app.services import audio_store
from app.services import recorder as audio_recorder
from app.services import transcription as transcription_service

router = APIRouter()

API_VERSION = "0.1.0"

MAX_AUDIO_SIZE_BYTES = 20 * 1024 * 1024  # 20 MB ≈ 10 minutes of 16 kHz mono WAV


@router.get("/api/health", response_model=HealthResponse)
def health() -> HealthResponse:
    """Liveness probe. Also kicks off model warm-up (idempotent).

    The `transcription` field reports the STT model state machine so the
    sidebar and operators can tell 'ready' apart from 'still loading'.
    """
    transcription_service.request_warmup()
    return HealthResponse(
        status="ok",
        version=API_VERSION,
        transcription=transcription_service.state(),
    )


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


@router.post("/api/recording/start", response_model=RecordingStartResponse, status_code=201)
def start_recording() -> RecordingStartResponse:
    """Open the microphone and begin an in-memory recording session."""
    try:
        info = audio_recorder.start_recording()
    except audio_recorder.RecordingBusyError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except audio_recorder.MicrophoneUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return RecordingStartResponse(sample_rate=info.sample_rate, channels=info.channels)


@router.post("/api/recording/stop", response_model=AudioUploadResponse, status_code=201)
def stop_recording() -> AudioUploadResponse:
    """Finalize the active recording, store it, and return its metadata."""
    try:
        result = audio_recorder.stop_recording()
    except audio_recorder.NoActiveRecordingError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return AudioUploadResponse(
        audio_id=result.audio_id,
        duration_seconds=result.duration_seconds,
        sample_rate=result.sample_rate,
        channels=result.channels,
        size_bytes=result.size_bytes,
    )


@router.delete("/api/recording", status_code=204)
def cancel_recording() -> None:
    """Discard the active recording without storing anything."""
    try:
        audio_recorder.cancel_recording()
    except audio_recorder.RecorderError:
        # Nothing to cancel is already a fine outcome for a cancel request.
        return None
    return None


@router.post("/api/transcribe", response_model=TranscriptionResponse)
def transcribe(payload: TranscribeRequest) -> TranscriptionResponse:
    """Transcribe a previously stored recording by id.

    The pattern-checked audio_id resolves through audio_store.path_for, so
    path traversal is impossible. A missing file (temp cleanup, reboot)
    surfaces as 404 with a recoverable hint rather than a 500.
    """
    path = audio_store.path_for(payload.audio_id)
    if not path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Recording {payload.audio_id[:8]}… not found — it may have been cleaned up. Record again.",
        )

    transcription_service.request_warmup()
    try:
        result = transcription_service.transcribe(path)
    except transcription_service.TranscriptionUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Failed to read audio: {exc}") from exc

    text = " ".join(segment.text for segment in result.segments)
    return TranscriptionResponse(
        audio_id=payload.audio_id,
        language=result.language,
        duration_seconds=result.duration_seconds,
        processing_seconds=result.processing_seconds,
        text=text,
        segments=[TranscriptSegment(**seg.__dict__) for seg in result.segments],
    )
