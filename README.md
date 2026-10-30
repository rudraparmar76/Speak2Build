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
| 1 | Voice recording + audio upload | Planned |
| 2 | faster-whisper transcription + editable transcript | Planned |
| 3 | LLM requirement extraction, ambiguity detection, clarifications | Planned |
| 4 | Project context inspection (safe, bounded) | Planned |
| 5 | Project-aware code generation + unified diffs | Planned |
| 6 | Diff review, approve/reject, patch apply, validation | Planned |
| 7 | Evaluation suite (20 tasks) + metrics + demo | Planned |

See `DEVELOPMENT_LOG.md` for details and `ARCHITECTURE.md` for design.

## Tech Stack

- **Extension:** TypeScript, React 18, VS Code Webview API, esbuild
- **Backend:** Python 3.12+, FastAPI, Pydantic v2, uvicorn
- **Speech:** faster-whisper (from Milestone 2)
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

### 2. Extension (debug run)

Open the repository root in VS Code and press **F5** ("Run Speak2Build
Extension"). A new VS Code window starts with the extension loaded. Click the
Speak2Build icon in the Activity Bar (left side). The panel shows the backend
connection status and a ping test form.

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

## Current Limitations (Milestone 0)

- Only the connection check (health + echo ping) is implemented; no voice,
  transcription, or code generation yet.
- The backend has no authentication — it is intentionally loopback-only.
- The sidebar must be opened once for the health check to run; the webview
  is created lazily by VS Code.
- Markdown/API docs beyond this README come with later milestones.
