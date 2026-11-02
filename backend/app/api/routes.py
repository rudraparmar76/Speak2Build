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
from app.schemas.common import (
    HealthResponse,
    PingRequest,
    PingResponse,
    LLMConfigRequest,
    LLMConfigResponse,
    LLMTestRequest,
    LLMTestResponse,
)
from app.schemas.context import (
    RelevantRequest,
    RelevantResponse,
    ScanRequest,
    ScanResponse,
)
from app.schemas.generation import (
    RepairRequest,
    RepairResponse,
    ApplyDiffRequest,
    ApplyDiffResponse,
    FileDiff,
    GenerateRequest,
    GenerateResponse,
    RevertDiffRequest,
    RevertDiffResponse,
)
from app.schemas.requirements import ExtractRequest, ExtractionResponse
from app.schemas.transcription import (
    TranscribeRequest,
    TranscriptionResponse,
    TranscriptSegment,
)
from app.schemas.validation import (
    TestFrameworkDetectResponse,
    TestRunRequest,
    TestRunResponse,
)
from app.schemas.voice_commands import (
    CommandClassifyRequest,
    CommandClassifyResponse,
)
from app.schemas.voice_answers import (
    MapAnswersRequest,
    MapAnswersResponse,
    MappedAnswerItem,
)
from app.schemas.tts import SpeakRequest, SpeakResponse, StopSpeakResponse
from app.services import audio_store
from app.services import recorder as audio_recorder
from app.services import requirements as requirements_service
from app.services import transcription as transcription_service
from app.services import project_context as context_service
from app.services import code_generation as generation_service
from app.services import validation as validation_service
from app.services import tts as tts_service
from app.services import voice_answers as voice_answers_service
from app.services import voice_commands as commands_service
from app.services.llm_client import (
    LLMRequestError,
    LLMUnavailableError,
    LLMConfig,
    OpenAICompatibleLLM,
    load_config_from_env,
    BASE_URL_ENV,
    MODEL_ENV,
    API_KEY_ENV,
    TIMEOUT_ENV,
)

router = APIRouter()

API_VERSION = "0.1.0"

MAX_AUDIO_SIZE_BYTES = 20 * 1024 * 1024  # 20 MB ≈ 10 minutes of 16 kHz mono WAV


@router.get("/api/health", response_model=HealthResponse)
def health() -> HealthResponse:
    """Liveness probe. Also kicks off model warm-up (idempotent).

    The `transcription` field reports the STT model state machine so the
    sidebar and operators can tell 'ready' apart from 'still loading'.
    The `tts` field reports the active voice engine (piper | edge).
    """
    transcription_service.request_warmup()
    engine = (os.environ.get(tts_service.ENGINE_ENV) or "piper").strip().lower()
    return HealthResponse(
        status="ok",
        version=API_VERSION,
        transcription=transcription_service.state(),
        tts=engine,
    )


@router.post("/api/ping", response_model=PingResponse)
def ping(payload: PingRequest) -> PingResponse:
    """Echo endpoint that proves the extension → backend message chain works."""
    return PingResponse(
        echo=payload.message,
        received_chars=len(payload.message),
        timestamp=time.time(),
    )


@router.get("/api/llm/config", response_model=LLMConfigResponse)
def get_llm_config() -> LLMConfigResponse:
    """Return current LLM configuration (API key masked)."""
    config = load_config_from_env()
    return LLMConfigResponse(
        base_url=config.base_url,
        model=config.model,
        has_api_key=config.api_key is not None and len(config.api_key) > 0,
        timeout=int(config.timeout_seconds),
        configured=bool(config.model),
    )


@router.put("/api/llm/config", response_model=LLMConfigResponse)
def update_llm_config(payload: LLMConfigRequest) -> LLMConfigResponse:
    """Update LLM configuration via environment variables."""
    if payload.base_url:
        os.environ[BASE_URL_ENV] = payload.base_url
    if payload.model:
        os.environ[MODEL_ENV] = payload.model
    # Explicitly set or clear API key
    if payload.api_key:
        os.environ[API_KEY_ENV] = payload.api_key
    elif payload.api_key == "":
        os.environ[API_KEY_ENV] = ""
    if payload.timeout:
        os.environ[TIMEOUT_ENV] = str(payload.timeout)

    config = load_config_from_env()
    return LLMConfigResponse(
        base_url=config.base_url,
        model=config.model,
        has_api_key=config.api_key is not None and len(config.api_key) > 0,
        timeout=int(config.timeout_seconds),
        configured=bool(config.model),
    )


@router.post("/api/llm/test", response_model=LLMTestResponse)
def test_llm_credentials(payload: LLMTestRequest) -> LLMTestResponse:
    """Validate LLM credentials by sending a lightweight test completion."""
    start_time = time.monotonic()
    api_key = payload.api_key if payload.api_key is not None else (os.environ.get(API_KEY_ENV) or None)
    config = LLMConfig(
        base_url=payload.base_url.rstrip("/"),
        model=payload.model,
        api_key=api_key or None,
        timeout_seconds=float(payload.timeout),
    )
    client = OpenAICompatibleLLM(config)
    try:
        reply = client.complete(
            system="You are an API validator. Respond with the single word 'PONG'.",
            user="PING",
        )
        latency = (time.monotonic() - start_time) * 1000.0
        return LLMTestResponse(
            valid=True,
            message=f"Connected successfully ({payload.model})",
            latency_ms=round(latency, 1),
        )
    except LLMUnavailableError as exc:
        return LLMTestResponse(
            valid=False,
            message=f"Cannot reach provider: {exc}",
            latency_ms=0.0,
        )
    except LLMRequestError as exc:
        return LLMTestResponse(
            valid=False,
            message=f"Provider rejected request: {exc}",
            latency_ms=0.0,
        )
    except Exception as exc:
        return LLMTestResponse(
            valid=False,
            message=f"Validation error: {exc}",
            latency_ms=0.0,
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
        if payload.context_snippets:
            try:
                outcome = requirements_service.extract_from(
                    payload.transcript, payload.answers, payload.context_snippets
                )
            except TypeError:
                outcome = requirements_service.extract_from(payload.transcript, payload.answers)
        else:
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

    # Determine workspace root from payload, or default to CWD
    if payload.workspace_root:
        workspace_root = Path(payload.workspace_root).resolve()
    else:
        workspace_root = Path.cwd()

    # Safety: ensure workspace_root is a valid directory
    if not workspace_root.is_dir():
        if workspace_root.is_file():
            workspace_root = workspace_root.parent
        else:
            workspace_root = Path.cwd()

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
        test_errors=outcome.test_errors or [],
        tests_passed=outcome.tests_passed,
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


@router.post("/api/diff/revert", response_model=RevertDiffResponse)
def revert_diff(payload: RevertDiffRequest) -> RevertDiffResponse:
    """Revert an applied unified diff in the workspace."""
    try:
        workspace_root = Path(payload.workspace_root).resolve()
        if not workspace_root.exists():
            raise HTTPException(status_code=400, detail="Workspace root does not exist")
        success, message, affected = generation_service.revert_diff(payload.unified_diff, workspace_root)
        return RevertDiffResponse(success=success, message=message, affected_files=affected)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Revert failed: {exc}") from exc


@router.get("/api/validate/detect", response_model=TestFrameworkDetectResponse)
def detect_tests(workspace_root: str) -> TestFrameworkDetectResponse:
    """Detect testing framework for a workspace root."""
    try:
        root = Path(workspace_root).resolve()
        if not root.exists() or not root.is_dir():
            raise HTTPException(status_code=400, detail="Workspace root directory does not exist")
        fw_id, fw_name = validation_service.detect_test_framework(root)
        return TestFrameworkDetectResponse(framework=fw_id, name=fw_name)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Framework detection failed: {exc}") from exc


@router.post("/api/validate/tests", response_model=TestRunResponse)
def run_tests(payload: TestRunRequest) -> TestRunResponse:
    """Run tests in the workspace with auto-detected or specified framework."""
    try:
        workspace_root = Path(payload.workspace_root).resolve()
        if not workspace_root.exists() or not workspace_root.is_dir():
            raise HTTPException(status_code=400, detail="Workspace root directory does not exist")
        outcome = validation_service.run_workspace_tests(
            workspace_root=workspace_root,
            test_path=payload.test_path,
            timeout_seconds=payload.timeout_seconds,
            framework=payload.framework,
        )
        return TestRunResponse(
            success=outcome.success,
            framework=outcome.framework,
            passed=outcome.passed,
            failed=outcome.failed,
            errors=outcome.errors,
            skipped=outcome.skipped,
            total=outcome.total,
            duration_seconds=outcome.duration_seconds,
            summary=outcome.summary,
            output=outcome.output,
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Test validation failed: {exc}") from exc


# ---------------------------------------------------------------------------
# Text-to-speech playback (Milestone 7, part 1)
# ---------------------------------------------------------------------------


@router.post("/api/tts/play", response_model=SpeakResponse)
async def speak_aloud(payload: SpeakRequest) -> SpeakResponse:
    """Synthesize `text` with a neural voice and start playing it aloud.

    Playback is non-blocking: the response carries the estimated duration of
    the utterance while the audio is still playing on the backend's audio
    thread. POST /api/tts/stop cancels it.
    """
    try:
        started = await tts_service.speak(payload.text, payload.voice, payload.rate)
    except tts_service.SynthesisError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except tts_service.TTSError as exc:
        # Everything else is local: no usable output device, etc.
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return SpeakResponse(
        played=True,
        characters=started.characters,
        duration_seconds=started.duration_seconds,
        sample_rate=started.sample_rate,
        voice=started.voice,
        rate=started.rate,
        engine=started.engine,
    )


@router.post("/api/tts/stop", response_model=StopSpeakResponse)
def stop_speaking() -> StopSpeakResponse:
    """Stop the current utterance (no-op success if nothing is playing)."""
    was_playing = tts_service.stop()
    return StopSpeakResponse(stopped=was_playing)


# ---------------------------------------------------------------------------
# Voice answers: map a spoken reply onto pending clarification questions
# ---------------------------------------------------------------------------


@router.post("/api/requirements/map-answers", response_model=MapAnswersResponse)
def map_spoken_answers(payload: MapAnswersRequest) -> MapAnswersResponse:
    """Convert one free-form spoken transcript into per-question answers.

    Every question comes back (same order); unanswered ones get "" so the
    caller can decide whether to re-ask.
    """
    try:
        answers, model_name, seconds = voice_answers_service.map_spoken_answers(
            payload.questions, payload.transcript
        )
        return MapAnswersResponse(
            answers=[MappedAnswerItem(question=a.question, answer=a.answer) for a in answers],
            model=model_name,
            processing_seconds=round(seconds, 2),
        )
    except voice_answers_service.LLMUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except LLMRequestError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except voice_answers_service.AnswerMappingError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# Spoken voice commands (Milestone 7, part 4)
# ---------------------------------------------------------------------------


@router.post("/api/commands/classify", response_model=CommandClassifyResponse)
def classify_command(payload: CommandClassifyRequest) -> CommandClassifyResponse:
    """Classify spoken transcript into an actionable voice command."""
    match = commands_service.classify_voice_command(payload.transcript)
    return CommandClassifyResponse(
        is_command=match.is_command,
        action=match.action,
        confidence=match.confidence,
        feedback_speech=match.feedback_speech,
    )


@router.post("/api/repair", response_model=RepairResponse)
def repair_code_endpoint(payload: RepairRequest) -> RepairResponse:
    """Generate auto-repair diffs for failing tests using LLM guidance."""
    if not generation_service.is_configured():
        raise HTTPException(
            status_code=503,
            detail="No LLM configured. Set SPEAK2BUILD_LLM_MODEL and restart backend.",
        )

    if payload.workspace_root:
        workspace_root = Path(payload.workspace_root).resolve()
    else:
        workspace_root = Path.cwd()

    if not workspace_root.is_dir():
        if workspace_root.is_file():
            workspace_root = workspace_root.parent
        else:
            workspace_root = Path.cwd()

    try:
        outcome = generation_service.repair_code(
            requirement_text=payload.requirement_text,
            failed_test_output=payload.failed_test_output,
            context_snippets=payload.context_snippets,
            options=payload.options,
            workspace_root=str(workspace_root),
            framework=payload.framework,
        )
    except LLMUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except LLMRequestError as exc:
        raise HTTPException(status_code=502, detail=f"LLM provider error: {exc}") from exc
    except generation_service.CodeGenerationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Auto-repair failed: {exc}") from exc

    return RepairResponse(
        diffs=outcome.diffs,
        summary=outcome.summary,
        model=outcome.model,
        processing_seconds=outcome.processing_seconds,
        validated=outcome.validated,
        validation_errors=outcome.validation_errors,
        test_errors=outcome.test_errors or [],
        tests_passed=outcome.tests_passed,
        repaired=True,
    )
