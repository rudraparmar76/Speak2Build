"""Shared test fixtures.

The autouse fixture disables Whisper model warm-up for every test: model
loading would otherwise trigger a multi-hundred-MB download inside unit
tests. Real-model behavior is verified separately through manual live probes.
"""

import pytest


@pytest.fixture(autouse=True)
def disable_model_warmup(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SPEAK2BUILD_ENABLE_MODEL_LOAD", "0")
