import type { ReactNode } from "react";

import type { TestRunResult } from "../../types/messages";

/**
 * Workspace test validation card: run tests, show the result, and trigger the
 * AI auto-repair flow when tests fail. Pure rendering; App owns the run state.
 */

interface TestValidationCardProps {
  online: boolean;
  runningTests: boolean;
  generating: boolean;
  testFrameworkName: string;
  testRunResult: TestRunResult | null;
  onRunTests: () => void;
  onAutoRepair: () => void;
}

export function TestValidationCard({
  online,
  runningTests,
  generating,
  testFrameworkName,
  testRunResult,
  onRunTests,
  onAutoRepair,
}: TestValidationCardProps): ReactNode {
  return (
    <div className="test-validation-section">
      <div className="sub-label">Workspace Test Validation</div>
      <button
        className="button secondary"
        onClick={onRunTests}
        disabled={!online || runningTests}
      >
        {runningTests ? "Running tests…" : `🧪 Run Workspace Tests (${testFrameworkName})`}
      </button>
      {testRunResult && (
        <div className={`test-result-box ${testRunResult.success ? "success" : "failed"}`}>
          <p style={{ margin: "0 0 4px 0" }}>
            <strong>{testRunResult.success ? "✓ Tests Passed" : "✗ Tests Failed"}:</strong> {testRunResult.summary}
          </p>
          {!testRunResult.success && (
            <button
              className="button primary"
              style={{ marginTop: 8, width: "100%" }}
              onClick={onAutoRepair}
              disabled={generating}
            >
              {generating ? "Auto-repairing with AI…" : "⚡ Auto-Repair with AI (or say \"fix it\")"}
            </button>
          )}
          {testRunResult.output && (
            <details style={{ marginTop: "4px" }}>
              <summary style={{ cursor: "pointer", opacity: 0.8 }}>View test output log</summary>
              <pre className="test-output-log">{testRunResult.output}</pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
