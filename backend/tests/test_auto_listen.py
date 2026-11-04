"""Tests for always-listening Silero VAD API endpoints and service."""

import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.services import vad_listener

client = TestClient(app)


def test_auto_listen_status_initial():
    res = client.get("/api/recording/auto-listen/status")
    assert res.status_code == 200
    data = res.json()
    assert "enabled" in data
    assert "state" in data
    assert "audio_id" in data


def test_auto_listen_toggle():
    # Test disable
    res = client.put("/api/recording/auto-listen", json={"enabled": False})
    assert res.status_code == 200
    data = res.json()
    assert data["enabled"] is False
    assert data["state"] == "disabled"


def test_auto_listen_consume_empty():
    res = client.post("/api/recording/auto-listen/consume")
    assert res.status_code == 200
    data = res.json()
    assert data["audio_id"] is None


def test_auto_listen_pause_and_resume():
    res = client.post("/api/recording/auto-listen/pause")
    assert res.status_code == 200

    res = client.post("/api/recording/auto-listen/resume")
    assert res.status_code == 200
