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
- Fold explicit developer answers below into the requirement as facts, and do
  NOT re-ask anything already answered.
- Only state facts that were said or are unavoidable defaults; everything that
  needs a human decision becomes a `clarifications` entry.
- Every clarification must be a single, individually answerable question.
- If the request is already fully specified, `clarifications` must be [].
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


def build_user_prompt(transcript: str, answers: dict[str, str] | None) -> str:
    parts = [f"TRANSCRIPT:\n\"\"\"\n{transcript}\n\"\"\""]
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
        self, transcript: str, answers: dict[str, str] | None = None
    ) -> ExtractionOutcome:
        started = time.monotonic()
        system = SYSTEM_PROMPT
        user = build_user_prompt(transcript, answers)

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


def extract_from(transcript: str, answers: dict[str, str] | None = None) -> ExtractionOutcome:
    from app.services.llm_client import load_config_from_env

    config = load_config_from_env()
    if not config.model:
        raise LLMUnavailableError(
            "No LLM model configured. Set SPEAK2BUILD_LLM_MODEL "
            "(and SPEAK2BUILD_LLM_BASE_URL / SPEAK2BUILD_LLM_API_KEY as needed)."
        )
    from app.services.llm_client import OpenAICompatibleLLM

    service = RequirementsService(OpenAICompatibleLLM(config), model_name=config.model)
    return service.extract(transcript, answers)


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
