from typing import Optional
from pydantic import BaseModel


class AutoListenRequest(BaseModel):
    enabled: bool = True


class AutoListenStatusResponse(BaseModel):
    enabled: bool
    state: str  # disabled | listening | recording | captured | paused
    audio_id: Optional[str] = None
    duration_seconds: float = 0.0


class AutoListenConsumeResponse(BaseModel):
    audio_id: Optional[str] = None
