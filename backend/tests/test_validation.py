"""Tests for the validation service and test execution endpoint."""

from pathlib import Path
import tempfile
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.validation import (
    find_workspace_python,
    parse_pytest_output,
    run_pytest,
    truncate_output,
    TestRunOutcome,
)

client = TestClient(app)


def test_parse_pytest_output_passed():
    stdout = "test_sample.py . [100%]\n\n=== 2 passed in 0.15s ==="
    passed, failed, errors, skipped, total, duration, summary = parse_pytest_output(stdout, "", 0)
    assert passed == 2
    assert failed == 0
    assert errors == 0
    assert skipped == 0
    assert total == 2
    assert duration == 0.15
    assert "2 passed in 0.15s" in summary


def test_parse_pytest_output_failed():
    stdout = "test_sample.py F. [100%]\n\n=== 1 failed, 2 passed, 1 skipped in 0.45s ==="
    passed, failed, errors, skipped, total, duration, summary = parse_pytest_output(stdout, "", 1)
    assert passed == 2
    assert failed == 1
    assert skipped == 1
    assert total == 4
    assert duration == 0.45
    assert "2 passed, 1 failed, 1 skipped in 0.45s" in summary


def test_parse_pytest_output_no_tests():
    stdout = "=== no tests ran in 0.00s ==="
    passed, failed, errors, skipped, total, duration, summary = parse_pytest_output(stdout, "", 5)
    assert total == 0
    assert summary == "No tests collected"


def test_truncate_output_short():
    text = "Short output"
    assert truncate_output(text, max_chars=100) == text


def test_truncate_output_long():
    text = "A" * 200
    truncated = truncate_output(text, max_chars=80)
    assert len(truncated) <= 80
    assert "truncated" in truncated


def test_run_pytest_passing_test():
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = Path(tmp_dir)
        test_file = tmp_path / "test_ok.py"
        test_file.write_text("def test_ok():\n    assert 1 + 1 == 2\n", encoding="utf-8")

        outcome = run_pytest(tmp_path, test_path="test_ok.py", timeout_seconds=15)
        assert outcome.success is True
        assert outcome.passed == 1
        assert outcome.failed == 0
        assert "1 passed" in outcome.summary


def test_run_pytest_failing_test():
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = Path(tmp_dir)
        test_file = tmp_path / "test_fail.py"
        test_file.write_text("def test_fail():\n    assert 1 == 2\n", encoding="utf-8")

        outcome = run_pytest(tmp_path, test_path="test_fail.py", timeout_seconds=15)
        assert outcome.success is False
        assert outcome.failed == 1
        assert "1 failed" in outcome.summary


def test_run_pytest_path_traversal():
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = Path(tmp_dir)
        outcome = run_pytest(tmp_path, test_path="../../etc/passwd", timeout_seconds=5)
        assert outcome.success is False
        assert "traversal" in outcome.output.lower() or "outside workspace" in outcome.summary.lower()


def test_run_pytest_nonexistent_workspace():
    fake_path = Path("Z:/nonexistent_workspace_path_12345")
    outcome = run_pytest(fake_path, timeout_seconds=5)
    assert outcome.success is False
    assert "does not exist" in outcome.summary


def test_api_validate_tests_endpoint():
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = Path(tmp_dir)
        test_file = tmp_path / "test_api_check.py"
        test_file.write_text("def test_api():\n    assert True\n", encoding="utf-8")

        response = client.post(
            "/api/validate/tests",
            json={
                "workspace_root": str(tmp_path),
                "test_path": "test_api_check.py",
                "timeout_seconds": 15,
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["passed"] == 1
        assert "1 passed" in data["summary"]


def test_api_validate_tests_bad_workspace():
    response = client.post(
        "/api/validate/tests",
        json={
            "workspace_root": "Z:/nonexistent_workspace_path_12345",
            "timeout_seconds": 15,
        },
    )
    assert response.status_code == 400
