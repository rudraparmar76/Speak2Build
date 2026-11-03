"""Pydantic models for project context scanning and relevance."""

from pydantic import BaseModel, Field
from typing import Optional


class FileNode(BaseModel):
    """A node in the workspace file tree (directories nested)."""
    name: str
    path: str  # relative to workspace root
    is_dir: bool
    language: Optional[str] = None
    size_bytes: int = 0
    children: list["FileNode"] = []


FileNode.model_rebuild()


class ScanRequest(BaseModel):
    workspace_root: str = Field(min_length=1)
    max_files: int = 5000


class ScanResponse(BaseModel):
    workspace_root: str
    languages: list[str]
    file_tree: FileNode
    total_files: int
    scanned_files: int


class Snippet(BaseModel):
    """A bounded code snippet from a relevant file."""
    path: str
    language: Optional[str] = None
    content: str
    start_line: int
    end_line: int


class RelevantRequest(BaseModel):
    requirement_text: str = Field(default="", max_length=8000)
    file_paths: list[str] = Field(default_factory=list, max_length=1000)
    workspace_root: str = Field(min_length=1)
    max_snippet_lines: int = 200
    max_total_chars: int = 8000


class RelevantResponse(BaseModel):
    snippets: list[Snippet]
    total_chars: int
    truncated: bool