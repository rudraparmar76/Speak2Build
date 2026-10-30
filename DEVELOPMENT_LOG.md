# Speak2Build — Development Log

## Milestone 0 — Foundation ✅

**Goal:** prove the three-layer message chain (React webview → extension host → FastAPI backend).

### Completed

- [x] Scaffolding per `CLAUDE.md` §7: `extension/`, `backend/`, docs at repo root.
- [x] FastAPI backend: `GET /api/health`, `POST /api/ping`, Pydantic schemas with validation (1–2000 chars).
- [x] Backend pytest suite (4 tests) using `TestClient`.
- [x] VS Code extension manifest: activity-bar container, sidebar webview view, `speak2build.backendUrl` setting.
- [x] React sidebar UI: connection status chip, ping form, connection log.
- [x] esbuild dual-bundle build (`dist/extension.js`, `media/webview/main.js` + CSS) with `tsc --noEmit` typecheck.
- [x] Workspace `launch.json` for single-key F5 debug run.
- [x] Strict webview CSP with per-render nonce; loopback-only backend.

### Files Created

- `backend/` — `app/main.py`, `app/api/routes.py`, `app/schemas/common.py`, `tests/test_api.py`, `requirements.txt`, `.venv/` (local)
- `extension/` — `package.json`, `tsconfig.json`, `build.mjs`, `src/extension.ts`, `src/providers/sidebarPanel.ts`, `src/services/backendClient.ts`, `src/types/messages.ts`, `src/webview/{main.tsx,App.tsx,styles.css}`, `media/icon.svg`
- Root — `README.md`, `ARCHITECTURE.md`, `DEVELOPMENT_LOG.md`, `.gitignore`, `.vscode/{launch,tasks}.json`

### Technical Decisions

1. **esbuild over Vite/webpack** — one tool for both bundles; ~instant builds. No webview HMR (acceptable for MVP).
2. **Plain `uvicorn` (not `[standard]`)** — fewer compiled deps on the very new Python 3.14.
3. **Message contract as discriminated unions** in `types/messages.ts`, exhaustiveness-checked in the host handler.
4. **Venv for backend deps** instead of global site-packages; reproducible, avoids conflicts with user's global Python 3.14.
5. **Health check re-sent when the sidebar becomes visible** — VS Code creates the webview lazily and hides it in inactive containers.

### Verification Performed

- `pytest`: **4 passed** (health OK; echo round-trip; empty message → 422; missing field → 422).
- Live server over real HTTP (uvicorn started via `Start-Process`):
  - `GET /api/health` → `{"status":"ok","version":"0.1.0"}`
  - `POST /api/ping` → `{"echo":"hello from the extension host","received_chars":29,"timestamp":...}`
  - Invalid ping → `HTTP 422`
  - Server stopped cleanly afterwards.
- `npm run build` → both bundles emitted.
- `npm run typecheck` → clean, no errors.
- Not yet executed by me: the manual F5 run of the extension inside a real VS Code debug window (requires interactive desktop). Instructions verified at build level; full user-run check pending.

### Bugs Encountered

- None so far. (Note: pip/pytest output shown with "NativeCommandError" artifacts under old Windows PowerShell — a stderr-redirection display quirk of the shell, not a project issue.)

### Current Limitations

- No voice recording, transcription, requirements, or code generation yet — connection only.
- CORS is permissive (`*`) because the backend is loopback-only and the webview origin is opaque; revisit if the backend ever exposes more than the local interface.
- Backend must be started manually; UI shows "offline" state until it is.

### Next Steps (Milestone 1 — Voice Recording)

1. Webview: mic permission check, `MediaRecorder`-based recording with start/stop control, duration/error UI.
2. Audio formats: record as `audio/webm` locally; convert server-side later (M2 feeds faster-whisper 16 kHz mono WAV).
3. Host: send audio bytes to backend (`POST /api/audio`), show upload status/errors.
4. Backend: accept bounded-size uploads, store temporarily, report format + duration.
