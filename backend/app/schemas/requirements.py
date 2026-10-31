"""Pydantic models for requirement extraction.

RequirementModel doubles as (a) LLM-output validation target and (b) the API
response contract, so bad model output cannot reach the extension.
"""

from pydantic import BaseModel, Field


class ClarificationItem(BaseModel):
    """One missing-information question the LLM could not answer itself."""

    question: str = Field(min_length=3)
    reason: str | None = None
    answer: str | None = None


class RequirementModel(BaseModel):
    """The structured contract the whole pipeline consumes after M3."""

    task: str = Field(min_length=1)
    language: str = "python"
    inputs: list[str] = []
    outputs: list[str] = []
    constraints: list[str] = []
    acceptance_criteria: list[str] = []
    clarifications: list[ClarificationItem] = []


class ExtractRequest(BaseModel):
    transcript: str = Field(min_length=3, max_length=8000)
    answers: dict[str, str] | None = None


class ExtractionResponse(BaseModel):
    requirement: RequirementModel
    model: str
    processing_seconds: float
    repaired: bool = False
