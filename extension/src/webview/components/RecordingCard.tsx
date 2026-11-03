import type { ReactNode } from "react";

import type { UploadInfo } from "../constants";

/**
 * Metadata card for the most recent published recording, with the
 * "transcribe" action. Pure rendering; App owns the transcribe flow.
 */

interface RecordingCardProps {
  upload: UploadInfo;
  transcribingId: string | null;
  online: boolean;
  onTranscribe: (audioId: string) => void;
}

export function RecordingCard({
  upload,
  transcribingId,
  online,
  onTranscribe,
}: RecordingCardProps): ReactNode {
  return (
    <section className="card">
      <div className="label">Last recording received by backend</div>
      <p className="recording-meta">
        Duration {upload.durationSeconds.toFixed(1)}s
        {" · "}{upload.sampleRate} Hz
        {" · "}{upload.channels} channel{upload.channels === 1 ? "" : "s"}
        {" · "}{(upload.sizeBytes / 1024).toFixed(0)} KB
      </p>
      <button
        className="button"
        onClick={() => onTranscribe(upload.audioId)}
        disabled={!online || transcribingId !== null}
      >
        {transcribingId === upload.audioId
          ? "Transcribing… (first call may warm the model)"
          : "▶ Transcribe"}
      </button>
    </section>
  );
}
