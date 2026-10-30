import { useCallback, useEffect, useState } from "react";

import type { HostToWebview, VsCodeApi } from "../types/messages";

declare const acquireVsCodeApi: () => VsCodeApi;

const vscode = acquireVsCodeApi();

type BackendStatus = "connecting" | "online" | "offline";

interface HistoryEntry {
  id: number;
  text: string;
  timestamp: string;
}

export function App() {
  const [status, setStatus] = useState<BackendStatus>("connecting");
  const [statusDetail, setStatusDetail] = useState("Contacting backend…");
  const [draft, setDraft] = useState("Hello Speak2Build");
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  // Listen for everything the extension host sends back.
  useEffect(() => {
    const handler = (event: MessageEvent<HostToWebview>) => {
      const message = event.data;
      switch (message.type) {
        case "health": {
          if (message.ok) {
            setStatus("online");
            setStatusDetail(`Backend online (v${message.version ?? "?"})`);
          } else {
            setStatus("offline");
            setStatusDetail(message.error ?? "Backend is not reachable.");
          }
          break;
        }
        case "pingResult": {
          pushHistory(`Round-trip OK — backend echoed: "${message.reply}"`);
          break;
        }
        case "hostError": {
          pushHistory(`Error: ${message.message}`);
          break;
        }
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const pushHistory = (text: string) => {
    setHistory((items) => [
      { id: Date.now() + Math.random(), text, timestamp: new Date().toLocaleTimeString() },
      ...items.slice(0, 19),
    ]);
  };

  // Ask the host to check backend health once on mount.
  useEffect(() => {
    vscode.postMessage({ type: "checkHealth" });
  }, []);

  const sendPing = useCallback(() => {
    vscode.postMessage({ type: "ping", message: draft });
  }, [draft]);

  return (
    <main className="panel">
      <h1 className="title">Speak2Build</h1>
      <p className="subtitle">Speak → Transcribe → Understand → Build</p>

      <section className={`status status--${status}`}>
        <span className="status-dot" aria-hidden="true" />
        <div className="status-text">
          <strong>{status === "online" ? "Backend connected" : status === "offline" ? "Backend offline" : "Checking backend…"}</strong>
          <span>{statusDetail}</span>
        </div>
      </section>

      <section className="card">
        <label className="label" htmlFor="ping-input">
          Test message (Milestone 0 connection check)
        </label>
        <input
          id="ping-input"
          className="input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Type a short message…"
        />
        <button
          className="button"
          onClick={sendPing}
          disabled={status !== "online" || draft.trim().length === 0}
        >
          Send to backend
        </button>
      </section>

      <section className="history">
        <div className="label">Connection log</div>
        {history.length === 0 ? (
          <p className="empty">No messages yet. Send a test message once the backend is connected.</p>
        ) : (
          <ul>
            {history.map((entry) => (
              <li key={entry.id}>
                <span className="entry-time">{entry.timestamp}</span> {entry.text}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
