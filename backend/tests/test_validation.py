"""Tests for the validation service and test execution endpoint."""

from pathlib import Path
import tempfile
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.validation import (
    find_workspace_python,
    parse_pytest_output,
    parse_generic_test_output,
    detect_test_framework,
    run_pytest,
    run_workspace_tests,
    truncate_output,
    TestRunOutcome,
    clean_test_output,
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


def test_detect_test_framework_npm():
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = Path(tmp_dir)
        (tmp_path / "package.json").write_text(
            '{"name": "my-app", "scripts": {"test": "jest"}}',
            encoding="utf-8"
        )
        fw_id, fw_name = detect_test_framework(tmp_path)
        assert fw_id == "npm"
        assert fw_name == "npm test"


def test_detect_test_framework_cargo():
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = Path(tmp_dir)
        (tmp_path / "Cargo.toml").write_text('[package]\nname = "test"', encoding="utf-8")
        fw_id, fw_name = detect_test_framework(tmp_path)
        assert fw_id == "cargo"
        assert fw_name == "cargo test"


def test_detect_test_framework_go():
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = Path(tmp_dir)
        (tmp_path / "go.mod").write_text("module example.com/app", encoding="utf-8")
        fw_id, fw_name = detect_test_framework(tmp_path)
        assert fw_id == "go"
        assert fw_name == "go test"


def test_detect_test_framework_default_pytest():
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = Path(tmp_dir)
        fw_id, fw_name = detect_test_framework(tmp_path)
        assert fw_id == "pytest"
        assert fw_name == "pytest"


def test_parse_generic_test_output_jest():
    stdout = "Tests:  3 passed, 1 failed, 4 total\nTime:   1.234 s"
    passed, failed, errors, skipped, total, duration, summary = parse_generic_test_output(
        stdout, "", 1, framework="npm test"
    )
    assert passed == 3
    assert failed == 1
    assert total == 4
    assert "3 passed, 1 failed" in summary


def test_parse_generic_test_output_cargo():
    stdout = "test result: ok. 5 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out"
    passed, failed, errors, skipped, total, duration, summary = parse_generic_test_output(
        stdout, "", 0, framework="cargo test"
    )
    assert passed == 5
    assert failed == 0
    assert total == 5
    assert "5 passed" in summary


def test_api_validate_detect_endpoint():
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = Path(tmp_dir)
        (tmp_path / "package.json").write_text('{"scripts": {"test": "mocha"}}', encoding="utf-8")
        response = client.get(f"/api/validate/detect?workspace_root={tmp_path}")
        assert response.status_code == 200
        data = response.json()
        assert data["framework"] == "npm"
        assert data["name"] == "npm test"



def test_clean_test_output_strips_ansi():
    raw = "\x1b[36m<body>\x1b[39m\n  [32mhello[39m\n\x1b[0m"
    cleaned = clean_test_output(raw)
    assert "\x1b[" not in cleaned
    assert "[32m" not in cleaned
    assert "[39m" not in cleaned
    assert "hello" in cleaned


def test_clean_test_output_collapses_dom():
    raw = """FAIL src/App.test.js
  ● renders component

    TestingLibraryElementError: Unable to find an element

    Ignored nodes: comments, script, style
    <body>
      <div>
        <div class="header">
          <h1>Title</h1>
        </div>
      </div>
    </body>

      22 |   render(<App />);
      23 |   expect(screen.getByText('foo')).toBeInTheDocument();
"""
    cleaned = clean_test_output(raw)
    assert "TestingLibraryElementError" in cleaned
    assert "[DOM debug output collapsed]" in cleaned
    assert "render(<App />);" in cleaned
