"""Request/response models for mapping spoken replies onto questions."""

from pydantic import BaseModel, Field, field_validator


class MapAnswersRequest(BaseModel):
    """One spoken take covering several pending clarification questions."""

    questions: list[str] = Field(min_length=1, max_length=8)
    transcript: str = Field(min_length=3, max_length=4000)

    @field_validator("questions")
    @classmethod
    def questions_shape(cls, value: list[str]) -> list[str]:
        cleaned = [q.strip() for q in value]
        if any(not q for q in cleaned):
            raise ValueError("questions must be non-blank")
        if len(set(cleaned)) != len(cleaned):
            raise ValueError("questions must be unique")
        return cleaned

    @field_validator("transcript")
    @classmethod
    def transcript_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("transcript must not be blank")
        return value


class MappedAnswerItem(BaseModel):
    question: str
    answer: str


class MappedAnswersModel(BaseModel):
    """Shape the LLM is asked to return (answer may be empty)."""

    answers: list[MappedAnswerItem] = Field(default_factory=list)


class MapAnswersResponse(BaseModel):
    answers: list[MappedAnswerItem]
    model: str
    processing_seconds: float
