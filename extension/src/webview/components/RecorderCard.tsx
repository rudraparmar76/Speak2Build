import type { ReactNode } from "react";

/**
 * Presentational recorder card. All recording state and message flow lives in
 * App: this component only renders state and forwards click intents.
 */

const MAX_RECORDING_MS = 120_000;

export type RecorderState = "idle" | "starting" | "recording" | "stopping";

interface RecorderCardProps {
  state: RecorderState;
  elapsedMs: number;
  error: string | null;
  disabled: boolean;
  onToggle: () => void;
  onCancel: () => void;
}

const LABELS: Record<RecorderState, string> = {
  idle: "● Record",
  starting: "Starting…",
  recording: "■ Stop recording",
  stopping: "Finishing…",
};

export function RecorderCard({
  state,
  elapsedMs,
  error,
  disabled,
  onToggle,
  onCancel,
}: RecorderCardProps): ReactNode {
  const busy = state === "starting" || state === "stopping";

  return (
    <section className="card">
      <div className="label">Voice capture</div>
      <div className="record-row">
        <button
          className={`button record-button ${state === "recording" ? "record-button--active" : ""}`}
          onClick={onToggle}
          disabled={disabled || busy}
        >
          {LABELS[state]}
        </button>
        {state === "recording" && (
          <>
            <span className="record-timer">● {(elapsedMs / 1000).toFixed(1)}s</span>
            <button className="link-button" onClick={onCancel}>
              cancel
            </button>
          </>
        )}
      </div>
      {error && <p className="error">{error}</p>}
      <p className="hint">
        Recording is captured by the local backend (max {MAX_RECORDING_MS / 1000} s), stored
        temporarily as 16-bit PCM WAV, and ready for transcription in Milestone 2.
      </p>
    </section>
  );
}
