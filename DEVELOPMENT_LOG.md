# Speak2Build — Development Log

## Milestone 1 — Voice Recording ✅ (revised architecture)

**Goal:** capture the developer's voice and deliver it to the backend as whisper-ready mono PCM WAV.

### Completed

- [x] Backend-owned microphone sessions: `POST /api/recording/start|stop`, `DELETE /api/recording`.
- [x] `services/recorder.py`: PortAudio (`sounddevice`) mono 16 kHz capture callback → memory; watchdog auto-stop at 120 s; locked state machine (idle/recording/stopping); PCM16 WAV encode via numpy + stdlib `wave`.
- [x] UI state: Record/Stop/Cancel with elapsed timer; recorder errors surfaced in the card; activity log entries; `types/messages.ts` contract extended (`startRecording`/`stopRecording`/`cancelRecording` ↔ `recordingStarted`/`recordingCancelled`/`audioUploaded`).
- [x] `backendClient.ts`: `startRecording`/`stopRecording` (15 s stop timeout while audio drains)/`cancelRecording` (handles 204 no-content).
- [x] FakeStream-injected unit tests of the state machine (busy/stop-without-start/cancel/auto-stop semantics).
- [x] Live verification on real hardware through the HTTP API.

### Files Changed

- NEW: `backend/app/services/recorder.py`, `backend/tests/test_recorder.py`, `extension/src/webview/bridge.ts`, `run-extension.cmd`
- MODIFIED: `backend/app/api/routes.py`, `backend/app/schemas/audio.py`, `backend/requirements.txt` (+`numpy`, +`sounddevice`), `extension/src/types/messages.ts`, `extension/src/services/backendClient.ts`, `extension/src/providers/sidebarPanel.ts`, `extension/src/webview/{App.tsx,styles.css,components/RecorderCard.tsx}`, docs.
- RETAINED from original M1 attempt: `backend/app/services/audio_store.py` (WAV validation + UUID storage), `backend/app/schemas/audio.py`, `backend/tests/test_audio.py`, `POST /api/audio` — all reused by the recorder.

### Architecture Revision (important lesson)

Original M1 design recorded audio **inside the webview** (`MediaRecorder` →
in-browser decode/resample → hand-built WAV → base64 → host → upload).
Diagnosis on the user's machine showed Chromium reporting
`mic permission = denied` **without ever showing a prompt**. Research
confirmed this is not a misconfiguration but a **VS Code platform
constraint**: extension webviews are sandboxed iframes whose permissions
policy blocks `getUserMedia` outright —
[#113916](https://github.com/microsoft/vscode/issues/113916) ("blocked … for
all iframe-based webviews"),
[#250568](https://github.com/microsoft/vscode/issues/250568) ("Permissions
policy violation: microphone is not allowed in this document"), consent-gated
fix pending as proposed API
[#323602](https://github.com/microsoft/vscode/issues/323602).
Recording moved to the **backend process** (PortAudio via `sounddevice`),
which requires only the standard Windows "desktop apps" microphone permission —
the same layer that already permits VS Code/Copilot. The webview is reduced to
timer/buttons/display, keeping the sandbox intact as a security feature.
Full rationale + trade-offs: `ARCHITECTURE.md`.

### Bugs & Fixes

- **Recorder state on cancel**: `cancel()` released resources but forgot to reset the state machine → `state == "recording"` after cancel. Caught by `test_cancel_discards_without_storing`; fixed in `_cleanup_locked`.
- **Missing callback method**: `start()` referenced `_on_audio` which was never written → immediate `AttributeError` in the first test run.
- **Test helper**: accessed the fake stream before the factory ran (streams are created lazily by `start()`).
- Earlier M1-attempt bugs worth remembering: TS 5.7 `BodyInit` typing vs runtime `Uint8Array` (boundary cast, then empirically validated), stale backend on port 8000 serving old code (404s on new routes).

### Verification Performed

- `pytest`: **16 passed** (API, audio upload validation, recorder state machine incl. auto-stop and cancel semantics).
- `npm run build` / `tsc --noEmit`: clean.
- Live HTTP probe (real mic, extension-identical transport):
  - start → `201 {"sample_rate":16000,"channels":1}`
  - wait 1.5 s → stop → `201 {"duration_seconds":1.482,"size_bytes":47468,...}`; WAV persisted under `TEMP/speak2build-audio/`, size arithmetic checks (44 + 1.482×32,000)
  - double start → `409`; cancel → `204`; stop-after-cancel → `409`
  - backend left running afterward (pid recorded in session notes)
- Not executed by me: interactive sidebar recording (user validation pending).

### Current Limitations

- No transcription yet; temp recordings accumulate (M2 adds the pipeline + a cleanup/TTL).
- PortAudio defaults for echo cancel/noise suppression; default input device only (no picker).
- Single global session (one mic, one recording at a time) — intentional MVP simplification.

### Next Steps (Milestone 2 — Speech Recognition)

1. Add `faster-whisper` (+ deps) — CTranslate2 cp314 wheel availability already verified.
2. `POST /api/transcribe`: load by validated `audio_id`, run the small model, return language, text, segments.
3. Warm-load the model at startup; model name configurable by env var; keep the transcription service swappable.
4. Sidebar: editable transcript fed by real segments; transcription failure states.

---

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
- User (me via F5) confirmed visually: connected chip + echo round-trip worked.

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
