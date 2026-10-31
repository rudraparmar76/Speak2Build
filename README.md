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

## Current Limitations (Milestone 1)

- Recordings are stored by the backend but not yet transcribed (faster-whisper
  arrives in Milestone 2); the sidebar currently shows upload metadata only.
- Recording requires the Windows "Let desktop apps access your microphone"
  toggle (the backend records the mic, not the webview — the webview layer
  categorically denies mic access in current VS Code builds).
- One active recording session at a time (single global mic session).
- Recordings cap at 120 seconds; no chunked upload for longer sessions yet.
- The backend has no authentication — it is intentionally loopback-only.
- Temp recordings accumulate; a store TTL/cleanup sweep comes with M2.
