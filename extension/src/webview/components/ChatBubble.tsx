import type { ReactNode } from "react";

import type { ChatMessage } from "../types/chat";
import type { FileDiff } from "../../types/messages";
import { DiffBlock } from "./DiffBlock";
import { TestValidationCard } from "./TestValidationCard";

/**
 * Renders a single chat message as a left- or right-aligned bubble. Handles
 * all message states (sending, thinking, done, error) and embeds diffs,
 * test results, and clarification forms inline. Pure rendering; all mutable
 * state and side-effects are owned by App and passed via props/callbacks.
 */

interface ChatBubbleProps {
  message: ChatMessage;
  // Diff interaction
  appliedDiffs: Set<string>;
  dismissedDiffs: Set<string>;
  applyingDiff: string | null;
  revertingDiff: string | null;
  applyError: { diff: string; message: string } | null;
  online: boolean;
  // Diff callbacks
  onApplyDiff: (unifiedDiff: string) => void;
  onRevertDiff: (unifiedDiff: string) => void;
  onViewDiff: (filePath: string, unifiedDiff: string, isNewFile: boolean) => void;
  onDismissDiff: (unifiedDiff: string) => void;
  onApplyAll: (diffs: FileDiff[]) => void;
  // Test callbacks
  onRunTests: () => void;
  onAutoRepair: () => void;
  runningTests: boolean;
  generating: boolean;
  testFrameworkName: string;
  // Clarification callbacks
  clarificationAnswers?: Record<string, string>;
  onAnswerChange?: (question: string, value: string) => void;
  onSubmitAnswers?: (answers: Record<string, string>) => void;
}

/** Stage labels for human-readable display. */
const STAGE_LABELS: Record<string, string> = {
  listening: "Listening",
  transcribing: "Transcribing",
  extracting_requirements: "Extracting requirements",
  answering_clarifications: "Answering clarifications",
  reading_context: "Reading context",
  generating: "Generating code",
  validating: "Validating",
  applying: "Applying changes",
  repairing: "Repairing",
  done: "Done",
};

function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(0);
  return `${mins}m ${secs}s`;
}

export function ChatBubble({
  message,
  appliedDiffs,
  dismissedDiffs,
  applyingDiff,
  revertingDiff,
  applyError,
  online,
  onApplyDiff,
  onRevertDiff,
  onViewDiff,
  onDismissDiff,
  onApplyAll,
  onRunTests,
  onAutoRepair,
  runningTests,
  generating,
  testFrameworkName,
  clarificationAnswers,
  onAnswerChange,
  onSubmitAnswers,
}: ChatBubbleProps): ReactNode {
  const isUser = message.role === "user";

  // ── User bubble ──────────────────────────────────────────────────────
  if (isUser) {
    return (
      <div className="chat-bubble chat-bubble--user">
        <div className="chat-bubble__content">
          {message.source === "voice" && (
            <span className="chat-bubble__voice-icon" title="Voice input">🎙️</span>
          )}
          <span className="chat-bubble__text">{message.content}</span>
        </div>
        <span className="chat-bubble__time">{formatTime(message.timestamp)}</span>
      </div>
    );
  }

  // ── Assistant bubble ─────────────────────────────────────────────────
  const pendingDiffs = (message.diffs ?? []).filter(
    (d) => !appliedDiffs.has(d.unifiedDiff) && !dismissedDiffs.has(d.unifiedDiff),
  );

  return (
    <div className="chat-bubble chat-bubble--assistant">
      {/* Thinking / progress stages */}
      {message.status === "thinking" && message.stages && (
        <div className="chat-bubble__stages">
          {message.stages.map(({ stage, done }) => (
            <span
              key={stage}
              className={`chat-bubble__stage${done ? " chat-bubble__stage--done" : ""}`}
            >
              {done ? "✓" : message.stages!.findIndex((s) => !s.done) === message.stages!.indexOf(
                message.stages!.find((s) => s.stage === stage)!,
              ) ? "◉" : "○"}{" "}
              {STAGE_LABELS[stage] ?? stage}
            </span>
          ))}
        </div>
      )}

      {/* Sending / thinking indicator with no stages */}
      {(message.status === "sending" || (message.status === "thinking" && !message.stages?.length)) && (
        <div className="chat-bubble__thinking">
          <span className="chat-bubble__thinking-dots" />
          Thinking…
        </div>
      )}

      {/* Error state */}
      {message.status === "error" && (
        <div className="chat-bubble__error">
          <strong>Error:</strong> {message.error ?? "Something went wrong."}
        </div>
      )}

      {/* Main content text */}
      {message.content && message.status !== "error" && (
        <div className="chat-bubble__content">
          <span className="chat-bubble__text">{message.content}</span>
        </div>
      )}

      {/* Summary */}
      {message.summary && (
        <p className="chat-bubble__summary">{message.summary}</p>
      )}

      {/* Clarifications */}
      {message.clarifications && message.clarifications.length > 0 && onAnswerChange && onSubmitAnswers && (
        <div className="chat-bubble__clarifications">
          <div className="chat-bubble__clarifications-title">
            Clarification questions:
          </div>
          {message.clarifications.map((c) => (
            <div key={c.question} className="chat-bubble__clarification-item">
              <label className="chat-bubble__clarification-label">
                {c.question}
                {c.reason && (
                  <span className="chat-bubble__clarification-reason">
                    {c.reason}
                  </span>
                )}
              </label>
              <input
                className="chat-bubble__clarification-input"
                type="text"
                value={clarificationAnswers?.[c.question] ?? c.answer ?? ""}
                placeholder="Your answer…"
                onChange={(e) => onAnswerChange(c.question, e.target.value)}
              />
            </div>
          ))}
          <button
            className="button"
            onClick={() => onSubmitAnswers(clarificationAnswers ?? {})}
          >
            Submit Answers
          </button>
        </div>
      )}

      {/* Diffs */}
      {message.diffs && message.diffs.length > 0 && (
        <div className="chat-bubble__diffs">
          {pendingDiffs.length > 1 && (
            <button
              className="button chat-bubble__apply-all-btn"
              onClick={() => onApplyAll(pendingDiffs)}
              disabled={!online}
            >
              ✓ Accept All ({pendingDiffs.length})
            </button>
          )}
          {message.diffs.map((diff) => {
            if (dismissedDiffs.has(diff.unifiedDiff)) return null;
            const isApplied = appliedDiffs.has(diff.unifiedDiff);
            const isApplying = applyingDiff === diff.unifiedDiff;
            const isReverting = revertingDiff === diff.unifiedDiff;
            const errorMsg =
              applyError?.diff === diff.unifiedDiff ? applyError.message : null;

            return (
              <DiffBlock
                key={diff.path + diff.unifiedDiff.slice(0, 40)}
                diff={diff}
                isApplied={isApplied}
                isApplying={isApplying}
                isReverting={isReverting}
                errorMessage={errorMsg}
                online={online}
                onView={() => onViewDiff(diff.path, diff.unifiedDiff, diff.isNewFile)}
                onApply={() => onApplyDiff(diff.unifiedDiff)}
                onReject={() => onDismissDiff(diff.unifiedDiff)}
                onRevert={() => onRevertDiff(diff.unifiedDiff)}
              />
            );
          })}
        </div>
      )}

      {/* Validation errors */}
      {message.validationErrors && message.validationErrors.length > 0 && (
        <div className="chat-bubble__validation-errors">
          <strong>Validation issues:</strong>
          <ul>
            {message.validationErrors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Test results */}
      {message.testRunResult && (
        <TestValidationCard
          online={online}
          runningTests={runningTests}
          generating={generating}
          testFrameworkName={testFrameworkName}
          testRunResult={message.testRunResult}
          onRunTests={onRunTests}
          onAutoRepair={onAutoRepair}
        />
      )}

      {/* Footer: model, timing */}
      {message.status === "done" && (message.model || message.processingSeconds != null) && (
        <div className="chat-bubble__meta">
          {message.model && <span className="chat-bubble__model">{message.model}</span>}
          {message.processingSeconds != null && (
            <span className="chat-bubble__duration">
              {formatDuration(message.processingSeconds)}
            </span>
          )}
        </div>
      )}

      <span className="chat-bubble__time">{formatTime(message.timestamp)}</span>
    </div>
  );
}
