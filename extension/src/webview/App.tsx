import { useCallback, useEffect, useState } from "react";

import { RecorderCard, type RecorderState } from "./components/RecorderCard";
import { getVsCodeApi } from "./bridge";
import type {
  ClarificationInfo,
  HostToWebview,
  RequirementResult,
} from "../types/messages";

const vscode = getVsCodeApi();

const MAX_RECORDING_MS = 120_000;

type BackendStatus = "connecting" | "online" | "offline";

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

interface TranscriptInfo {
  audioId: string;
  language?: string;
  text: string;
  segments: Array<{ start: number; end: number; text: string }>;
  durationSeconds: number;
  processingSeconds: number;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function App() {
  const [status, setStatus] = useState<BackendStatus>("connecting");
  const [statusDetail, setStatusDetail] = useState("Contacting backend…");
  const [draft, setDraft] = useState("Hello Speak2Build");
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const [recorderState, setRecorderState] = useState<RecorderState>("idle");
  const [recorderError, setRecorderError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [lastUpload, setLastUpload] = useState<UploadInfo | null>(null);
  const [transcript, setTranscript] = useState<TranscriptInfo | null>(null);
  const [transcribingId, setTranscribingId] = useState<string | null>(null);

  const [requirement, setRequirement] = useState<RequirementResult | null>(null);
  const [requirementMeta, setRequirementMeta] = useState<{
    model: string;
    processingSeconds: number;
    repaired: boolean;
  } | null>(null);
  const [extractAnswers, setExtractAnswers] = useState<Record<string, string>>({});
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);

  const pushHistory = useCallback((text: string) => {
    setHistory((items) => [
      { id: Date.now() + Math.random(), text, timestamp: new Date().toLocaleTimeString() },
      ...items.slice(0, 19),
    ]);
  }, []);

  const stopRecording = useCallback(() => {
    setRecorderState("stopping");
    vscode.postMessage({ type: "stopRecording" });
  }, []);

  // Listen for everything the extension host sends back.
  useEffect(() => {
    const handler = (event: MessageEvent<HostToWebview>) => {
      const message = event.data;
      switch (message.type) {
        case "health": {
          if (message.ok) {
            setStatus("online");
            setStatusDetail(
              `Backend online (v${message.version ?? "?"})` +
                (message.transcription ? ` · STT: ${message.transcription}` : ""),
            );
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
        case "recordingStarted": {
          setRecorderState("recording");
          setElapsedMs(0);
          setRecorderError(null);
          pushHistory(
            `Recording… (${message.sampleRate} Hz, ${message.channels} ch, backend-owned mic)`,
          );
          break;
        }
        case "audioUploaded": {
          setRecorderState("idle");
          setLastUpload({
            audioId: message.audioId,
            durationSeconds: message.durationSeconds,
            sampleRate: message.sampleRate,
            channels: message.channels,
            sizeBytes: message.sizeBytes,
          });
          // A fresh recording invalidates any previous transcript.
          setTranscript((current) =>
            current && current.audioId === message.audioId ? current : null,
          );
          pushHistory(
            `Recording stored: ${message.durationSeconds.toFixed(1)}s @ ${message.sampleRate} Hz, ` +
              `${(message.sizeBytes / 1024).toFixed(0)} KB (id ${message.audioId.slice(0, 8)}…)`,
          );
          break;
        }
        case "transcription": {
          setTranscribingId(null);
          setTranscript({
            audioId: message.audioId,
            language: message.language,
            text: message.text,
            segments: message.segments,
            durationSeconds: message.durationSeconds,
            processingSeconds: message.processingSeconds,
          });
          const preview = message.text.length > 80 ? `${message.text.slice(0, 80)}…` : message.text;
          pushHistory(
            `Transcribed in ${message.processingSeconds.toFixed(1)}s` +
              (message.language ? ` [${message.language}]` : "") + `: "${preview}"`,
          );
          break;
        }
        case "recordingCancelled": {
          setRecorderState("idle");
          pushHistory("Recording cancelled — nothing stored.");
          break;
        }
        case "requirements": {
          setExtracting(false);
          setExtractError(null);
          setRequirement(message.requirement);
          setRequirementMeta({
            model: message.model,
            processingSeconds: message.processingSeconds,
            repaired: message.repaired,
          });
          const asked = message.requirement.clarifications.filter(
            (item) => !item.answer,
          ).length;
          pushHistory(
            `Requirements extracted (${message.model}` +
              (message.repaired ? ", repaired" : "") + `) in ` +
              `${message.processingSeconds.toFixed(1)}s · ` +
              (asked > 0 ? `${asked} clarification question(s)` : "no open questions"),
          );
          break;
        }
        case "hostError": {
          // If a recorder or transcription operation was in flight, return
          // the affected flow to idle and show the reason where it happened.
          setRecorderState((current) => (current !== "idle" ? "idle" : current));
          setTranscribingId(null);
          setExtracting(false);
          setExtractError(message.message);
          setRecorderError((prevRecorderError) => message.message);
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

  // Elapsed-time display while the backend owns the mic.
  useEffect(() => {
    if (recorderState !== "recording") {
      return;
    }
    const timer = window.setInterval(() => {
      setElapsedMs((ms) => ms + 100);
    }, 100);
    return () => window.clearInterval(timer);
  }, [recorderState]);

  // Backend enforces the same cap; the UI also stops at 120 s.
  useEffect(() => {
    if (recorderState === "recording" && elapsedMs >= MAX_RECORDING_MS) {
      stopRecording();
    }
  }, [recorderState, elapsedMs, stopRecording]);

  const startRecording = useCallback(() => {
    setRecorderError(null);
    setRecorderState("starting");
    vscode.postMessage({ type: "startRecording" });
  }, []);

  const cancelRecording = useCallback(() => {
    setRecorderState("stopping");
    vscode.postMessage({ type: "cancelRecording" });
  }, []);

  const startTranscription = useCallback((audioId: string) => {
    setTranscribingId(audioId);
    vscode.postMessage({ type: "transcribe", audioId });
  }, []);

  const extractRequirements = useCallback(
    (answers?: Record<string, string>) => {
      if (transcript === null || transcript.text.trim().length < 3) {
        return;
      }
      setExtracting(true);
      setExtractError(null);
      vscode.postMessage({
        type: "extractRequirements",
        transcript: transcript.text,
        ...(answers && Object.keys(answers).length > 0 ? { answers } : {}),
      });
    },
    [transcript],
  );

  const updateAnswer = useCallback((question: string, value: string) => {
    setExtractAnswers((current) => ({ ...current, [question]: value }));
  }, []);

  const sendPing = useCallback(() => {
    pushHistory(`Sending: "${draft}"`);
    vscode.postMessage({ type: "ping", message: draft });
  }, [draft, pushHistory]);

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

      <RecorderCard
        state={recorderState}
        elapsedMs={elapsedMs}
        error={recorderError}
        disabled={status !== "online"}
        onToggle={recorderState === "recording" ? stopRecording : startRecording}
        onCancel={cancelRecording}
      />

      {lastUpload && (
        <section className="card">
          <div className="label">Last recording received by backend</div>
          <p className="recording-meta">
            Duration {lastUpload.durationSeconds.toFixed(1)}s
            {" · "}{lastUpload.sampleRate} Hz
            {" · "}{lastUpload.channels} channel{lastUpload.channels === 1 ? "" : "s"}
            {" · "}{(lastUpload.sizeBytes / 1024).toFixed(0)} KB
          </p>
          <button
            className="button"
            onClick={() => startTranscription(lastUpload.audioId)}
            disabled={status !== "online" || transcribingId !== null}
          >
            {transcribingId === lastUpload.audioId
              ? "Transcribing… (first call may warm the model)"
              : "▶ Transcribe"}
          </button>
        </section>
      )}

      {transcript && (
        <section className="card">
          <div className="label">Transcript (editable)</div>
          {transcript.language && (
            <p className="hint">Detected language: {transcript.language}</p>
          )}
          <textarea
            className="textarea"
            rows={Math.min(10, Math.max(3, Math.ceil(transcript.text.length / 60) + 1))}
            value={transcript.text}
            onChange={(event) =>
              setTranscript((current) =>
                current === null ? current : { ...current, text: event.target.value },
              )
            }
            placeholder="Transcription will appear here…"
          />
          {transcript.segments.length > 1 && (
            <ul className="segments">
              {transcript.segments.map((segment, index) => (
                <li key={index}>
                  <span className="entry-time">
                    {formatTime(segment.start)}–{formatTime(segment.end)}
                  </span>{" "}
                  {segment.text}
                </li>
              ))}
            </ul>
          )}
          <p className="hint">
            {transcript.durationSeconds.toFixed(1)}s of audio processed in {transcript.processingSeconds.toFixed(1)}s.
            Fix any misrecognized terms above — your edits feed the next milestone.
          </p>
          <button
            className="button"
            onClick={() => extractRequirements()}
            disabled={status !== "online" || extracting || transcript.text.trim().length < 3}
          >
            {extracting ? "Extracting requirements…" : "⚙ Extract requirements"}
          </button>
          {extractError && <p className="error-text">{extractError}</p>}
        </section>
      )}

      {requirement && (
        <section className="card">
          <div className="label">Requirements</div>
          {requirementMeta && (
            <p className="hint">
              {requirementMeta.model}
              {requirementMeta.repaired ? " · schema-repaired" : ""} ·{" "}
              {requirementMeta.processingSeconds.toFixed(1)}s
            </p>
          )}
          <p className="requirement-task">{requirement.task}</p>

          {(
            [
              ["Inputs", requirement.inputs],
              ["Outputs", requirement.outputs],
              ["Constraints", requirement.constraints],
              ["Acceptance criteria", requirement.acceptanceCriteria],
            ] as Array<[string, string[]]>
          ).map(
            ([title, items]) =>
              items.length > 0 && (
                <div key={title}>
                  <div className="sub-label">{title}</div>
                  <ul className="bullets">
                    {items.map((item, index) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>
                </div>
              ),
          )}

          {requirement.clarifications.length > 0 && (
            <div>
              <div className="sub-label">
                Clarifications ({requirement.clarifications.length})
              </div>
              {requirement.clarifications.map((item: ClarificationInfo, index) => (
                <div key={index} className="clarification">
                  <p className="clarification-question">
                    {item.question}
                    {item.reason && <span className="hint"> — {item.reason}</span>}
                  </p>
                  <input
                    className="input"
                    value={
                      extractAnswers[item.question] ?? item.answer ?? ""
                    }
                    onChange={(event) => updateAnswer(item.question, event.target.value)}
                    placeholder="Your answer…"
                  />
                </div>
              ))}
              <button
                className="button"
                onClick={() => extractRequirements(extractAnswers)}
                disabled={
                  status !== "online" ||
                  extracting ||
                  Object.values(extractAnswers).every((a) => a.trim().length === 0)
                }
              >
                {extracting ? "Extracting…" : "⚙ Re-extract with answers"}
              </button>
            </div>
          )}
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
