import { useCallback, useEffect, useState } from "react";

import { RecorderCard } from "./components/RecorderCard";
import type { HostToWebview, VsCodeApi } from "../types/messages";

declare const acquireVsCodeApi: () => VsCodeApi;

const vscode = acquireVsCodeApi();

type BackendStatus = "connecting" | "online" | "offline";
type UploadStatus = "idle" | "uploading";

interface HistoryEntry {
  id: number;
  text: string;
  timestamp: string;
}

interface UploadInfo {
  audioId: string;
  durationSeconds: number;
  sampleRate: number;
  channels: number;
  sizeBytes: number;
}

export function App() {
  const [status, setStatus] = useState<BackendStatus>("connecting");
  const [statusDetail, setStatusDetail] = useState("Contacting backend…");
  const [draft, setDraft] = useState("Hello Speak2Build");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [lastUpload, setLastUpload] = useState<UploadInfo | null>(null);

  const pushHistory = useCallback((text: string) => {
    setHistory((items) => [
      { id: Date.now() + Math.random(), text, timestamp: new Date().toLocaleTimeString() },
      ...items.slice(0, 19),
    ]);
  }, []);

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
        case "audioUploaded": {
          setUploadStatus("idle");
          setLastUpload({
            audioId: message.audioId,
            durationSeconds: message.durationSeconds,
            sampleRate: message.sampleRate,
            channels: message.channels,
            sizeBytes: message.sizeBytes,
          });
          pushHistory(
            `Audio uploaded: ${message.durationSeconds.toFixed(1)}s @ ${message.sampleRate} Hz, ` +
              `${(message.sizeBytes / 1024).toFixed(0)} KB (id ${message.audioId.slice(0, 8)}…)`,
          );
          break;
        }
        case "hostError": {
          setUploadStatus("idle");
          pushHistory(`Error: ${message.message}`);
          break;
        }
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [pushHistory]);

  // Ask the host to check backend health once on mount.
  useEffect(() => {
    vscode.postMessage({ type: "checkHealth" });
  }, []);

  const sendPing = useCallback(() => {
    vscode.postMessage({ type: "ping", message: draft });
  }, [draft]);

  const handleAudioReady = useCallback((base64Wav: string) => {
    setUploadStatus("uploading");
    pushHistory("Recording captured — uploading to backend…");
    vscode.postMessage({ type: "uploadAudio", data: base64Wav });
  }, [pushHistory]);

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

      <RecorderCard onAudioReady={handleAudioReady} disabled={status !== "online" || uploadStatus === "uploading"} />

      {lastUpload && (
        <section className="card">
          <div className="label">Last recording received by backend</div>
          <p className="recording-meta">
            Duration {lastUpload.durationSeconds.toFixed(1)}s
            {" · "}{lastUpload.sampleRate} Hz
            {" · "}{lastUpload.channels} channel{lastUpload.channels === 1 ? "" : "s"}
            {" · "}{(lastUpload.sizeBytes / 1024).toFixed(0)} KB
          </p>
          <p className="hint">From Milestone 2, this recording will be transcribed by faster-whisper.</p>
        </section>
      )}

      <section className="card">
        <label className="label" htmlFor="ping-input">
          Connection check (Milestone 0)
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
        <div className="label">Activity log</div>
        {history.length === 0 ? (
          <p className="empty">No activity yet.</p>
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
