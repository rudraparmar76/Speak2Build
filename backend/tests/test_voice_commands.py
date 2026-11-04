"""Tests for voice command recognition and classification."""

import pytest
from app.services.voice_commands import classify_voice_command


def test_classify_apply_commands():
    assert classify_voice_command("apply").action == "apply"
    assert classify_voice_command("apply it").action == "apply"
    assert classify_voice_command("apply all").action == "apply"
    assert classify_voice_command("apply changes").action == "apply"
    assert classify_voice_command("looks good, apply it!").action == "apply"
    assert classify_voice_command("yes apply").action == "apply"
    assert classify_voice_command("accept changes").action == "apply"
    assert classify_voice_command("accept all").action == "apply"
    assert classify_voice_command("accept all changes").action == "apply"
    assert classify_voice_command("accept all diffs").action == "apply"
    assert classify_voice_command("accept them all").action == "apply"
    assert classify_voice_command("apply all changes").action == "apply"
    assert classify_voice_command("apply all diffs").action == "apply"


def test_classify_revert_commands():
    assert classify_voice_command("revert").action == "revert"
    assert classify_voice_command("revert it").action == "revert"
    assert classify_voice_command("revert changes").action == "revert"
    assert classify_voice_command("undo").action == "revert"
    assert classify_voice_command("undo changes").action == "revert"
    assert classify_voice_command("rollback").action == "revert"
    assert classify_voice_command("discard").action == "revert"

def test_classify_reject_commands():
    assert classify_voice_command("reject").action == "reject"
    assert classify_voice_command("reject it").action == "reject"
    assert classify_voice_command("reject all").action == "reject"
    assert classify_voice_command("reject changes").action == "reject"
    assert classify_voice_command("dismiss").action == "reject"
    assert classify_voice_command("no reject").action == "reject"
    assert classify_voice_command("don't apply").action == "reject"
    assert classify_voice_command("do not apply it").action == "reject"
    assert classify_voice_command("reject all changes").action == "reject"
    assert classify_voice_command("reject all diffs").action == "reject"
    assert classify_voice_command("reject them all").action == "reject"
    assert classify_voice_command("dismiss all changes").action == "reject"
    assert classify_voice_command("don't accept").action == "reject"
    assert classify_voice_command("no").action == "reject"


def test_classify_run_tests_commands():
    assert classify_voice_command("run tests").action == "run_tests"
    assert classify_voice_command("run workspace tests").action == "run_tests"
    assert classify_voice_command("test it").action == "run_tests"
    assert classify_voice_command("check tests").action == "run_tests"
    assert classify_voice_command("run the tests!").action == "run_tests"


def test_classify_auto_repair_commands():
    assert classify_voice_command("fix it").action == "repair"
    assert classify_voice_command("auto repair").action == "repair"
    assert classify_voice_command("repair it").action == "repair"
    assert classify_voice_command("fix the tests").action == "repair"
    assert classify_voice_command("yes fix it").action == "repair"
    assert classify_voice_command("auto fix").action == "repair"


def test_classify_new_session_commands():
    assert classify_voice_command("new session").action == "new_session"
    assert classify_voice_command("start a new session").action == "new_session"
    assert classify_voice_command("start over").action == "new_session"
    assert classify_voice_command("reset session").action == "new_session"
    assert classify_voice_command("clear session").action == "new_session"


def test_no_false_positives_for_coding_requirements():
    # Long sentences or sentences with coding keywords should NOT trigger commands
    assert not classify_voice_command("Can you create a test for user authentication?").is_command
    assert not classify_voice_command("Apply a blue background color to the header component").is_command
    assert not classify_voice_command("Write an endpoint that returns a list of items").is_command
    assert not classify_voice_command("Build a snake game with react and html").is_command
    assert not classify_voice_command("Fix the bug in src/auth.py where tokens expire too fast").is_command
    assert not classify_voice_command("Revert the font-size in styles.css to 16px").is_command

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_api_classify_command_apply():
    res = client.post("/api/commands/classify", json={"transcript": "apply it"})
    assert res.status_code == 200
    data = res.json()
    assert data["is_command"] is True
    assert data["action"] == "apply"
    assert "Applying diffs" in data["feedback_speech"]


def test_api_classify_command_not_a_command():
    res = client.post("/api/commands/classify", json={"transcript": "Build a responsive login form with validation"})
    assert res.status_code == 200
    data = res.json()
    assert data["is_command"] is False
    assert data["action"] == "none"


def test_classify_listening_mode_commands():
    assert classify_voice_command("stop listening").action == "stop_listening"
    assert classify_voice_command("pause listening").action == "stop_listening"
    assert classify_voice_command("start listening").action == "start_listening"
    assert classify_voice_command("go hands free").action == "start_listening"
    assert classify_voice_command("enable auto apply").action == "auto_apply_on"
    assert classify_voice_command("auto apply on").action == "auto_apply_on"
    assert classify_voice_command("disable auto apply").action == "auto_apply_off"
    assert classify_voice_command("auto apply off").action == "auto_apply_off"
    assert classify_voice_command("cancel").action == "cancel"
    assert classify_voice_command("never mind").action == "cancel"
