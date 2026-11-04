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
  const isNoTests =
    testRunResult?.total === 0 ||
    testRunResult?.summary?.toLowerCase().includes("no tests collected") ||
    false;

  const boxClass = isNoTests
    ? "warning"
    : testRunResult?.success
    ? "success"
    : "failed";

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
        <div className={`test-result-box ${boxClass}`}>
          <p style={{ margin: "0 0 4px 0" }}>
            <strong>
              {isNoTests
                ? "ℹ️ No Tests Found"
                : testRunResult.success
                ? "✓ Tests Passed"
                : "✗ Tests Failed"}
              :
            </strong>{" "}
            {testRunResult.summary}
          </p>

          {!testRunResult.success && !isNoTests && (
            <button
              className="button primary"
              style={{ marginTop: 8, width: "100%" }}
              onClick={onAutoRepair}
              disabled={generating}
            >
              {generating ? "Auto-repairing with AI…" : "⚡ Auto-Repair with AI (or say \"fix it\")"}
            </button>
          )}

          {isNoTests && (
            <p style={{ margin: "6px 0 0", fontSize: "11px", opacity: 0.85 }}>
              No test files (e.g. <code>test_*.py</code>) exist in this project yet. Ask Speak2Build: <em>"Add unit tests for this"</em> to generate them.
            </p>
          )}

          {testRunResult.output && (
            <details style={{ marginTop: "6px" }}>
              <summary style={{ cursor: "pointer", opacity: 0.8 }}>View test output log</summary>
              <pre className="test-output-log">{testRunResult.output}</pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
