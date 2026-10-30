"""FastAPI application entrypoint.

Run locally with:
    uvicorn app.main:app --port 8000

The app is intentionally minimal in this milestone: CORS middleware plus an
API router. Each later milestone (transcription, requirements, generation,
validation) will add its own router without touching this file.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router

app = FastAPI(title="Speak2Build API", version="0.1.0")

# The backend only listens on the local loopback interface, so permissive CORS
# headers are acceptable: an attacker on another origin/machine cannot reach
# the service, and the VS Code webview origin is opaque and per-render.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
