import type { ReactNode } from "react";

interface QuickActionsProps {
  hasPendingDiffs: boolean;
  hasFailedTests: boolean;
  runningTests: boolean;
  online: boolean;
  onApplyAll: () => void;
  onRunTests: () => void;
  onAutoRepair: () => void;
  onSuggestionClick: (prompt: string) => void;
}

export function QuickActions({
  hasPendingDiffs,
  hasFailedTests,
  runningTests,
  online,
  onApplyAll,
  onRunTests,
  onAutoRepair,
  onSuggestionClick,
}: QuickActionsProps): ReactNode {
  return (
    <div className="quick-actions-bar">
      <span className="quick-actions-label">Quick Actions:</span>
      <div className="quick-actions-list">
        {hasFailedTests && (
          <>
            <button
              className="quick-action-chip quick-action-chip--primary"
              onClick={onAutoRepair}
              disabled={!online}
              title="Trigger automatic repair using test diagnostics"
            >
              🔧 Auto-Repair Tests
            </button>
            <button
              className="quick-action-chip"
              onClick={onRunTests}
              disabled={!online || runningTests}
              title="Run workspace tests again"
            >
              {runningTests ? "Testing…" : "🧪 Re-Run Tests"}
            </button>
          </>
        )}

        {hasPendingDiffs && (
          <>
            <button
              className="quick-action-chip quick-action-chip--success"
              onClick={onApplyAll}
              disabled={!online}
              title="Apply all proposed file changes to workspace"
            >
              ✓ Accept All Diffs
            </button>
            <button
              className="quick-action-chip"
              onClick={() => onSuggestionClick("Explain the proposed changes in detail.")}
              title="Ask AI to explain these changes"
            >
              💬 Explain Changes
            </button>
          </>
        )}

        {!hasFailedTests && !hasPendingDiffs && (
          <>
            <button
              className="quick-action-chip"
              onClick={onRunTests}
              disabled={!online || runningTests}
              title="Run tests in workspace"
            >
              {runningTests ? "Running…" : "🧪 Run Tests"}
            </button>
            <button
              className="quick-action-chip"
              onClick={() => onSuggestionClick("Add comprehensive unit tests for this implementation.")}
              title="Generate unit tests"
            >
              ➕ Add Unit Tests
            </button>
            <button
              className="quick-action-chip"
              onClick={() => onSuggestionClick("Add error handling, input validation, and edge cases.")}
              title="Add validation and error handling"
            >
              🛡️ Add Validation
            </button>
            <button
              className="quick-action-chip"
              onClick={() => onSuggestionClick("Refactor this code for readability and best practices.")}
              title="Refactor implementation"
            >
              🧹 Refactor
            </button>
          </>
        )}
      </div>
    </div>
  );
}
