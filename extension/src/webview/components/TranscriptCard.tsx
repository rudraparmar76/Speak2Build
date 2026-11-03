import type { ReactNode } from "react";

import { formatTime, type TranscriptInfo } from "../constants";

/**
 * Transcript card: editable recognition text plus timed segments.
 * App owns the transcript value and the edit/change flow.
 */

interface TranscriptCardProps {
  transcript: TranscriptInfo;
  relevantSnippetCount: number;
  extracting: boolean;
  extractError: string | null;
  online: boolean;
  onTextChange: (text: string) => void;
  onExtract: () => void;
}

export function TranscriptCard({
  transcript,
  relevantSnippetCount,
  extracting,
  extractError,
  online,
  onTextChange,
  onExtract,
}: TranscriptCardProps): ReactNode {
  return (
    <section className="card">
      <div className="label">Transcript (editable)</div>
      {transcript.language && (
        <p className="hint">Detected language: {transcript.language}</p>
      )}
      <textarea
        className="textarea"
        rows={Math.min(10, Math.max(3, Math.ceil(transcript.text.length / 60) + 1))}
        value={transcript.text}
        onChange={(event) => onTextChange(event.target.value)}
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
        {relevantSnippetCount > 0
          ? ` Loaded context (${relevantSnippetCount} snippets) will guide requirement extraction.`
          : " Fix any misrecognized terms above."}
      </p>
      <button
        className="button"
        onClick={onExtract}
        disabled={!online || extracting || transcript.text.trim().length < 3}
      >
        {extracting ? "Extracting requirements…" : "⚙ Extract requirements"}
      </button>
      {extractError && <p className="error-text">{extractError}</p>}
    </section>
  );
}
