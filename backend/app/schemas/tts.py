"""Request/response models for text-to-speech playback."""

from pydantic import BaseModel, Field, field_validator


class SpeakRequest(BaseModel):
    """One utterance for the backend to synthesize and play aloud."""

    text: str = Field(min_length=1, max_length=2000)
    voice: str | None = None
    rate: str | None = None

    @field_validator("text")
    @classmethod
    def text_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("text must not be blank")
        return value

    @field_validator("rate")
    @classmethod
    def rate_shape(cls, value: str | None) -> str | None:
        if value is not None:
            import re

            if re.match(r"^[+-]\d{1,3}%$", value) is None:
                raise ValueError("rate must look like '+10%' or '-5%'")
        return value


class SpeakResponse(BaseModel):
    """Facts about the utterance currently playing through the backend."""

    played: bool
    characters: int
    duration_seconds: float
    sample_rate: int
    voice: str
    rate: str


class StopSpeakResponse(BaseModel):
    stopped: bool
