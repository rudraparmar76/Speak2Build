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


# Properly formatted diffs with trailing newlines (required by git apply)
VALID_DIFF_1 = """--- /dev/null
+++ b/src/email_validator.py
@@ -0,0 +1,10 @@
+import re
+from typing import Optional
+
+EMAIL_RE = re.compile(r'^[^@]+@[^@]+\\.[^@]+$')
+
+def validate_email(email: str) -> bool:
+    \"\"\"Validate email format.\"\"\"
+    if not email:
+        return False
+    return bool(EMAIL_RE.match(email))
"""

VALID_DIFF_2 = """--- /dev/null
+++ b/tests/test_email_validator.py
@@ -0,0 +1,10 @@
+import pytest
+from src.email_validator import validate_email
+
+
+def test_valid_email():
+    assert validate_email('user@example.com')
+
+
+def test_invalid_email():
+    assert not validate_email('not-an-email')
"""

VALID_DIFFS_JSON = json.dumps({
    "diffs": [
        {
            "path": "src/email_validator.py",
            "language": "python",
            "unified_diff": VALID_DIFF_1,
            "is_new_file": True
        },
        {
            "path": "tests/test_email_validator.py",
            "language": "python",
            "unified_diff": VALID_DIFF_2,
            "is_new_file": True
        }
    ],
    "summary": "Created email validator with regex and tests"
})


def test_generate_valid_diffs_first_try(tmp_path):
    # Create a minimal workspace
    (tmp_path / "src").mkdir()
    (tmp_path / "tests").mkdir()

    llm = FakeLLM([VALID_DIFFS_JSON])
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


def test_repair_loop_on_syntax_error(tmp_path):
    bad_json = json.dumps({
        "diffs": [{
            "path": "src/bad.py",
            "language": "python",
            "unified_diff": """--- /dev/null
+++ b/src/bad.py
@@ -0,0 +1,3 @@
+def foo(
+    pass
""",
            "is_new_file": True
        }],
        "summary": "Bad syntax"
    })
    llm = FakeLLM([bad_json, VALID_DIFFS_JSON])
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
    bad1 = json.dumps({"diffs": [{"path": "x.py", "language": "python", "unified_diff": """--- /dev/null
+++ b/x.py
@@ -0,0 +1 @@
+def foo(
""", "is_new_file": True}], "summary": "x"})
    bad2 = json.dumps({"diffs": [{"path": "y.py", "language": "python", "unified_diff": """--- /dev/null
+++ b/y.py
@@ -0,0 +1 @@
+def bar(
""", "is_new_file": True}], "summary": "y"})
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
    content = (tmp_path / "existing.py").read_text()
    assert "y = 2" in content


def test_is_configured(monkeypatch):
    monkeypatch.setenv("SPEAK2BUILD_LLM_MODEL", "test-model")
    assert cg.is_configured() is True

    monkeypatch.delenv("SPEAK2BUILD_LLM_MODEL", raising=False)
    assert cg.is_configured() is False