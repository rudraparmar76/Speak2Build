# Speak2Build — Development Log

## Milestone 5 — Code Generation ✅

**Goal:** generate valid, project-aware unified diff patches from structured requirements + context snippets, with automated validation and repair loop.

### Completed

- [x] `services/code_generation.py`: prompt contract → LLM → unified diff JSON → parse → validation (Python AST syntax check, import resolution, TypeScript `tsc --noEmit`, dry-run `git apply --check`) → **repair loop** (bounded 2 attempts, validation errors fed back to LLM) → `apply_diff` via `git apply`.
- [x] `schemas/generation.py`: `GenerateRequest/Response` (requirement + context → diffs + summary), `FileDiff` (path, language, unified_diff, is_new_file), `ApplyDiffRequest/Response`.
- [x] `POST /api/generate` — returns validated diffs with metadata (model, processing_seconds, validated flag, validation_errors).
- [x] `POST /api/diff/apply` — applies a single unified diff via `git apply`, returns success + affected files.
- [x] Sidebar flow: **⚡ Generate code** button (enabled after requirement + context) → diff preview cards (path, language, syntax-highlighted unified diff, new-file badge) → **✓ Apply this diff** per file → success/failure feedback.
- [x] Validation pipeline: Python AST syntax check → import resolution (relative + local package heuristics) → TypeScript `tsc --noEmit` (if available) → dry-run `git apply --check`. All must pass.
- [x] Repair loop: on any validation failure, the LLM receives the exact error messages and retries (max 2 attempts).
- [x] 7 new tests (59 total green): valid diffs first try, syntax error repair, two-failure terminal error, Python syntax validation, diff apply check, actual git apply, config detection.
- [x] Live verification: generated email validator + tests from requirement, both diffs passed validation on first attempt.

### Technical Decisions

1. **Unified diff output** — standard format; works with `git apply`, `patch`, VS Code diff editor; line-precise.
2. **Per-file validation before user sees** — catch syntax/import errors in the repair loop, not in the UI.
3. **Repair loop with actual error messages** — validation errors (exact line/column from AST/tsc/git) fed back to LLM; retry #1 usually succeeds.
4. **Dry-run `git apply --check`** — ensures diff applies cleanly to current workspace state.
5. **No auto-apply** — user must explicitly click "Apply" per diff; safety first.
6. **Heuristic import validation** — checks relative imports resolve to existing files, local packages have `__init__.py`. No false positives for stdlib.

### Bugs & Fixes

- **Unified diff format for `git apply`** — requires trailing newline, correct hunk headers (`@@ -0,0 +1,N @@`), and `/dev/null` for new files. Fixed test fixtures and documented the exact format in comments.
- **In-memory diff application for validation** — wrote a minimal unified diff parser (`_apply_diff_in_memory`) to compute new content for syntax checking without shelling out.
- **TypeScript validation optional** — `npx tsc` may not be in PATH; validation gracefully degrades with a warning rather than failing.

### Verification Performed

- `pytest`: **59 passed**. `npm run build` + `tsc --noEmit`: clean.
- **Live generation**: requirement "Create a function that validates email format and prevents duplicate registrations using SQLite" + 2 context snippets → 2 diffs (email_validator.py + test_email_validator.py) → both passed validation on first attempt → `git apply --check` clean.
- Backend left running (pid 10656).

### Next Steps

1. Milestone 6 — Review/Validation: diff preview, approve/reject, patch apply, validation.
2. Milestone 7 — Evaluation & Polish: 20-task suite, metrics, demo.

---

## Milestone 4 — Project Context ✅

**Goal:** give the LLM bounded, user-consented access to the workspace — language detection, file tree, and heuristic relevance scoring — without ever sending unapproved file contents.

### Completed

- [x] `services/project_context.py`: workspace scan (walks directory, skips `.git`, `node_modules`, `__pycache__`, build dirs; detects languages by extension), heuristic relevance scoring (token overlap between requirement and file paths, path-pattern bonuses for test/api/config files), bounded snippet extraction (head ~80 lines for imports/defs + tail, capped at 200 lines/file and 8 000 chars total).
- [x] `schemas/context.py`: `ScanRequest/Response` (workspace root, languages, file tree), `RelevantRequest/Response` (requirement text, user-selected file paths, workspace root, snippets with line ranges).
- [x] `POST /api/context/scan` — metadata-only scan, returns languages + file tree.
- [x] `POST /api/context/relevant` — takes requirement + file paths + workspace root, returns scored snippets.
- [x] Sidebar flow: **🔍 Scan workspace** → file tree with checkboxes → select files → **📥 Get relevant context** → snippet preview (path, language, line range, content).
- [x] Privacy by design: only user-checked files are read; snippets are bounded; full file contents never leave the machine unapproved.
- [x] 10 new tests (52 total green): scan (languages, tree structure, skip dirs, max_files limit), relevance scoring (path overlap, pattern bonuses, test file bonus), snippet extraction (small/large files, char budget, path traversal rejection).
- [x] Live verification: scanned Speak2Build repo (64 files, 48 scanned, 6 languages detected), relevance query returned 2 snippets (routes.py + test_recorder.py) at 8 030 chars, truncated to budget.

### Technical Decisions

1. **Heuristic scoring, not embeddings** — no vector DB, no external deps. Token overlap (requirement words vs path tokens) + path-pattern bonuses (test_*, api, config) + content overlap sampling. Explainable, fast, zero-dep.
2. **Two-phase: scan → select → relevant** — scan is fast (metadata only). User explicitly selects files. Relevance runs *after* selection, so the LLM never sees unapproved paths.
3. **Bounded snippets** — head region (imports, class/def signatures) + tail region (tests, main logic). Truncation marker inserted. Total budget 8k chars enforced.
4. **Workspace root from VS Code** — the host resolves `${workspaceFolder}` to the first workspace folder, so the backend never guesses.

### Bugs & Fixes

- **`Path` not imported in routes.py** — quick fix, caught by live test.
- **Workspace root calculation from relative paths** — `os.path.commonpath` on relative paths gave wrong root. Fixed by making `workspace_root` an explicit required parameter in `RelevantRequest`.
- **FileNode type mismatch** — backend returns snake_case (`is_dir`, `size_bytes`), frontend expects camelCase (`isDir`, `sizeBytes`). Added `mapFileNode` in sidebarPanel.ts to convert at the boundary.
- **`FileNode` not exported from backendClient.ts** — exported the interface for cross-module use.

### Verification Performed

- `pytest`: **52 passed**. `npm run build` + `tsc --noEmit`: clean.
- **Live scan**: Speak2Build repo → 64 total files, 48 scanned, 6 languages (python, typescript, javascript, css, json, markdown).
- **Live relevance**: requirement "Create a function that validates email format and prevents duplicate registrations using SQLite" + 5 file paths → 2 snippets (routes.py, test_recorder.py), 8 030 chars, truncated to budget.
- Backend left running (pid 10656).

### Next Steps

1. Milestone 5 — Code Generation: LLM → unified diff patches, validation, apply/revert.
2. Milestone 6 — Review/Validation: diff preview, approve/reject, patch apply, validation.
3. Milestone 7 — Evaluation & Polish: 20-task suite, metrics, demo.

---

## Milestone 3 — Requirement Intelligence ✅ (live verification complete)

**Goal:** turn the editable transcript into structured, validated requirements — with ambiguity surfaced as answerable clarification questions, not silently guessed away.

### Completed

- [x] `services/llm_client.py`: provider-agnostic OpenAI-compatible client (covers OpenAI, Ollama, LM Studio, Groq, NVIDIA NIM…). Env-only config (`SPEAK2BUILD_LLM_BASE_URL/_MODEL/_API_KEY/_TIMEOUT`); no keys hardcoded anywhere; `.env` auto-loaded via `python-dotenv`.
- [x] `services/requirements.py`: structured extraction with a **validate→feedback→retry repair loop** (Pydantic validation errors are sent back to the LLM; bounded at 2 attempts), fence/prose-tolerant JSON parsing, and deterministic answer reconciliation against clarification questions.
- [x] `POST /api/requirements` with a deliberate error taxonomy: 503 (unconfigured/unreachable), 502 (provider error), 422 (unrepairable output). Ambiguity arrives as `clarifications` inside a 200 — it is information, not failure.
- [x] Sidebar flow: **⚙ Extract requirements** on the transcript card → requirements card (task, inputs/outputs/constraints/acceptance criteria, meta: model · repaired · seconds) → per-question answer inputs → **⚙ Re-extract with answers**.
- [x] Transcript never leaves the machine unbounded: capped at 8 000 chars per call; project files are not sent (M4 boundary, documented).
- [x] 21 new tests (42 total green): LLM client via `httpx.MockTransport` (auth header, error shapes, empty/broken bodies), service-level repair loop with scripted FakeLLM (first-pass parse, repair retries carrying the real validation error, terminal failure, answer merge, prompt building), route mapping (503/502/422 + happy path + passthrough of answers).
- [x] **Live end-to-end verification with NVIDIA Nemotron-3-Ultra**: TTS → upload → transcribe → extract → answer one clarification → re-extract with answer merged. All stages green.

### Bugs & Fixes

- **`httpx.post(..., transport=...)`** — the top-level API doesn't accept `transport`; only `httpx.Client` does. Switched to a per-call `httpx.Client(transport=seam)`.
- **Lazy generator `.throw` in test lambdas** — `lambda: (gen).throw(...)` *returns a generator that would throw when iterated*; the mock never raised. Replaced with an explicit `_raise()` helper. Lesson: a lambda that "raises lazily" isn't a raising callable.
- **FastAPI `null` vs TS `undefined`** — Pydantic `str | None` serialized as `null` broke `ClarificationInfo` (`string | undefined`). Normalized at the bridge (`?? undefined` at the host boundary, the single conversion point).
- **Missing re-export** — `requirements` module exported `LLMUnavailableError` but not `LLMRequestError`; tests caught the gap. Keep module `__all__` surfaces complete when tests patch through them.
- **`.env` not auto-loaded** — `os.environ.get()` doesn't read `.env` files. Added `python-dotenv` + `load_dotenv()` at `llm_client.py` import time (backend-root `.env`), optional so system env vars still win.

### Verification Performed

- `pytest`: 42 passed. `npm run build` + `tsc --noEmit`: clean.
- **Full live loop**: SAPI TTS spoke *"Create a function that validates the user email and prevents duplicate registrations"* → uploaded → Whisper transcribed word-perfect → Nemotron-3-Ultra extracted structured requirement with 5 clarifications → answered first clarification ("Use SQLite with UNIQUE email column") → re-extracted → **answer folded into requirement (task + constraints now reference SQLite), 5 follow-up clarifications generated**. Backend left running with the updated code.

### Next Steps

1. Milestone 4 — Project Context: workspace scanning (language/files), requirement-to-file hints, bounded dialog to send only relevant snippets (explicitly no auto-modification).
2. Milestone 5 — Code Generation: LLM → unified diff patches, validation, apply/revert.

---

## Milestone 2 — Speech Recognition ✅

**Goal:** turn stored recordings into accurate, editable transcripts — locally with faster-whisper.

### Completed

- [x] `services/transcription.py`: faster-whisper service with env-configurable model (`SPEAK2BUILD_WHISPER_MODEL`/`_DEVICE`/`_COMPUTE_TYPE`; defaults `small`/`cpu`/`int8`).
- [x] Background warm-up on first `/api/health` probe (idempotent, one-time model download to the HF cache); state machine `idle → loading → ready | error` reported through health responses and the sidebar chip (`STT: …`).
- [x] `POST /api/transcribe` by `audio_id` reference; regex-validated id, 404 for expired recordings, 503 while model loads/errors.
- [x] Timestamped `segments` + combined `text` returned; Pydantic schema `TranscriptionResponse`.
- [x] Sidebar: **Transcribe** button on the last recording, editable transcript textarea (user corrections are the M3 input), language display, segment timestamps, processing-time readout.
- [x] Tests: conftest autouse disables model warm-up in test runs; fake-service tests cover routing/validation/state (21 total green).
- [x] Real end-to-end verification with actual speech (see below).

### Files Changed

- NEW: `backend/app/services/transcription.py`, `backend/app/schemas/transcription.py`, `backend/tests/conftest.py`, `backend/tests/test_transcription.py`
- MODIFIED: `backend/app/api/routes.py`, `backend/app/schemas/common.py` (health + transcription state), `backend/requirements.txt` (+`faster-whisper`, +`av<18`), extension messages/client/panel/App/styles, docs.

### Technical Decisions

1. **Warm-load on first health probe** rather than lazy-load on transcribe: the sidebar checks health on open, so the model starts loading immediately and users see progress (`STT: loading → ready`); avoided "first request takes minutes".
2. **Transcribe by reference (`audio_id`), not bytes** — file already stored; same regex/id machinery blocks traversal.
3. **Whisper returned shapes kept close to upstream** (segments with start/end) — M3/M7 need segment-level traceability (requirement ↔ words spoken).
4. **VAD filter off for MVP** — silero-VAD adds an Ort/PyAV-version surface beyond our needs; MVP dictations are single utterances.
5. **3-minute client timeout** on transcribe: first call may contend with model load/download.

### Bugs & Fixes

- **PyAv API break** (the big one): faster-whisper 1.2.1 calls `av.open(..., metadata_errors="ignore")`; av 18/19 removed it → 500 with `TypeError` on every transcription. Diagnosed via the uvicorn traceback, mapped the compatibility windows, empirically found `av 17.1.0` correct (introspection impossible — C extension exposes no signature; behavior test was the honest probe). Pinned `av<18` with the reason documented in `requirements.txt`.
- **Module/function mismatch**: routes called `transcription_service.transcribe/state` as *module functions*, but I'd only defined class methods. Added delegating module functions (`request_warmup`, `state`, `transcribe`) — this keeps a single patch point for tests and avoids leaking the singleton into routes.
- **PowerShell UTF-16 script write** garbled a probe helper; rewrote as ASCII/UTF-8 file. (Probe-side only; no product impact.)

### Verification Performed

- `pytest`: **21 passed** (5 transcription tests: happy path, multi-segment join, 404, 422 pattern-validation, 503-not-ready).
- `npm run build` / `tsc --noEmit`: clean.
- **Real speech end-to-end**: Windows SAPI TTS rendered "Create a function that validates the user email and prevents duplicate registrations." into a 16 kHz WAV; uploaded (`201`, 5.47 s audio); model state polled `loading → ready`; transcribe → `200` in **4.1 s** with **word-perfect text**, `language: "en"`, one segment. Backend left running with the updated code.
- Not executed by me: your mic-spoken transcription (your validation step).

### Current Limitations

- Synchronous CPU transcription; a job/queue API deferred until M7 measurements justify it.
- No whisper/VAD tuning; no domain vocabulary hints yet (possible M7 improvement: `initial_prompt` with code identifiers).
- Temp recordings are never cleaned up (TTL sweep pending).

### Next Steps (Milestone 3 — Requirement Intelligence)

1. LLM provider abstraction behind env config (no hardcoded keys; provider-agnostic call shim).
2. Structured requirement schema (Pydantic): task, language, inputs, outputs, constraints, acceptance criteria.
3. LLM → structured extraction from the (edited) transcript; validation + repair loop for malformed model output.
4. Ambiguity detection + clarification questions; sidebar Q&A round-trip.

---

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
