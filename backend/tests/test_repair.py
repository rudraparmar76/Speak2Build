"""Tests for code auto-repair service and endpoint."""

import json
import tempfile
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.code_generation import CodeGenerationService, GenerationOutcome

client = TestClient(app)


class FakeLLM:
    def __init__(self, responses):
        self._responses = list(responses)
        self.calls = []

    def complete(self, system: str, user: str) -> str:
        self.calls.append({"system": system, "user": user})
        return self._responses.pop(0)


FIXED_CODE = """\
def calculate_discount(price: float, percentage: float) -> float:
    \"\"\"Calculate discounted price.\"\"\"
    if percentage < 0 or percentage > 100:
        raise ValueError("Invalid percentage")
    return price * (1.0 - percentage / 100.0)
"""

REPAIR_JSON = json.dumps({
    "files": [
        {
            "path": "src/pricing.py",
            "language": "python",
            "content": FIXED_CODE,
            "is_new_file": False
        }
    ],
    "summary": "Fixed discount calculation to handle boundary values properly"
})


def test_code_generation_service_repair():
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = Path(tmp_dir)
        src_file = tmp_path / "src" / "pricing.py"
        src_file.parent.mkdir(parents=True)
        src_file.write_text("def calculate_discount(price, p):\n    return price - p\n", encoding="utf-8")

        fake_llm = FakeLLM([REPAIR_JSON])
        service = CodeGenerationService(fake_llm, "test-model")

        outcome = service.repair(
            requirement_text="Calculate discounted price from percentage",
            failed_test_output="FAIL: test_calculate_discount - assert 90 == 80",
            context_snippets=[{
                "path": "src/pricing.py",
                "content": src_file.read_text(),
                "start_line": 1,
                "end_line": 2,
            }],
            options={"include_tests": False},
            workspace_root=tmp_path,
        )

        assert len(outcome.diffs) == 1
        assert outcome.diffs[0].path == "src/pricing.py"
        assert "[Auto-Repair]" in outcome.summary
        assert "price * (1.0 - percentage / 100.0)" in outcome.diffs[0].unified_diff
        # Ensure the prompt contained the failure output
        assert "FAIL: test_calculate_discount" in fake_llm.calls[0]["user"]


def test_api_repair_endpoint():
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = Path(tmp_dir)
        (tmp_path / "index.js").write_text("module.exports = { greet: () => 'hi' };\n", encoding="utf-8")

        # Mock configured environment
        import os
        old_model = os.environ.get("SPEAK2BUILD_LLM_MODEL")
        try:
            # When model is not configured, should return 503
            if "SPEAK2BUILD_LLM_MODEL" in os.environ:
                del os.environ["SPEAK2BUILD_LLM_MODEL"]
            res = client.post("/api/repair", json={
                "requirement_text": "Fix greeting",
                "failed_test_output": "Expected 'hello' got 'hi'",
                "workspace_root": str(tmp_path),
            })
            assert res.status_code == 503
        finally:
            if old_model:
                os.environ["SPEAK2BUILD_LLM_MODEL"] = old_model

