"""Turn an (edited) transcript into validated, structured requirements.

The LLM is treated as untrusted input: its JSON is parsed, validated through
Pydantic, and on any failure we send the *validation errors* back for a
bounded repair round. This validate→feedback→retry loop is the core
reliability pattern for structured LLM output.
"""

import json
import re
import time
from dataclasses import dataclass

from pydantic import ValidationError

from app.schemas.requirements import ClarificationItem, RequirementModel
from app.services.llm_client import LLMError, LLMRequestError, LLMUnavailableError

MAX_ATTEMPTS = 2

SYSTEM_PROMPT = """\
You convert spoken programming requests into structured requirements.
Respond with ONLY a JSON object — no markdown fences, no commentary:

{
  "task": "<one-sentence imperative summary>",
  "language": "python",
  "inputs": ["<named input, e.g. 'email: str'>"],
  "outputs": ["<named output, e.g. 'bool is_valid'>"],
  "constraints": ["<stated or implied constraints>"],
  "acceptance_criteria": ["<testable statements>"],
  "clarifications": [{"question": "<specific question>", "reason": "<why it matters>"}]
}

Rules:
- Speak2Build is an autonomous developer assistant that crawls the codebase and develops knowledge itself. DEFAULT to "clarifications": [].
- NEVER ask clarification questions for standard software engineering tasks:
  * Adding, updating, or generating unit tests, integration tests, or test suites (e.g. NEVER ask what edge cases, scenarios, mock strategies, or endpoints to test; inspect the workspace code and generate comprehensive test coverage autonomously).
  * Refactoring, code cleanup, error handling, input validation, logging, or bug fixes.
  * Creating endpoints, functions, classes, or database operations whose details can be reasonably inferred from context.
- NEVER ask the developer about edge cases, parameter types, error handling, test scenarios, or implementation details. Deduce them by reading the workspace code and follow standard software engineering best practices.
- NEVER ask the developer to share, paste, describe, or clarify existing code, file structures, or endpoint signatures. All existing code is inspected directly from the workspace.
- Fold explicit developer answers below into the requirement as facts, and do NOT re-ask anything already answered.
- If PROJECT CONTEXT is provided, inspect the existing code to determine the framework (e.g., Flask vs FastAPI), existing endpoints, parameter styles, and conventions. Align the task, inputs, and outputs directly with the codebase.
- Clarifications are an absolute LAST RESORT. ONLY ask if a high-level business requirement is fundamentally missing or impossible to proceed without. If in doubt, assume reasonable defaults, record them under constraints/acceptance_criteria, and set "clarifications": [].
- Language is "python" (MVP).
"""

_FENCE_RE = re.compile(r"^\s*```[a-zA-Z0-9]*\s*(.*?)\s*```\s*$", re.DOTALL)


@dataclass(frozen=True)
class ExtractionOutcome:
    requirement: RequirementModel
    model: str
    processing_seconds: float
    repaired: bool


class RequirementExtractionError(Exception):
    """The LLM could not produce schema-valid JSON within the retry budget."""


def strip_code_fences(raw: str) -> str:
    """Accept ```json-wrapped output; some models fence despite instructions."""
    match = _FENCE_RE.match(raw.strip())
    return match.group(1) if match else raw.strip()


def build_user_prompt(
    transcript: str,
    answers: dict[str, str] | None,
    context_snippets: list[dict] | None = None,
    conversation_history: list[dict] | None = None,
) -> str:
    parts = [f"TRANSCRIPT:\n\"\"\"\n{transcript}\n\"\"\""]
    if conversation_history:
        lines = []
        for msg in conversation_history[-6:]:
            role = "Developer" if msg.get("role") == "user" else "Assistant"
            content = (msg.get("content") or "").strip()
            if content:
                lines.append(f"{role}: {content}")
        if lines:
            parts.insert(0, "PRIOR CONVERSATION CONTEXT:\n" + "\n".join(lines))
    if context_snippets:
        snippets_text = []
        for s in context_snippets:
            path = s.get("path", "file")
            content = s.get("content", "")
            start = s.get("start_line", s.get("startLine", 1))
            end = s.get("end_line", s.get("endLine", "?"))
            snippets_text.append(f"--- {path} (lines {start}-{end}) ---\n{content}")
        parts.append(
            "PROJECT CONTEXT (existing code from workspace):\n" + "\n\n".join(snippets_text)
        )
    if answers:
        qa = "\n".join(f"- Q: {q}\n  A: {a}" for q, a in answers.items())
        parts.append(
            "DEVELOPER ANSWERS (treat as facts for this extraction):\n" + qa
        )
    return "\n\n".join(parts)


class RequirementsService:
    def __init__(self, llm, model_name: str, max_attempts: int = MAX_ATTEMPTS) -> None:
        self._llm = llm  # anything with .complete(system, user) -> str
        self._model_name = model_name
        self._max_attempts = max_attempts

    def extract(
        self,
        transcript: str,
        answers: dict[str, str] | None = None,
        context_snippets: list[dict] | None = None,
        conversation_history: list[dict] | None = None,
    ) -> ExtractionOutcome:
        started = time.monotonic()
        system = SYSTEM_PROMPT
        user = build_user_prompt(transcript, answers, context_snippets, conversation_history)

        feedback: str | None = None
        for attempt in range(1, self._max_attempts + 1):
            attempt_user = user
            if feedback:
                attempt_user = (
                    f"{user}\n\nYour previous reply failed schema validation:\n"
                    f"{feedback}\n\nReturn ONLY the corrected JSON object."
                )
                system = SYSTEM_PROMPT  # unchanged; keeps the contract visible
            raw = self._llm.complete(system, attempt_user)
            try:
                requirement = _parse_requirement(raw)
                if answers:
                    requirement = _merge_answers(requirement, answers)
                return ExtractionOutcome(
                    requirement=requirement,
                    model=self._model_name,
                    processing_seconds=time.monotonic() - started,
                    repaired=attempt > 1,
                )
            except (ValueError, ValidationError) as exc:
                feedback = _describe(exc)

        raise RequirementExtractionError(
            f"LLM did not produce schema-valid JSON in {self._max_attempts} attempts. "
            f"Last validation failure: {feedback}"
        )


def _parse_requirement(raw: str) -> RequirementModel:
    text = strip_code_fences(raw)
    # Tolerate occasional prose before/after the JSON object.
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end > start:
        text = text[start : end + 1]
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ValueError(f"invalid JSON: {exc}") from exc
    if not isinstance(data, dict):
        raise ValueError("expected a JSON object")
    return RequirementModel.model_validate(data)


def _merge_answers(
    requirement: RequirementModel, answers: dict[str, str]
) -> RequirementModel:
    """Attach provided answers to matching clarification questions.

    The prompt already instructs the model to answer from the given Q&A; this
    reconciliation is the deterministic guarantee it actually did.
    """
    merged: list[ClarificationItem] = []
    for item in requirement.clarifications:
        answer = answers.get(item.question)
        # Keep an LLM-provided answer only if we can confirm it came from us.
        confirmed = answer if item.question in answers else None
        merged.append(
            ClarificationItem(
                question=item.question,
                reason=item.reason,
                answer=confirmed if confirmed is not None else item.answer,
            )
        )
    return requirement.model_copy(update={"clarifications": merged})


def _describe(exc: Exception) -> str:
    if isinstance(exc, ValidationError):
        return str(exc)
    return str(exc)


# --- Module-level entry points (single patch point for tests, like M2) ------


def is_configured() -> bool:
    from app.services.llm_client import load_config_from_env

    return bool(load_config_from_env().model)


def extract_from(
    transcript: str,
    answers: dict[str, str] | None = None,
    context_snippets: list[dict] | None = None,
    conversation_history: list[dict] | None = None,
) -> ExtractionOutcome:
    from app.services.llm_client import load_config_from_env

    config = load_config_from_env()
    if not config.model:
        raise LLMUnavailableError(
            "No LLM model configured. Set SPEAK2BUILD_LLM_MODEL "
            "(and SPEAK2BUILD_LLM_BASE_URL / SPEAK2BUILD_LLM_API_KEY as needed)."
        )
    from app.services.llm_client import OpenAICompatibleLLM

    service = RequirementsService(OpenAICompatibleLLM(config), model_name=config.model)
    return service.extract(transcript, answers, context_snippets, conversation_history)


__all__ = [
    "ExtractionOutcome",
    "LLMError",
    "LLMRequestError",
    "LLMUnavailableError",
    "MAX_ATTEMPTS",
    "RequirementExtractionError",
    "RequirementsService",
    "SYSTEM_PROMPT",
    "extract_from",
    "is_configured",
    "strip_code_fences",
]
