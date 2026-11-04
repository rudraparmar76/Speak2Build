"""Route-level tests for POST /api/requirements with injected fake outcomes."""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import requirements

client = TestClient(app)


def _raise(exc: Exception):
    """Monkeypatch helper: a callable that always raises."""
    raise exc


VALID_PAYLOAD = {
    "transcript": "create a function that validates email and prevents duplicates",
}


@pytest.fixture
def fake_outcome(monkeypatch: pytest.MonkeyPatch):
    outcome = requirements.ExtractionOutcome(
        requirement=requirements.RequirementModel(
            task="Validate email and prevent duplicates",
            language="python",
            inputs=["email: str"],
            outputs=["bool"],
            constraints=["reject malformed addresses"],
            acceptance_criteria=["duplicate raises ValueError"],
            clarifications=[],
        ),
        model="fake-model",
        processing_seconds=1.2,
        repaired=False,
    )
    monkeypatch.setattr(requirements, "is_configured", lambda: True)
    monkeypatch.setattr(requirements, "extract_from", lambda *args, **kwargs: outcome)
    return outcome


def test_extract_returns_structured_requirement(fake_outcome):
    response = client.post("/api/requirements", json=VALID_PAYLOAD)

    assert response.status_code == 200
    body = response.json()
    assert body["requirement"]["task"] == "Validate email and prevent duplicates"
    assert body["requirement"]["inputs"] == ["email: str"]
    assert body["model"] == "fake-model"
    assert body["repaired"] is False


def test_unconfigured_returns_503_with_hint(monkeypatch):
    monkeypatch.setattr(requirements, "is_configured", lambda: False)

    response = client.post("/api/requirements", json=VALID_PAYLOAD)

    assert response.status_code == 503
    assert "SPEAK2BUILD_LLM_MODEL" in response.json()["detail"]


def test_provider_unreachable_maps_to_503(monkeypatch):
    monkeypatch.setattr(requirements, "is_configured", lambda: True)
    monkeypatch.setattr(
        requirements,
        "extract_from",
        lambda *args, **kwargs: _raise(requirements.LLMUnavailableError("connection refused")),
    )

    response = client.post("/api/requirements", json=VALID_PAYLOAD)

    assert response.status_code == 503
    assert "connection refused" in response.json()["detail"]


def test_provider_500_maps_to_502(monkeypatch):
    monkeypatch.setattr(requirements, "is_configured", lambda: True)
    monkeypatch.setattr(
        requirements,
        "extract_from",
        lambda *args, **kwargs: _raise(requirements.LLMRequestError("boom")),
    )

    response = client.post("/api/requirements", json=VALID_PAYLOAD)

    assert response.status_code == 502


def test_unrepairable_output_maps_to_422(monkeypatch):
    monkeypatch.setattr(requirements, "is_configured", lambda: True)
    monkeypatch.setattr(
        requirements,
        "extract_from",
        lambda *args, **kwargs: _raise(requirements.RequirementExtractionError("boom")),
    )

    response = client.post("/api/requirements", json=VALID_PAYLOAD)

    assert response.status_code == 422


def test_short_transcript_is_rejected_422():
    response = client.post("/api/requirements", json={"transcript": ""})
    assert response.status_code == 422


def test_answers_passed_through(monkeypatch):
    seen = {}

    def fake_extract(transcript, answers=None, *args, **kwargs):
        seen["answers"] = answers
        return requirements.ExtractionOutcome(
            requirement=requirements.RequirementModel(task="t"),
            model="m",
            processing_seconds=0.1,
            repaired=False,
        )

    monkeypatch.setattr(requirements, "is_configured", lambda: True)
    monkeypatch.setattr(requirements, "extract_from", fake_extract)

    response = client.post(
        "/api/requirements",
        json={"transcript": "abc", "answers": {"Where stored?": "Postgres"}},
    )

    assert response.status_code == 200
    assert seen["answers"] == {"Where stored?": "Postgres"}


def test_context_snippets_passed_through(monkeypatch):
    seen = {}

    def fake_extract(transcript, answers=None, context_snippets=None, *args, **kwargs):
        seen["snippets"] = context_snippets
        return requirements.ExtractionOutcome(
            requirement=requirements.RequirementModel(task="t"),
            model="m",
            processing_seconds=0.1,
            repaired=False,
        )

    monkeypatch.setattr(requirements, "is_configured", lambda: True)
    monkeypatch.setattr(requirements, "extract_from", fake_extract)

    response = client.post(
        "/api/requirements",
        json={
            "transcript": "abc",
            "context_snippets": [{"path": "main.py", "content": "hello"}],
        },
    )

    assert response.status_code == 200
    assert seen["snippets"] == [{"path": "main.py", "content": "hello"}]
