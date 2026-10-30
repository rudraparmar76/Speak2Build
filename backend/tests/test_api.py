"""HTTP-level tests for the API contract.

TestClient exercises the full ASGI stack (routing, validation, CORS,
serialization) without opening a network socket, so these tests run fast and
can execute on any machine without the server running first.
"""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_returns_ok_and_version():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "version": "0.1.0"}


def test_ping_echoes_message():
    response = client.post("/api/ping", json={"message": "hello from VS Code"})
    assert response.status_code == 200
    body = response.json()
    assert body["echo"] == "hello from VS Code"
    assert body["received_chars"] == len("hello from VS Code")
    assert body["timestamp"] > 0


def test_ping_rejects_empty_message():
    # Pydantic must reject invalid payloads with HTTP 422 before any
    # business logic sees the data.
    response = client.post("/api/ping", json={"message": ""})
    assert response.status_code == 422


def test_ping_rejects_missing_field():
    response = client.post("/api/ping", json={})
    assert response.status_code == 422
