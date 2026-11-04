"""Pydantic models for code generation."""

from pydantic import BaseModel, Field
from typing import Optional, Literal


class FileDiff(BaseModel):
    """A unified diff for a single file."""
    path: str = Field(min_length=1)
    language: str = Field(min_length=1)
    unified_diff: str = Field(min_length=1)
    is_new_file: bool = False


class GenerateRequest(BaseModel):
    """Request to generate code from requirement + context."""
    requirement_text: str = Field(min_length=1, max_length=8000)
    context_snippets: list[dict] = Field(default_factory=list)
    options: dict = Field(default_factory=dict)
    workspace_root: Optional[str] = None
    conversation_history: list[dict] = Field(default_factory=list)


class GenerateResponse(BaseModel):
    """Response with validated diffs."""
    diffs: list[FileDiff]
    summary: str
    model: str
    processing_seconds: float
    validated: bool = False
    validation_errors: list[str] = []
    test_errors: list[str] = []
    tests_passed: bool = False


class RepairRequest(BaseModel):
    """Request to auto-repair failing tests with LLM guidance."""
    requirement_text: str = Field(min_length=1, max_length=8000)
    failed_test_output: str = Field(min_length=1, max_length=15000)
    context_snippets: list[dict] = Field(default_factory=list)
    workspace_root: Optional[str] = None
    options: dict = Field(default_factory=dict)
    framework: Optional[str] = None


class RepairResponse(BaseModel):
    """Response containing repair diffs for failing tests."""
    diffs: list[FileDiff]
    summary: str
    model: str
    processing_seconds: float
    validated: bool = False
    validation_errors: list[str] = []
    test_errors: list[str] = []
    tests_passed: bool = False
    repaired: bool = True


class ApplyDiffRequest(BaseModel):
    """Request to apply a unified diff."""
    unified_diff: str = Field(min_length=1)
    workspace_root: str = Field(min_length=1)


class ApplyDiffResponse(BaseModel):
    """Result of applying diffs."""
    success: bool
    message: str
    affected_files: list[str] = []


class RevertDiffRequest(BaseModel):
    """Request to revert an applied unified diff."""
    unified_diff: str = Field(min_length=1)
    workspace_root: str = Field(min_length=1)


class RevertDiffResponse(BaseModel):
    """Result of reverting diffs."""
    success: bool
    message: str
    affected_files: list[str] = []
