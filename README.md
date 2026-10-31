# Speak2Build

**Speech-to-Verified-Code for VS Code.**

Speak2Build is an AI-powered VS Code extension that converts spoken programming
instructions into structured requirements, project-aware code changes, and
validated patches — while keeping the developer in full control.

Workflow:

```
Speak → Transcribe → Understand → Clarify → Inspect Project
      → Generate Code → Validate → Review Diff → Approve/Reject
```

## Status

| Milestone | Feature | Status |
|:---:|---|:---:|
| 0 | Extension ↔ React sidebar ↔ FastAPI backend connection | ✅ Done |
| 1 | Voice recording + audio upload | ✅ Done |
| 2 | faster-whisper transcription + editable transcript | ✅ Done |
| 3 | LLM requirement extraction, ambiguity detection, clarifications | ✅ Done |
| 4 | Project context scanning, relevance scoring, bounded snippets | ✅ Done |
| 5 | Project-aware code generation + unified diffs | Planned |
| 6 | Diff review, approve/reject, patch apply, validation | Planned |
| 7 | Evaluation suite (20 tasks) + metrics + demo | Planned |

See `DEVELOPMENT_LOG.md` for details and `ARCHITECTURE.md` for design.

## Tech Stack

- **Extension:** TypeScript, React 18, VS Code Webview API, esbuild
- **Backend:** Python 3.12+, FastAPI, Pydantic v2, uvicorn
- **Speech:** faster-whisper (local STT, model configurable via env)
- **LLM:** provider configured via environment variables (from Milestone 3; no keys ever hardcoded)

## Prerequisites

- Node.js ≥ 20 with npm
- Python ≥ 3.12 (tested on 3.14)
- VS Code ≥ 1.96

## Setup & Running

### 1. Backend

```powershell
cd backend
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
.venv\Scripts\uvicorn app.main:app --port 8000
```

The backend listens on `http://127.0.0.1:8000` (loopback only).

On first health check it warm-loads the Whisper model in a background thread;
the very first load downloads the model into `%USERPROFILE%\.cache\huggingface`.
The sidebar's status chip shows the STT state (`idle → loading → ready`).

Speech model configuration (environment variables):

| Variable | Default | Purpose |
|---|---|---|
| `SPEAK2BUILD_WHISPER_MODEL` | `small` | Model size (`base`, `small`, `medium`…) |
| `SPEAK2BUILD_WHISPER_DEVICE` | `cpu` | `cpu` (or `cuda` if you have NVIDIA + CUDA) |
| `SPEAK2BUILD_WHISPER_COMPUTE_TYPE` | `int8` | Quantization for CPU speed/memory |
| `SPEAK2BUILD_LLM_BASE_URL` | `https://api.openai.com/v1` | Any OpenAI-compatible endpoint (Ollama `http://127.0.0.1:11434/v1`, LM Studio `http://127.0.0.1:1234/v1`, Groq…) |
| `SPEAK2BUILD_LLM_MODEL` | *(none — disables LLM features)* | Model name, e.g. `gpt-4o-mini` or `llama3.1` |
| `SPEAK2BUILD_LLM_API_KEY` | *(none)* | Sent as `Bearer`; optional for local servers |
| `SPEAK2BUILD_LLM_TIMEOUT` | `60` | LLM request timeout (seconds) |

Keys exist only in environment variables — never in code or the extension.

### 2. Extension

**With the debugger (recommended while developing):** open the repository root
in VS Code and press **F5** ("Run Speak2Build Extension"). This rebuilds and
launches a dedicated *Extension Development Host* window with the extension
loaded and breakpoints attached.

**Without the debugger:** run `run-extension.cmd` at the repository root, or:

```powershell
cd extension
npm run build
code --extensionDevelopmentPath=D:\Speak2Build\extension
```

**Permanent install (outside development):**

```powershell
cd extension
npx @vscode/vsce package
code --install-extension speak2build-0.1.0.vsix
```

Then click the Speak2Build icon in the Activity Bar. The panel shows the
backend connection status, a voice recorder, and a ping test form.

Recording: press **Record** (allow the microphone when VS Code asks), speak,
press **Stop**. The recording is converted to 16 kHz mono WAV inside the
webview, uploaded to the backend, and its metadata appears in the panel.
Capability: Milestone 1 stores recordings only — transcription arrives in
Milestone 2.

If the backend URL differs from the default, change the
`speak2build.backendUrl` setting in the debug window.

### 3. Backend tests

```powershell
cd backend
.venv\Scripts\python -m pytest tests\ -v
```

### 4. Extension build/typecheck

```powershell
cd extension
npm install
npm run build        # esbuild → dist/extension.js + media/webview/*
npm run typecheck    # tsc --noEmit
```

## Current Limitations (Milestone 4)

- Requirement extraction is single-shot per call; no requirement history yet.
- Transcription happens synchronously at request time (CPU); long inputs may
  take roughly real-time to slightly faster. A queue/job API is deferred until
  M7 measurements say it's needed.
- Voice Activity Detection trimming disabled for MVP (adds an Ort API surface
  faster-whisper versions can move under us); consecutive-speech dictation works fine without it.
- One active recording session at a time (single global mic session).
- Recordings cap at 120 seconds; no chunked upload for longer sessions yet.
- The backend has no authentication — it is intentionally loopback-only.
- Temp recordings accumulate; a store TTL/cleanup sweep is still pending.
