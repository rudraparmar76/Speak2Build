# Speak2Build — Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│  VS CODE EXTENSION (TypeScript + React)                     │
│                                                             │
│  Sidebar Webview (React 18, sandboxed iframe)               │
│      │  window.postMessage (WebviewToHost)                  │
│      ↓                                                      │
│  Extension Host (Node.js, extension.ts + providers/services)│
│      │  HTTP fetch → speak2build.backendUrl (127.0.0.1:8000)│
└──────┼──────────────────────────────────────────────────────┘
       ↓
┌─────────────────────────────────────────────────────────────┐
│  FASTAPI BACKEND (Python)                                   │
│  main.py ─ CORS ─ api/routes                                │
│                                                             │
│  Speech Service      → faster-whisper (planned, M2)         │
│  Requirement Service → LLM + Pydantic (planned, M3)         │
│  Context Service     → workspace inspection (planned, M4)   │
│  Generation Service  → LLM patches (planned, M5)            │
│  Validation Service  → syntax + pytest (planned, M6)        │
└─────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

### Extension (TypeScript)

| File | Responsibility |
|---|---|
| `extension/src/extension.ts` | Activation; registers the sidebar provider; resolves `speak2build.backendUrl` from settings on each use |
| `extension/src/providers/sidebarPanel.ts` | Webview lifecycle; generates HTML with CSP + per-render nonce; routes `WebviewToHost` messages to services; posts `HostToWebview` results back |
| `extension/src/services/backendClient.ts` | All backend HTTP access; 5s timeout via `AbortController`; maps connection/HTTP/timeout errors to human-readable strings |
| `extension/src/types/messages.ts` | The webview↔host message contract: typed unions `WebviewToHost` and `HostToWebview` (single source of truth) |

### Speech Recognition (backend, python)

| File | Responsibility |
|---|---|
| `backend/app/services/transcription.py` | faster-whisper service: env-configured model (`SPEAK2BUILD_WHISPER_MODEL`, default `small`, device `cpu`, compute `int8`), background warm-up on first health probe, state machine `idle/loading/ready/error` surfaced via `/api/health`, `transcribe(path)` returning language + segments |
| `backend/app/schemas/transcription.py` | `TranscribeRequest` (regex-validated audio_id), `TranscriptSegment`, `TranscriptionResponse` |

Pin note: `av<18` — faster-whisper 1.2.1 calls `av.open(..., metadata_errors=...)`, removed in av 18+.

### Requirement Intelligence (M3)

| File | Responsibility |
|---|---|
| `backend/app/services/llm_client.py` | OpenAI-compatible chat-completions client; config only from env (`SPEAK2BUILD_LLM_*`); typed errors for unreachable vs provider-rejected; `httpx.MockTransport` test seam |
| `backend/app/services/requirements.py` | Prompt contract → LLM → JSON parse → Pydantic validate → **repair loop** (validation errors fed back, bounded at 2 attempts) → answer reconciliation |
| `backend/app/schemas/requirements.py` | `RequirementModel` (task/inputs/outputs/constraints/acceptance_criteria/clarifications), `ExtractRequest` (transcript ≤ 8 000 chars + answers), `ExtractionResponse` |

`POST /api/requirements` error taxonomy: `503` unconfigured/unreachable provider, `502` provider rejected the request, `422` model output could not be repaired into schema-valid JSON. Ambiguity is *not* an error — it is `clarifications` inside a `200`.

**Transcript-only data boundary:** only the (edited) transcript text leaves the machine, bounded to 8 000 chars; project files are never sent here — the (also bounded, separately consented) context job belongs to M4.

### Project Context (M4)

| File | Responsibility |
|---|---|
| `backend/app/services/project_context.py` | Workspace scan (walk, skip build/VCS dirs, detect languages by extension), heuristic relevance scoring (token overlap + path patterns), bounded snippet extraction (head/tail + imports region, ≤ 200 lines/file, ≤ 8k chars total) |
| `backend/app/schemas/context.py` | `ScanRequest/Response` (workspace root, languages, file tree), `RelevantRequest/Response` (requirement text, file paths, workspace root, snippets with line ranges) |

`POST /api/context/scan` returns a full file tree with language metadata. `POST /api/context/relevant` takes a requirement + user-selected file paths + workspace root, returns scored snippets. **No file contents are sent to the LLM without explicit user selection** — the sidebar shows the tree with checkboxes, the user picks, then snippets are fetched.

**Privacy boundary:** only user-approved snippets leave the machine, bounded by line/char limits. Full file contents are never transmitted.

| `extension/src/webview/*` | React UI. Renders state; never calls the backend or VS Code APIs directly — only `postMessage` |

### Backend (Python)

| File | Responsibility |
|---|---|
| `backend/app/main.py` | App factory-style setup: CORS middleware + router registration |
| `backend/app/api/routes.py` | HTTP endpoints; thin controllers that delegate to services |
| `backend/app/schemas/` | Pydantic request/response models (the public API contract) |
| `backend/tests/` | pytest suite using FastAPI `TestClient` (full ASGI stack, no socket) |

## Data Flow (Milestone 0 message chain)

```
React (App.tsx)                 Node host (sidebarPanel.ts)        Python backend
───────────────                 ───────────────────────────        ──────────────
postMessage(checkHealth)  ───▶  BackendClient.health()      ───▶   GET /api/health
postMessage(ping, msg)    ───▶  BackendClient.ping(msg)     ───▶   POST /api/ping
postMessage(pingResult)   ◀───  echo                        ◀───   {"echo","received_chars","timestamp"}
postMessage(hostError)    ◀───  caught error, mapped to text
```

## API Contract

### `GET /api/health`
Response `200`: `{ "status": "ok", "version": "0.1.0" }`

### `POST /api/ping`
Request: `{ "message": string (1–2000 chars) }` → `422` if invalid.
Response `200`: `{ "echo": string, "received_chars": int, "timestamp": float }`

### `POST /api/transcribe`
Request: `{ "audio_id": "<32-char hex>" }` (regex-validated; the reference never carries audio bytes).
Response `200`: `{ audio_id, language, duration_seconds, processing_seconds, text, segments: [{start, end, text}] }`
Errors: `422` malformed id; `404` recording missing (expired temp file); `503` model not ready (state included in detail).
First-call behavior: the endpoint idempotently triggers warm-up, expecting `503` on a *very* first call if you race it; the sidebar's health chip shows `STT: ready` when safe to use.

### `POST /api/recording/start`
No body. Opens the backend's microphone and starts an in-memory session.
Response `201`: `{ "sample_rate": int, "channels": int }`
Errors: `409` session already active; `503` microphone unavailable (with OS-settings hint).

### `POST /api/recording/stop`
No body. Finalizes the active session, stores it (same validation/UUID storage as `POST /api/audio`).
Response `201`: `AudioUploadResponse`.
Errors: `409` no active session (including after auto-stop... auto-stop stores the result, so a late stop still returns `201`).

### `DELETE /api/recording`
Discards the active session. Response: `204 No Content`.

### `POST /api/audio`
Request body: raw WAV bytes. Validated: size ≤ 20 MB → `413`; RIFF/WAVE PCM
magic + fmt chunk checks → `415`; empty → `400`. Stored at
`<TEMP>/speak2build-audio/<uuid>.wav`; the `audio_id` (uuid hex) is the only
handle, and `audio_store.path_for()` re-validates its format before any path
construction. Response `201`: `AudioUploadResponse` (id, duration, rate,
channels, size).

## Webview Recording Pipeline (Milestone 1, revised)

Original design: record with `MediaRecorder` inside the webview iframe. This is
**platform-impossible**: VS Code webviews run as sandboxed iframes whose
Chromium permissions policy denies `getUserMedia` without ever prompting
(microsoft/vscode#113916, #250568; consent-gated fix pending as proposed API
#323602). Copilot's mic works because its capture is workbench-side, not
webview-side.

Revised design — **backend-owned microphone**:

```
Record click (webview) ──▶ host ──POST /api/recording/start──▶ backend
                               (PortAudio/sounddevice InputStream,
                                mono 16 kHz float32, callback → memory)
Stop click (webview)  ───▶ host ──POST /api/recording/stop───▶ backend
                               (concatenate → PCM16 WAV → validate →
                                UUID temp storage)
                     ◀── {audioId, durationSeconds, sampleRate, channels, sizeBytes}
Cancel click         ───▶ host ──DELETE /api/recording─────────▶ backend (204)
```

Rationale: the mic permission then reduces to the standard Windows "desktop
apps" toggle (same layer VS Code/Copilot already use), Python performs
resample/encode with native numpy/wave code, no FFmpeg binary dependency, and
the stored WAV is 16 kHz — whisper-ready for M2. Trade-off: single global
session (one mic, one active recording — enforced by `RecordingBusyError`/409)
and a short residual delay on stop while audio drains; acceptable for a
single-user MVP tool.

Recordings cap at 120 s, enforced twice: a backend watchdog timer (auto-finishes
and stores) and a UI timer.


## Key Design Decisions

1. **Local FastAPI sidecar, not in-process Python.** The extension host is Node;
   faster-whisper must run in a Python process. A persistent local server keeps
   models warm and provides a testable HTTP contract. Binding to loopback only.
2. **esbuild for both bundles.** One fast tool builds the Node-side extension
   (`dist/extension.js`, bundle of `src/extension.ts` with `vscode` external)
   and the webview bundle (`media/webview/main.js`, IIFE, React included).
   Trade-off: no HMR; rebuild + reload instead.
3. **Strict webview isolation.** Webview HTML shipped with
   `default-src 'none'` CSP and a per-render nonce; the React app only
   communicates via `postMessage`. Privileged actions live in the host.
4. **Single message contract file.** `types/messages.ts` unions are shared by
   provider and webview, with an exhaustiveness `never` check in the host
   switch — adding a message type without a handler fails typecheck.
5. **Backend URL is a VS Code setting**, re-read per request, so users can
   point at a different port without reloading the extension. No secrets in
   frontend code; credentials belong to backend env vars (from M3).
