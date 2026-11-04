import { useState, useEffect, type ReactNode } from "react";

import type { ChatMessage } from "../types/chat";
import type { FileDiff } from "../../types/messages";
import { DiffBlock } from "./DiffBlock";
import { TestValidationCard } from "./TestValidationCard";

interface ChatBubbleProps {
  message: ChatMessage;
  appliedDiffs: Set<string>;
  dismissedDiffs: Set<string>;
  applyingDiff: string | null;
  revertingDiff: string | null;
  applyError: { diff: string; message: string } | null;
  online: boolean;
  onApplyDiff: (unifiedDiff: string) => void;
  onRevertDiff: (unifiedDiff: string) => void;
  onViewDiff: (filePath: string, unifiedDiff: string, isNewFile: boolean) => void;
  onDismissDiff: (unifiedDiff: string) => void;
  onApplyAll: (diffs: FileDiff[]) => void;
  onRunTests: () => void;
  onAutoRepair: () => void;
  runningTests: boolean;
  generating: boolean;
  testFrameworkName: string;
}

const STAGE_CONFIG: Record<
  string,
  { label: string; icon: string; activeDesc: string }
> = {
  reading_context: {
    label: "Reading Context",
    icon: "🔍",
    activeDesc: "Scanning workspace for relevant context files…",
  },
  extracting_requirements: {
    label: "Requirements",
    icon: "🧠",
    activeDesc: "Analyzing requirements & constraints…",
  },
  answering_clarifications: {
    label: "Clarifications",
    icon: "💬",
    activeDesc: "Waiting for clarification answers…",
  },
  generating: {
    label: "Generating Code",
    icon: "⚡",
    activeDesc: "Generating code diffs with AI model…",
  },
  mapping_answers: {
    label: "Matching your answers",
    icon: "🔗",
    activeDesc: "Mapping your spoken reply onto the questions…",
  },
  validating: {
    label: "Validating",
    icon: "🧪",
    activeDesc: "Validating syntax & safety checks…",
  },
  repairing: {
    label: "Repairing",
    icon: "🔧",
    activeDesc: "Auto-repairing failing tests…",
  },
  done: {
    label: "Done",
    icon: "✓",
    activeDesc: "Complete",
  },
};

function ElapsedTimer({ startTs }: { startTs: number }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const update = () => {
      setElapsed((Date.now() - startTs) / 1000);
    };
    update();
    const timer = setInterval(update, 200);
    return () => clearInterval(timer);
  }, [startTs]);

  return <span className="chat-bubble__timer">⏱ {elapsed.toFixed(1)}s</span>;
}

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
}: ChatBubbleProps): ReactNode {
  const isUser = message.role === "user";

  // ── User bubble ──────────────────────────────────────────────────────
  if (isUser) {
    return (
      <div className="chat-bubble chat-bubble--user">
        <div className="chat-bubble__content">
          {message.source === "voice" && (
            <span className="chat-bubble__voice-icon" title="Voice input">
              🎙️
            </span>
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

  const activeStage = message.stages?.find((s, idx, arr) => {
    return !s.done && arr.slice(0, idx).every((prev) => prev.done);
  });

  return (
    <div className="chat-bubble chat-bubble--assistant">
      {/* Dynamic Thinking / Progress View */}
      {message.status === "thinking" && (
        <div className="chat-bubble__thinking-container">
          <div className="chat-bubble__thinking-header">
            <span className="chat-bubble__thinking-spinner" />
            <span className="chat-bubble__active-desc">
              {activeStage
                ? STAGE_CONFIG[activeStage.stage]?.activeDesc || "Working…"
                : "Thinking…"}
            </span>
            <ElapsedTimer startTs={message.timestamp} />
          </div>

          {/* Shimmer loading bar */}
          <div className="chat-bubble__shimmer" />

          {/* Pipeline stages list */}
          {message.stages && message.stages.length > 0 && (
            <div className="chat-bubble__stages">
              {message.stages.map(({ stage, done }, index) => {
                const isCurrent =
                  !done &&
                  message.stages!.slice(0, index).every((s) => s.done);
                const cfg = STAGE_CONFIG[stage] || { label: stage, icon: "•" };

                return (
                  <span
                    key={stage}
                    className={`chat-bubble__stage${
                      done
                        ? " chat-bubble__stage--done"
                        : isCurrent
                        ? " chat-bubble__stage--active"
                        : " chat-bubble__stage--pending"
                    }`}
                  >
                    <span className="chat-bubble__stage-icon">
                      {done ? "✓" : isCurrent ? "◉" : "○"}
                    </span>
                    <span className="chat-bubble__stage-name">{cfg.label}</span>
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Error state */}
      {message.status === "error" && (
        <div className="chat-bubble__error">
          <strong>Error:</strong> {message.error ?? "Something went wrong."}
        </div>
      )}

      {/* Main content text when done */}
      {message.content && message.status !== "error" && message.status !== "thinking" && (
        <div className="chat-bubble__content">
          <span className="chat-bubble__text">{message.content}</span>
        </div>
      )}

      {/* Summary */}
      {message.summary && (
        <p className="chat-bubble__summary">{message.summary}</p>
      )}

      {/* Diffs */}
      {message.diffs && message.diffs.length > 0 && (
        <div className="chat-bubble__diffs">
          {pendingDiffs.length > 1 && (
            <div className="chat-bubble__batch-actions">
              <button
                className="button chat-bubble__apply-all-btn"
                onClick={() => onApplyAll(pendingDiffs)}
                disabled={!online}
              >
                ✓ Accept All ({pendingDiffs.length})
              </button>
              <button
                className="button secondary chat-bubble__reject-all-btn"
                onClick={() => {
                  for (const d of pendingDiffs) {
                    onDismissDiff(d.unifiedDiff);
                  }
                }}
              >
                ✕ Reject All
              </button>
            </div>
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
      {message.status === "done" &&
        (message.model || message.processingSeconds != null) && (
          <div className="chat-bubble__meta">
            {message.model && (
              <span className="chat-bubble__model">{message.model}</span>
            )}
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
