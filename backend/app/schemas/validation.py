"""Pydantic models for test validation."""

from typing import Optional
from pydantic import BaseModel, Field


class TestRunRequest(BaseModel):
    """Request to run workspace tests."""
    __test__ = False
    workspace_root: str = Field(min_length=1)
    test_path: Optional[str] = None
    timeout_seconds: int = Field(default=30, ge=1, le=120)


class TestRunResponse(BaseModel):
    """Response reporting workspace test results."""
    __test__ = False
    success: bool
    passed: int = 0
    failed: int = 0
    errors: int = 0
    skipped: int = 0
    total: int = 0
    duration_seconds: float = 0.0
    summary: str = ""
    output: str = ""
