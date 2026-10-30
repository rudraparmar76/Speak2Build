# Speak2Build — Development Log

## Milestone 1 — Voice Recording ✅

**Goal:** capture the developer's voice in the sidebar and deliver it to the backend as whisper-ready 16 kHz mono WAV.

### Completed

- [x] Mic capture via `getUserMedia` + `MediaRecorder` (webm/opus) with permission/error mapping.
- [x] In-webview conversion: `decodeAudioData` → `OfflineAudioContext` (mono, 16 kHz) → hand-built PCM16 WAV encoder.
- [x] Upload bridge: base64 over `postMessage`, binary `POST /api/audio` from the host.
- [x] Backend `POST /api/audio`: size limit (20 MB → 413), WAV magic-byte + fmt validation (→ 415), UTF-8-ish UUID temp storage, metadata response.
- [x] Backend `services/audio_store.py`: chunk-walking RIFF parser, id-format revalidation.
- [x] UI: Record/Stop with timer + pulse, auto-stop at 2 min, captured-recording metadata card, activity log entries.

### Files Changed

- NEW: `backend/app/services/audio_store.py`, `backend/app/schemas/audio.py`, `backend/tests/test_audio.py`, `extension/src/webview/components/RecorderCard.tsx`
- MODIFIED: `backend/app/api/routes.py`, `extension/src/types/messages.ts`, `extension/src/services/backendClient.ts`, `extension/src/providers/sidebarPanel.ts`, `extension/src/webview/{App.tsx,styles.css}`, docs.

### Technical Decisions

1. **Browser-side transcode to WAV** (see ARCHITECTURE.md) — removes any FFmpeg/`pyav` system dependency; uploaded file is ready for M2 transcription. Cost: ~8× larger uploads vs opus, bounded by caps.
2. **Base64 across the postMessage bridge, raw bytes over HTTP** — `postMessage` carries data safely as a string; the host decodes once and sends binary, so base64 overhead (33%) applies to one leg only.
3. **Validate bytes, not headers** — spoofed `Content-Type` is trivial; the RIFF parser is the real gate. Tested with junk bytes → 415.
4. **UUID filenames** — client never names files; `path_for()` re-regex-checks ids, so path traversal is structurally impossible.
5. **Two-minute recording cap** — bounds memory (WAV encode lives in RAM) and upload size; auto-stop implemented in the recorder's timer effect.

### Bugs & Fixes

- **TS 5.7 `BodyInit` typing rejects `Uint8Array`** despite Node/undici accepting any `ArrayBufferView` at runtime. Tried `Blob` wrapping (also failed the stricter `BlobPart` typing). Fixed with a documented boundary cast (`as unknown as BodyInit`) — then validated the cast empirically with a live Node probe against a real uvicorn (not just types).
- **Stale backend on port 8000** caused 404s on `/api/audio`: a leftover dev server (from M0 testing) was still listening and serving old code. Diagnosed via `Errno 10048` bind failure; killed the stale pid, retested clean. Lesson: 404-from-live-server usually means "running stale code", check port ownership first.

### Verification Performed

- `pytest`: **9 passed** (5 new: metadata+storage round-trip, non-WAV → 415, empty → 400, oversized → 413, compressed fmt → ValueError).
- `npm run build` + `tsc --noEmit`: clean.
- Live Node probe (`Temp/s2b-upload-probe.js`) against real uvicorn, using the extension's exact transport (Node fetch, `Uint8Array` body):
  - valid WAV → `201 {audio_id:…, duration_seconds: 2, sample_rate: 16000, channels: 1, size_bytes: 64044}`
  - junk bytes → `415` with readable detail
  - stored file verified on disk under `TEMP/speak2build-audio/`.
- Not executed by me (requires desktop/mic): actual F5 recording run. Manual check for you: Record → allow mic → speak → Stop → expect "Audio uploaded: …s @ 16000 Hz" in the log + metadata card.

### Current Limitations

- No transcription yet; recordings accumulate in temp (cleanup strategy comes with M2 pipeline or a store TTL).
- Echo cancellation/noise suppression left on browser defaults (fine for single-speaker dictation).
- No cancellation of an in-flight upload; UI disables Record while uploading instead.

### Next Steps (Milestone 2 — Speech Recognition)

1. `requirements.txt`: add `faster-whisper` + `soundfile` (wheel availability verified beforehand on Python 3.14).
2. `POST /api/transcribe` — load by validated `audio_id`, run small model, return segments + text + language.
3. Model warm-loading at startup with configurable model name via env var; keep the transcription service swappable.
4. Sidebar: editable transcript box fed by real segments; transcription failure states.

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
