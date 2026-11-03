import type { ReactNode } from "react";

import type { FileDiff } from "../../types/messages";

/**
 * One generated file diff with Apply / Reject / Revert / View actions.
 * Pure rendering; apply state and errors are owned by App. In Phase 1 this
 * block becomes the inline chat diff; in Phase 2.5 it gains the streaming
 * "diff grows as tokens arrive" variant.
 */

interface DiffBlockProps {
  diff: FileDiff;
  isApplied: boolean;
  isApplying: boolean;
  isReverting: boolean;
  errorMessage: string | null;
  online: boolean;
  onView: () => void;
  onApply: () => void;
  onReject: () => void;
  onRevert: () => void;
}

export function DiffBlock({
  diff,
  isApplied,
  isApplying,
  isReverting,
  errorMessage,
  online,
  onView,
  onApply,
  onReject,
  onRevert,
}: DiffBlockProps): ReactNode {
  return (
    <div className="diff-card">
      <div className="diff-header">
        <span className="diff-path">{diff.path}</span>
        <span className="hint">({diff.language})</span>
        {diff.isNewFile && <span className="badge new-file">New file</span>}
        {isApplied && <span className="badge applied">✓ Applied</span>}
      </div>
      <pre className="diff-content">{diff.unifiedDiff}</pre>
      <div className="diff-actions">
        <button
          className="button secondary"
          onClick={onView}
          title="Open side-by-side diff in VS Code editor"
        >
          🔍 View in Editor
        </button>
        {!isApplied ? (
          <>
            <button
              className="button"
              onClick={onApply}
              disabled={!online || isApplying}
            >
              {isApplying ? "Applying…" : "✓ Apply"}
            </button>
            <button
              className="button secondary"
              onClick={onReject}
              title="Reject and dismiss this diff"
            >
              ✕ Reject
            </button>
          </>
        ) : (
          <button
            className="button danger"
            onClick={onRevert}
            disabled={!online || isReverting}
          >
            {isReverting ? "Reverting…" : "⎌ Revert"}
          </button>
        )}
      </div>
      {errorMessage && <p className="error-text">{errorMessage}</p>}
    </div>
  );
}
