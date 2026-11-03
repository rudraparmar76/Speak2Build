"""Request/response models for spoken voice commands."""

from pydantic import BaseModel, Field


class CommandClassifyRequest(BaseModel):
    """Spoken transcript to check for voice command intents."""

    transcript: str = Field(default="", max_length=1000)


class CommandClassifyResponse(BaseModel):
    """Classification outcome indicating whether transcript is an actionable voice command."""

    is_command: bool
    action: str = Field(
        description="One of: apply, revert, run_tests, repair, new_session, none"
    )
    confidence: float = Field(ge=0.0, le=1.0)
    feedback_speech: str = Field(
        default="",
        description="Spoken confirmation to speak aloud to the developer",
    )
