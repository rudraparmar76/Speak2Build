"""HTTP endpoint definitions.

Endpoints stay thin: parse request, delegate to logic, return a response
model. Business services will be added in later milestones and called from
here, never inlined into the endpoint bodies.
"""

import time

from fastapi import APIRouter

from app.schemas.common import HealthResponse, PingRequest, PingResponse

router = APIRouter()

API_VERSION = "0.1.0"


@router.get("/api/health", response_model=HealthResponse)
def health() -> HealthResponse:
    """Simple liveness probe used by the extension on webview startup."""
    return HealthResponse(status="ok", version=API_VERSION)


@router.post("/api/ping", response_model=PingResponse)
def ping(payload: PingRequest) -> PingResponse:
    """Echo endpoint that proves the extension → backend message chain works."""
    return PingResponse(
        echo=payload.message,
        received_chars=len(payload.message),
        timestamp=time.time(),
    )
