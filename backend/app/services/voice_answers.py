"""Map a spoken reply transcript onto pending clarification questions.

Used by the voice-answers flow: the developer answers several clarification
questions in one spoken take; this service converts that free-form transcript
into one direct answer per question. As everywhere else, the LLM output is
treated as untrusted: JSON parse → Pydantic validate → bounded repair loop.
"""

import json
import re
import time
from dataclasses import dataclass

from pydantic import ValidationError

from app.services.llm_client import LLMRequestError, LLMUnavailableError

MAX_ATTEMPTS = 2

SYSTEM_PROMPT = """\
You map a developer's spoken replies onto a list of pending questions.
Respond with ONLY a JSON object — no markdown fences, no commentary:

{
  "answers": [
    {"question": "<exact question text from the list>", "answer": "<direct answer>"}
  ]
}

Rules:
- The `answers` list must contain EVERY question from the list, in the same order,
  using the exact question text.
- Each answer must be a concise, direct answer to that question, extracted from
  the developer's spoken transcript.
- If the transcript does not address a question, use "" (empty string) as the answer.
- Never invent requirements that the developer did not say. If the user's phrasing
  is ambiguous, prefer the most natural reading of their own words.
- Do not answer questions with questions. Do not add commentary.
"""

_FENCE_RE = re.compile(r"^\s*```[a-zA-Z0-9]*\s*(.*?)\s*```\s*$", re.DOTALL)


def strip_code_fences(raw: str) -> str:
    match = _FENCE_RE.match(raw.strip())
    return match.group(1) if match else raw.strip()


@dataclass(frozen=True)
class MappedAnswer:
    question: str
    answer: str


@dataclass(frozen=True)
class MappingOutcome:
    answers: list[MappedAnswer]
    model: str
    processing_seconds: float


class AnswerMappingError(Exception):
    """The LLM could not produce schema-valid mapped answers in the budget."""


def build_user_prompt(questions: list[str], transcript: str) -> str:
    question_lines = "\n".join(f"{i + 1}. {q}" for i, q in enumerate(questions))
    return (
        "Pending questions:\n"
        f"{question_lines}\n\n"
        "Developer's spoken reply (transcript):\n"
        f"\"\"\"{transcript.strip()}\"\"\"\n\n"
        "Map the reply onto every question. Return ONLY the JSON object."
    )


class VoiceAnswerMapper:
    def __init__(self, llm, model_name: str, max_attempts: int = MAX_ATTEMPTS) -> None:
        self._llm = llm  # anything with .complete(system, user) -> str
        self._model_name = model_name
        self._max_attempts = max_attempts

    def map(
        self,
        questions: list[str],
        transcript: str,
    ) -> tuple[list[MappedAnswer], str, float]:
        """Return (answers, model_name, processing_seconds) or raise."""
        started = time.monotonic()
        system = SYSTEM_PROMPT
        user = build_user_prompt(questions, transcript)

        last_error: Exception | None = None
        feedback: str | None = None
        for _ in range(1, self._max_attempts + 1):
            attempt_user = user
            if feedback:
                attempt_user = (
                    f"{user}\n\nYour previous reply failed schema validation:\n"
                    f"{feedback}\n\nReturn ONLY the corrected JSON object."
                )
            raw = self._llm.complete(system, attempt_user)
            payload, parse_issue = self._parse_and_validate(raw, questions)
            if payload is not None:
                answers, model, seconds = payload, self._model_name, time.monotonic() - started
                return answers, model, seconds
            feedback = parse_issue
            last_error = AnswerMappingError(parse_issue or "unknown mapping failure")

        raise AnswerMappingError(
            f"Voice answer mapping could not produce valid JSON in "
            f"{self._max_attempts} attempts: {last_error}"
        )

    def _parse_and_validate(
        self, raw: str, questions: list[str]
    ) -> tuple[list[MappedAnswer] | None, str | None]:
        from app.schemas.voice_answers import MappedAnswersModel

        try:
            data = json.loads(strip_code_fences(raw))
        except json.JSONDecodeError as exc:
            return None, f"invalid JSON: {exc}"
        try:
            model = MappedAnswersModel.model_validate(data)
        except ValidationError as exc:
            return None, f"schema validation failed: {exc}"

        # Pad + normalize: every question must come back, empty string when
        # the developer did not address it.
        by_question = {item.question: item.answer.strip() for item in model.answers}
        answers = [
            MappedAnswer(question=q, answer=by_question.get(q, ""))
            for q in questions
        ]
        return answers, None


def map_spoken_answers(
    questions: list[str],
    transcript: str,
) -> tuple[list[MappedAnswer], str, float]:
    """Module-level entry point used by the HTTP route (env-configured LLM)."""
    from app.services.llm_client import OpenAICompatibleLLM, load_config_from_env

    config = load_config_from_env()
    if not config.model:
        raise LLMUnavailableError(
            "No LLM model configured. Set SPEAK2BUILD_LLM_MODEL "
            "(and SPEAK2BUILD_LLM_BASE_URL / SPEAK2BUILD_LLM_API_KEY as needed)."
        )
    mapper = VoiceAnswerMapper(OpenAICompatibleLLM(config), model_name=config.model)
    return mapper.map(questions, transcript)


__all__ = [
    "AnswerMappingError",
    "MappedAnswer",
    "MappingOutcome",
    "VoiceAnswerMapper",
    "map_spoken_answers",
    "strip_code_fences",
    "build_user_prompt",
    "MAX_ATTEMPTS",
]
