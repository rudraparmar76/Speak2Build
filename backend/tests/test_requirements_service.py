"""Service-level tests for requirement extraction and the repair loop.

Uses a scripted FakeLLM (no network, no real provider) to prove: first-pass
parsing, fence/prose tolerance, the bounded repair retry, answer merging, and
the terminal failure path.
"""

import json

import pytest

from app.schemas.requirements import RequirementModel
from app.services import requirements as req


class FakeLLM:
    """Scripted `.complete` returning queued responses; records each call."""

    def __init__(self, responses):
        self._responses = list(responses)
        self.calls = []

    def complete(self, system: str, user: str) -> str:
        self.calls.append({"system": system, "user": user})
        return self._responses.pop(0)


VALID = json.dumps(
    {
        "task": "Validate user email and prevent duplicate registrations.",
        "language": "python",
        "inputs": ["email: str"],
        "outputs": ["bool is_valid"],
        "constraints": ["reject malformed addresses"],
        "acceptance_criteria": ["duplicate email raises ValueError"],
        "clarifications": [],
    }
)

CLARIFYING = json.dumps(
    {
        "task": "Validate email",
        "inputs": ["email: str"],
        "outputs": ["bool"],
        "constraints": [],
        "acceptance_criteria": [],
        "clarifications": [
            {"question": "Where are existing registrations stored?", "reason": "duplicates"}
        ],
    }
)


def test_valid_json_accepted_first_try():
    llm = FakeLLM([VALID])
    outcome = req.RequirementsService(llm, model_name="fake").extract("build an email validator")

    assert outcome.repaired is False
    assert outcome.model == "fake"
    assert outcome.requirement.task.startswith("Validate user email")
    assert len(llm.calls) == 1


def test_fenced_and_prose_wrapped_json_is_tolerated():
    fenced = "Sure! Here it is:\n```json\n" + VALID + "\n```"
    outcome = req.RequirementsService(FakeLLM([fenced]), model_name="fake").extract("t")
    assert outcome.requirement.language == "python"


def test_repair_loop_retries_with_validation_errors():
    llm = FakeLLM(["this is not json at all", VALID])
    outcome = req.RequirementsService(llm, model_name="fake").extract("t")

    assert outcome.repaired is True
    assert len(llm.calls) == 2
    second_user = llm.calls[1]["user"]
    assert "failed schema validation" in second_user
    assert "invalid JSON" in second_user  # the error itself feeds back


def test_two_failures_raise_extraction_error():
    llm = FakeLLM(["garbage one", "garbage two"])
    with pytest.raises(req.RequirementExtractionError, match="2 attempts"):
        req.RequirementsService(llm, model_name="fake").extract("t")


def test_wrong_schema_raises_then_repairs():
    bad = json.dumps({"task": "only task"})  # missing nothing? clarifications optional
    # Schema-valid, so use a wrong-typed field instead:
    wrong_type = json.dumps({"task": 123})
    llm = FakeLLM([wrong_type, VALID])
    outcome = req.RequirementsService(llm, model_name="fake").extract("t")

    assert outcome.repaired is True
    assert "Input should be a valid string" in llm.calls[1]["user"]


def test_answers_merged_into_matching_clarifications():
    llm = FakeLLM([CLARIFYING])
    outcome = req.RequirementsService(llm, model_name="fake").extract(
        "t", answers={"Where are existing registrations stored?": "Postgres users table"}
    )

    assert outcome.requirement.clarifications[0].answer == "Postgres users table"


def test_answers_prompt_contains_qa_block():
    llm = FakeLLM([CLARIFYING])
    req.RequirementsService(llm, model_name="fake").extract("t", answers={"Q1": "A1"})

    assert "DEVELOPER ANSWERS" in llm.calls[0]["user"]
    assert "Q1" in llm.calls[0]["user"]


def test_context_snippets_in_prompt():
    llm = FakeLLM([VALID])
    snippets = [{"path": "src/main.py", "content": "from flask import Flask", "start_line": 1, "end_line": 10}]
    req.RequirementsService(llm, model_name="fake").extract("t", context_snippets=snippets)

    assert "PROJECT CONTEXT" in llm.calls[0]["user"]
    assert "src/main.py" in llm.calls[0]["user"]
    assert "from flask import Flask" in llm.calls[0]["user"]


def test_parse_requires_object():
    with pytest.raises(ValueError):
        req._parse_requirement("[1, 2, 3]")
