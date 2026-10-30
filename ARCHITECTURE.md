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
