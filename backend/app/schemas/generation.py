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


class GenerateResponse(BaseModel):
    """Response with validated diffs."""
    diffs: list[FileDiff]
    summary: str
    model: str
    processing_seconds: float
    validated: bool = False
    validation_errors: list[str] = []


class ApplyDiffRequest(BaseModel):
    """Request to apply a unified diff."""
    unified_diff: str = Field(min_length=1)
    workspace_root: str = Field(min_length=1)


class ApplyDiffResponse(BaseModel):
    success: bool
    message: str
    affected_files: list[str] = []