"""HTTP endpoint definitions.

Endpoints stay thin: parse request, delegate to logic, return a response
model. Business services will be added in later milestones and called from
here, never inlined into the endpoint bodies.
"""

import os
import time
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request

from app.schemas.audio import AudioUploadResponse, RecordingStartResponse
from app.schemas.common import HealthResponse, PingRequest, PingResponse
from app.schemas.context import (
    RelevantRequest,
    RelevantResponse,
    ScanRequest,
    ScanResponse,
)
from app.schemas.generation import (
    ApplyDiffRequest,
    ApplyDiffResponse,
    FileDiff,
    GenerateRequest,
    GenerateResponse,
)
from app.schemas.requirements import ExtractRequest, ExtractionResponse
from app.schemas.transcription import (
    TranscribeRequest,
    TranscriptionResponse,
    TranscriptSegment,
)
from app.services import audio_store
from app.services import recorder as audio_recorder
from app.services import requirements as requirements_service
from app.services import transcription as transcription_service
from app.services import project_context as context_service
from app.services import code_generation as generation_service
from app.services.llm_client import (
    LLMRequestError,
    LLMUnavailableError,
)

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


@router.post("/api/requirements", response_model=ExtractionResponse)
def extract_requirements(payload: ExtractRequest) -> ExtractionResponse:
    """Turn a (possibly edited) transcript into structured requirements.

    Error taxonomy: 503 unconfigured/unreachable provider, 502 provider error,
    422 schema-unrepairable model output. Ambiguity itself is NOT an error —
    it arrives as `clarifications` inside a 200.
    """
    if not requirements_service.is_configured():
        raise HTTPException(
            status_code=503,
            detail=(
                "No LLM configured. Set SPEAK2BUILD_LLM_MODEL "
                "(+ SPEAK2BUILD_LLM_BASE_URL / SPEAK2BUILD_LLM_API_KEY) "
                "and restart the backend."
            ),
        )
    try:
        outcome = requirements_service.extract_from(payload.transcript, payload.answers)
    except LLMUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except LLMRequestError as exc:
        raise HTTPException(status_code=502, detail=f"LLM provider error: {exc}") from exc
    except requirements_service.RequirementExtractionError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return ExtractionResponse(
        requirement=outcome.requirement,
        model=outcome.model,
        processing_seconds=outcome.processing_seconds,
        repaired=outcome.repaired,
    )


@router.post("/api/context/scan", response_model=ScanResponse)
def scan_context(payload: ScanRequest) -> ScanResponse:
    """Scan a workspace for languages and file tree (metadata only, no contents)."""
    try:
        result = context_service.scan_workspace(payload.workspace_root, payload.max_files)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Failed to scan workspace: {exc}") from exc

    # Convert tree dict to FileNode model (pydantic handles recursive)
    return ScanResponse(
        workspace_root=str(result.root),
        languages=sorted(result.languages),
        file_tree=result.file_tree,
        total_files=result.total_files,
        scanned_files=result.scanned_files,
    )


@router.post("/api/context/relevant", response_model=RelevantResponse)
def get_relevant_context(payload: RelevantRequest) -> RelevantResponse:
    """Extract bounded snippets from user-selected files relevant to a requirement."""
    workspace_root = Path(payload.workspace_root).resolve()

    snippets, truncated = context_service.select_relevant_files(
        requirement_text=payload.requirement_text,
        file_paths=payload.file_paths,
        workspace_root=workspace_root,
        max_snippet_lines=payload.max_snippet_lines,
        max_total_chars=payload.max_total_chars,
    )

    total_chars = sum(len(s["content"]) for s in snippets)
    return RelevantResponse(
        snippets=snippets,
        total_chars=total_chars,
        truncated=truncated,
    )


@router.post("/api/generate", response_model=GenerateResponse)
def generate_code(payload: GenerateRequest) -> GenerateResponse:
    """Generate code diffs from requirement + context snippets."""
    if not generation_service.is_configured():
        raise HTTPException(
            status_code=503,
            detail="No LLM configured. Set SPEAK2BUILD_LLM_MODEL and restart backend.",
        )

    # Determine workspace root from context snippets or use CWD
    workspace_root = Path.cwd()
    if payload.context_snippets:
        # Try to find common workspace root from snippet paths
        first_path = payload.context_snippets[0].get("path", "")
        if first_path:
            # Heuristic: workspace is parent of first few path components
            parts = Path(first_path).parts
            if len(parts) >= 2:
                workspace_root = Path(*parts[:2]).resolve()

    try:
        outcome = generation_service.generate_code(
            requirement_text=payload.requirement_text,
            context_snippets=payload.context_snippets,
            options=payload.options,
            workspace_root=str(workspace_root),
        )
    except LLMUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except LLMRequestError as exc:
        raise HTTPException(status_code=502, detail=f"LLM provider error: {exc}") from exc
    except generation_service.CodeGenerationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Generation failed: {exc}") from exc

    return GenerateResponse(
        diffs=outcome.diffs,
        summary=outcome.summary,
        model=outcome.model,
        processing_seconds=outcome.processing_seconds,
        validated=outcome.validated,
        validation_errors=outcome.validation_errors,
    )


@router.post("/api/diff/apply", response_model=ApplyDiffResponse)
def apply_diff(payload: ApplyDiffRequest) -> ApplyDiffResponse:
    """Apply a unified diff to the workspace."""
    try:
        workspace_root = Path(payload.workspace_root).resolve()
        if not workspace_root.exists():
            raise HTTPException(status_code=400, detail="Workspace root does not exist")
        success, message, affected = generation_service.apply_diff(payload.unified_diff, workspace_root)
        return ApplyDiffResponse(success=success, message=message, affected_files=affected)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Apply failed: {exc}") from exc
