"""Tests for code generation service and validation."""

import json
import tempfile
from pathlib import Path

import pytest

from app.services import code_generation as cg


class FakeLLM:
    def __init__(self, responses):
        self._responses = list(responses)
        self.calls = []

    def complete(self, system: str, user: str) -> str:
        self.calls.append({"system": system, "user": user})
        return self._responses.pop(0)


# New format: LLM returns complete file contents, diffs are computed by us
VALID_FILE_CONTENT_1 = """\
import re
from typing import Optional

EMAIL_RE = re.compile(r'^[^@]+@[^@]+\\.[^@]+$')

def validate_email(email: str) -> bool:
    \"\"\"Validate email format.\"\"\"
    if not email:
        return False
    return bool(EMAIL_RE.match(email))
"""

VALID_FILE_CONTENT_2 = """\
import pytest
from src.email_validator import validate_email


def test_valid_email():
    assert validate_email('user@example.com')


def test_invalid_email():
    assert not validate_email('not-an-email')
"""

VALID_FILES_JSON = json.dumps({
    "files": [
        {
            "path": "src/email_validator.py",
            "language": "python",
            "content": VALID_FILE_CONTENT_1,
            "is_new_file": True
        },
        {
            "path": "tests/test_email_validator.py",
            "language": "python",
            "content": VALID_FILE_CONTENT_2,
            "is_new_file": True
        }
    ],
    "summary": "Created email validator with regex and tests"
})


def test_generate_valid_files_first_try(tmp_path):
    # Create a minimal workspace
    (tmp_path / "src").mkdir()
    (tmp_path / "tests").mkdir()

    llm = FakeLLM([VALID_FILES_JSON])
    service = cg.CodeGenerationService(llm, model_name="fake")

    outcome = service.generate(
        requirement_text="Create an email validator function",
        context_snippets=[],
        options={"include_tests": True},
        workspace_root=tmp_path,
    )

    assert outcome.validated is True
    assert len(outcome.diffs) == 2
    assert outcome.diffs[0].path == "src/email_validator.py"
    assert outcome.diffs[1].path == "tests/test_email_validator.py"
    assert outcome.validation_errors == []
    # Diffs should have proper headers (computed by difflib)
    assert "--- /dev/null" in outcome.diffs[0].unified_diff
    assert "+++ b/src/email_validator.py" in outcome.diffs[0].unified_diff


def test_repair_loop_on_syntax_error(tmp_path):
    bad_json = json.dumps({
        "files": [{
            "path": "src/bad.py",
            "language": "python",
            "content": "def foo(\n    pass\n",
            "is_new_file": True
        }],
        "summary": "Bad syntax"
    })
    llm = FakeLLM([bad_json, VALID_FILES_JSON])
    service = cg.CodeGenerationService(llm, model_name="fake")

    outcome = service.generate(
        requirement_text="test",
        context_snippets=[],
        options={},
        workspace_root=tmp_path,
    )

    assert outcome.validated is True
    assert len(service._llm.calls) == 2  # retried once
    second_user = service._llm.calls[1]["user"]
    assert "FAILED VALIDATION" in second_user


def test_two_failures_raise(tmp_path):
    bad1 = json.dumps({"files": [{"path": "x.py", "language": "python",
        "content": "def foo(\n    pass\n", "is_new_file": True}], "summary": "x"})
    bad2 = json.dumps({"files": [{"path": "y.py", "language": "python",
        "content": "def bar(\n    pass\n", "is_new_file": True}], "summary": "y"})
    llm = FakeLLM([bad1, bad2])
    service = cg.CodeGenerationService(llm, model_name="fake")

    with pytest.raises(cg.CodeGenerationError, match="2 attempts"):
        service.generate("test", [], {}, tmp_path)


def test_validate_python_syntax():
    errors = cg.validate_python_syntax("def foo():\n    pass", "test.py")
    assert errors == []

    errors = cg.validate_python_syntax("def foo(\n    pass", "test.py")
    assert len(errors) == 1
    assert "test.py" in errors[0]


def test_compute_unified_diff_new_file():
    """Computed diffs should have proper headers for new files."""
    content = "x = 1\ny = 2\n"
    diff = cg.compute_unified_diff("", content, "new_file.py", is_new_file=True)
    assert "--- /dev/null" in diff
    assert "+++ b/new_file.py" in diff
    assert "+x = 1" in diff
    assert "+y = 2" in diff


def test_compute_unified_diff_modified_file():
    """Computed diffs should have proper headers for modified files."""
    old = "x = 1\n"
    new = "x = 1\ny = 2\n"
    diff = cg.compute_unified_diff(old, new, "existing.py", is_new_file=False)
    assert "--- a/existing.py" in diff
    assert "+++ b/existing.py" in diff
    assert "+y = 2" in diff


def test_compute_unified_diff_no_changes():
    """No changes should return empty string."""
    content = "x = 1\n"
    diff = cg.compute_unified_diff(content, content, "same.py", is_new_file=False)
    assert diff == ""


def test_validate_diff_applies(tmp_path):
    # Create a file to patch
    (tmp_path / "existing.py").write_text("x = 1\n")

    diff = """--- a/existing.py
+++ b/existing.py
@@ -1 +1,2 @@
 x = 1
+y = 2
"""
    errors = cg.validate_diff_applies(diff, tmp_path)
    assert errors == []

    # Malformed diff (bad hunk header)
    bad_diff = """--- a/existing.py
+++ b/existing.py
@@ -999 +1 @@
 x = 1
"""
    errors = cg.validate_diff_applies(bad_diff, tmp_path)
    assert len(errors) > 0


def test_apply_diff(tmp_path):
    (tmp_path / "existing.py").write_text("x = 1\n")

    diff = """--- a/existing.py
+++ b/existing.py
@@ -1 +1,2 @@
 x = 1
+y = 2
"""
    success, msg, affected = cg.apply_diff(diff, tmp_path)
    assert success
    assert "existing.py" in affected
    assert (tmp_path / "existing.py").read_text() == "x = 1\ny = 2\n"


def test_safe_directory_handles_files_and_invalid_paths(tmp_path):
    """Passing a file path as workspace_root should not raise [WinError 267]."""
    test_file = tmp_path / "sample.py"
    test_file.write_text("a = 10\n")

    # Pass the file itself as workspace_root
    safe_dir = cg._safe_directory(test_file)
    assert safe_dir == tmp_path
    assert safe_dir.is_dir()

    # validate_diff_applies should succeed without WinError 267
    diff = """--- a/sample.py
+++ b/sample.py
@@ -1 +1,2 @@
 a = 10
+b = 20
"""
    errors = cg.validate_diff_applies(diff, test_file)
    assert errors == []


def test_read_file_safe_utf16_bom(tmp_path):
    """Files saved with UTF-16 LE encoding and BOM (\xff\xfe) decode cleanly."""
    file_path = tmp_path / "utf16_main.py"
    content = "def hello():\n    return 'world'\n"
    # Write as UTF-16 with BOM
    file_path.write_bytes(content.encode("utf-16"))

    result = cg.read_file_safe(file_path)
    assert result == content


def test_is_configured(monkeypatch):
    monkeypatch.setenv("SPEAK2BUILD_LLM_MODEL", "test-model")
    assert cg.is_configured() is True

    monkeypatch.delenv("SPEAK2BUILD_LLM_MODEL", raising=False)
    assert cg.is_configured() is False


def test_parse_file_generation_strips_fences():
    """Parser should handle markdown-fenced JSON output."""
    raw = "```json\n" + VALID_FILES_JSON + "\n```"
    files, summary = cg._parse_file_generation(raw)
    assert len(files) == 2
    assert summary == "Created email validator with regex and tests"


def test_parse_file_generation_rejects_empty():
    """Parser should reject empty files list."""
    with pytest.raises(ValueError, match="No files"):
        cg._parse_file_generation('{"files": [], "summary": "nothing"}')


def test_validate_file_content():
    """validate_file_content should catch syntax errors."""
    errors = cg.validate_file_content("def foo():\n    pass\n", "ok.py", "python", Path("."))
    assert errors == []

    errors = cg.validate_file_content("def foo(\n", "bad.py", "python", Path("."))
    assert len(errors) > 0


def test_is_utf8_on_disk(tmp_path):
    """_is_utf8_on_disk returns False for UTF-16 files, True for UTF-8."""
    utf8_file = tmp_path / "utf8.py"
    utf8_file.write_text("hello\n", encoding="utf-8")
    assert cg._is_utf8_on_disk(utf8_file) is True

    utf16_file = tmp_path / "utf16.py"
    utf16_file.write_bytes("hello\n".encode("utf-16"))
    assert cg._is_utf8_on_disk(utf16_file) is False

    # Non-existent file should return True (safe for new file diffs)
    assert cg._is_utf8_on_disk(tmp_path / "nope.py") is True


def test_apply_diff_fallback_for_utf16(tmp_path):
    """apply_diff should fall back to direct write for non-UTF-8 files."""
    # Create a UTF-16 encoded file that git apply can't handle
    src_file = tmp_path / "src" / "main.py"
    src_file.parent.mkdir(parents=True, exist_ok=True)
    original = "x = 1\n"
    src_file.write_bytes(original.encode("utf-16"))

    # Compute diff using decoded content (as generate() does)
    old_decoded = cg.read_file_safe(src_file)
    new_content = "x = 42\n"
    unified = cg.compute_unified_diff(old_decoded, new_content, "src/main.py", False)
    assert unified  # should have changes

    full_diff = cg.ensure_diff_headers(unified, "src/main.py", False)
    ok, msg, affected = cg.apply_diff(full_diff, tmp_path)
    assert ok is True
    assert "src/main.py" in affected
    # The file should now be UTF-8 with the new content
    assert src_file.read_text(encoding="utf-8") == new_content


def test_run_pytest_on_files_no_tests(tmp_path):
    """run_pytest_on_files should return empty list when no test files generated."""
    generated = [
        cg._GeneratedFile(
            path="src/foo.py",
            language="python",
            content="def foo():\n    return 42\n",
            is_new_file=True,
        )
    ]
    options = {"include_tests": True}
    errors = cg.run_pytest_on_files(generated, tmp_path, options)
    # No test files generated, but existing test files might be found
    # In empty tmp_path, should return empty
    assert errors == []


def test_run_pytest_on_files_include_tests_false(tmp_path):
    """run_pytest_on_files should skip when include_tests is False."""
    generated = [
        cg._GeneratedFile(
            path="tests/test_foo.py",
            language="python",
            content="def test_foo():\n    assert True\n",
            is_new_file=True,
        )
    ]
    options = {"include_tests": False}
    errors = cg.run_pytest_on_files(generated, tmp_path, options)
    assert errors == []


def test_run_pytest_on_files_with_passing_test(tmp_path):
    """run_pytest_on_files should pass when generated tests pass."""
    # Create a simple module
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "math_utils.py").write_text("def add(a, b):\n    return a + b\n")

    generated = [
        cg._GeneratedFile(
            path="tests/test_math_utils.py",
            language="python",
            content="from src.math_utils import add\n\ndef test_add():\n    assert add(2, 3) == 5\n",
            is_new_file=True,
        )
    ]
    options = {"include_tests": True}
    errors = cg.run_pytest_on_files(generated, tmp_path, options)
    assert errors == []


def test_run_pytest_on_files_with_failing_test(tmp_path):
    """run_pytest_on_files should return errors when tests fail."""
    generated = [
        cg._GeneratedFile(
            path="tests/test_fail.py",
            language="python",
            content="def test_fail():\n    assert False, 'intentional failure'\n",
            is_new_file=True,
        )
    ]
    options = {"include_tests": True}
    errors = cg.run_pytest_on_files(generated, tmp_path, options)
    assert len(errors) > 0
    assert any("fail" in err.lower() or "assert" in err.lower() for err in errors)


def test_run_pytest_on_files_missing_dependency(tmp_path):
    """Missing third-party packages should be reported as skipped environment dependencies, not fatal failures."""
    generated = [
        cg._GeneratedFile(
            path="tests/test_dep.py",
            language="python",
            content="import nonexistent_pkg_12345\ndef test_pkg(): pass\n",
            is_new_file=True,
        )
    ]
    options = {"include_tests": True}
    errors = cg.run_pytest_on_files(generated, tmp_path, options)
    assert len(errors) == 1
    assert "not installed in the Python environment" in errors[0]
    assert "nonexistent_pkg_12345" in errors[0]


def test_invert_unified_diff():
    diff = """--- a/src/main.py
+++ b/src/main.py
@@ -1,2 +1,3 @@
 def hello():
-    return 1
+    return 2
+    # note
"""
    inverted = cg.invert_unified_diff(diff)
    assert "--- a/src/main.py" in inverted
    assert "+++ b/src/main.py" in inverted
    assert "@@ -1,3 +1,2 @@" in inverted
    assert "+    return 1" in inverted
    assert "-    return 2" in inverted
    assert "-    # note" in inverted


def test_revert_modified_file(tmp_path):
    f = tmp_path / "calc.py"
    f.write_text("def val():\n    return 1\n", encoding="utf-8")

    diff = """--- a/calc.py
+++ b/calc.py
@@ -1,2 +1,2 @@
 def val():
-    return 1
+    return 100
"""
    cg.apply_diff(diff, tmp_path)
    assert f.read_text(encoding="utf-8") == "def val():\n    return 100\n"

    ok, msg, affected = cg.revert_diff(diff, tmp_path)
    assert ok is True
    assert "calc.py" in affected
    assert f.read_text(encoding="utf-8") == "def val():\n    return 1\n"


def test_revert_new_file(tmp_path):
    new_f = tmp_path / "created.py"
    diff = """--- /dev/null
+++ b/created.py
@@ -0,0 +1,2 @@
+def brand_new():
+    pass
"""
    cg.apply_diff(diff, tmp_path)
    assert new_f.exists()

    ok, msg, affected = cg.revert_diff(diff, tmp_path)
    assert ok is True
    assert not new_f.exists()


def test_api_diff_revert(tmp_path):
    from fastapi.testclient import TestClient
    from app.main import app
    client = TestClient(app)

    f = tmp_path / "code.py"
    f.write_text("orig = True\n", encoding="utf-8")

    diff = """--- a/code.py
+++ b/code.py
@@ -1 +1,2 @@
 orig = True
+added = True
"""
    cg.apply_diff(diff, tmp_path)
    assert "added = True" in f.read_text(encoding="utf-8")

    res = client.post("/api/diff/revert", json={"unified_diff": diff, "workspace_root": str(tmp_path)})
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert "code.py" in data["affected_files"]
    assert "added = True" not in f.read_text(encoding="utf-8")
