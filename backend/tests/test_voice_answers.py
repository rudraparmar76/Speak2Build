"""Tests for spoken-answer mapping (service + endpoint).

The LLM is a fake following the same pattern as the requirements tests: valid
 JSON, fenced JSON, invalid output for the repair round, and error mapping.
"""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.voice_answers import MapAnswersResponse
from app.services import voice_answers as voice_answers_service
from app.services.voice_answers import (
    AnswerMappingError,
    VoiceAnswerMapper,
)


class FakeLLM:
    """Same seam as RequirementsService tests: .complete(system, user) -> str."""

    def __init__(self, replies: list[str]):
        self.replies = list(replies)
        self.calls: list[str] = []

    def complete(self, system: str, user: str) -> str:
        self.calls.append(user)
        return self.replies.pop(0) if self.replies else "{}"


QUESTIONS = [
    "Which database should I use?",
    "Should registration be case-insensitive?",
]

VALID_RAW = (
    '{"answers": ['
    '{"question": "Which database should I use?", "answer": "SQLite"}, '
    '{"question": "Should registration be case-insensitive?", "answer": "Yes"}'
    "]}"
)


def valid_payload() -> dict:
    return {
        "answers": [
            {"question": q, "answer": a}
            for q, a in zip(QUESTIONS, ["SQLite", "Yes"], strict=True)
        ]
    }


# ---------------------------------------------------------------- service --

def test_mapper_valid_json_first_try():
    llm = FakeLLM([VALID_RAW])
    mapper = VoiceAnswerMapper(llm, model_name="fake-model")
    answers, model, seconds = mapper.map(QUESTIONS, "Use SQLite and yes, case insensitive.")

    assert model == "fake-model"
    assert seconds >= 0.0
    assert [a.question for a in answers] == QUESTIONS
    assert [a.answer for a in answers] == ["SQLite", "Yes"]


def test_mapper_repairs_after_invalid_output():
    llm = FakeLLM(["not json at all", VALID_RAW])
    mapper = VoiceAnswerMapper(llm, model_name="fake-model")
    answers, _, _ = mapper.map(QUESTIONS, "spoken reply")

    assert len(llm.calls) == 2  # repair round consumed a second call
    assert [a.answer for a in answers] == ["SQLite", "Yes"]


def test_mapper_two_failures_raise():
    llm = FakeLLM(["still not json", "also not json"])
    mapper = VoiceAnswerMapper(llm, model_name="fake-model")
    with pytest.raises(AnswerMappingError):
        mapper.map(QUESTIONS, "spoken reply")


def test_mapper_pads_missing_questions_with_empty_answer():
    # Model skipped the second question entirely.
    partial = (
        '{"answers": ['
        '{"question": "Which database should I use?", "answer": "SQLite"}'
        "]}"
    )
    mapper = VoiceAnswerMapper(FakeLLM([partial]), model_name="fake-model")
    answers, _, _ = mapper.map(QUESTIONS, "Just use SQLite.")

    assert len(answers) == 2
    assert answers[0].answer == "SQLite"
    assert answers[1].answer == ""  # not addressed → empty, not invented


def test_mapper_accepts_fenced_json():
    fenced = "```json\n" + VALID_RAW + "\n```"
    mapper = VoiceAnswerMapper(FakeLLM([fenced]), model_name="fake-model")
    answers, _, _ = mapper.map(QUESTIONS, "reply")
    assert [a.answer for a in answers] == ["SQLite", "Yes"]


# ---------------------------------------------------------------- schema --

def test_request_rejects_duplicate_questions():
    with pytest.raises(Exception):
        MapAnswersRequest(questions=[QUESTIONS[0], QUESTIONS[0]], transcript="hello")


def test_request_rejects_blank_transcript():
    with pytest.raises(Exception):
        MapAnswersRequest(questions=QUESTIONS, transcript="   ")


# --------------------------------------------------------------- endpoint --

@pytest.fixture()
def client(monkeypatch):
    return TestClient(app)


def test_endpoint_maps_and_returns_row_order(client, monkeypatch):
    def fake_map(questions, transcript):
        from app.services.voice_answers import MappedAnswer

        return (
            [MappedAnswer(question=q, answer=a) for q, a in zip(questions, ["SQLite", "Yes"], strict=True)],
            "fake-model",
            1.23,
        )

    monkeypatch.setattr(voice_answers_service, "map_spoken_answers", fake_map)
    response = client.post(
        "/api/requirements/map-answers",
        json={"questions": QUESTIONS, "transcript": "Use SQLite, case-insensitive."},
    )
    assert response.status_code == 200
    body = MapAnswersResponse.model_validate(response.json())
    assert [a.answer for a in body.answers] == ["SQLite", "Yes"]
    assert body.model == "fake-model"


def test_endpoint_maps_unconfigured_llm_to_503(client, monkeypatch):
    from app.services.voice_answers import LLMUnavailableError as _LLMUnavailableError

    def raise_unconfigured(questions, transcript):
        raise _LLMUnavailableError("No LLM model configured.")

    monkeypatch.setattr(voice_answers_service, "map_spoken_answers", raise_unconfigured)
    response = client.post(
        "/api/requirements/map-answers",
        json={"questions": QUESTIONS, "transcript": "hello there"},
    )
    assert response.status_code == 503


def test_endpoint_maps_llm_rejection_to_502(client, monkeypatch):
    from app.services.llm_client import LLMRequestError

    def raise_rejected(questions, transcript):
        raise LLMRequestError("provider rejected the request")

    monkeypatch.setattr(voice_answers_service, "map_spoken_answers", raise_rejected)
    response = client.post(
        "/api/requirements/map-answers",
        json={"questions": QUESTIONS, "transcript": "hello there"},
    )
    assert response.status_code == 502


def test_endpoint_maps_unrepairable_output_to_422(client, monkeypatch):
    def raise_unrepairable(questions, transcript):
        raise AnswerMappingError("could not repair")

    monkeypatch.setattr(voice_answers_service, "map_spoken_answers", raise_unrepairable)
    response = client.post(
        "/api/requirements/map-answers",
        json={"questions": QUESTIONS, "transcript": "hello there"},
    )
    assert response.status_code == 422


def test_endpoint_validates_payload(client):
    response = client.post(
        "/api/requirements/map-answers",
        json={"questions": [], "transcript": "hello"},
    )
    assert response.status_code == 422
