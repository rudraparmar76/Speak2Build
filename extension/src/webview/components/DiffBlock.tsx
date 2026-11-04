import { useState, useMemo, type ReactNode } from "react";

import type { FileDiff } from "../../types/messages";

/**
 * One generated file diff with Apply / Reject / Revert / View actions.
 * Renders a syntax-highlighted unified diff with line numbers, collapsible
 * sections, and +/- stats.
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

interface ParsedLine {
  type: "add" | "delete" | "context" | "hunk" | "header";
  text: string;
  oldLine: number | null;
  newLine: number | null;
}

/** Parse a unified diff string into structured lines with line numbers. */
function parseDiff(raw: string): { lines: ParsedLine[]; additions: number; deletions: number } {
  const rawLines = raw.split("\n");
  let additions = 0;
  let deletions = 0;
  let oldLine = 0;
  let newLine = 0;
  const lines: ParsedLine[] = [];

  for (const line of rawLines) {
    if (line.startsWith("@@")) {
      // Parse hunk header: @@ -oldStart,oldCount +newStart,newCount @@
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        oldLine = parseInt(match[1], 10);
        newLine = parseInt(match[2], 10);
      }
      lines.push({ type: "hunk", text: line, oldLine: null, newLine: null });
    } else if (line.startsWith("---") || line.startsWith("+++") || line.startsWith("diff ") || line.startsWith("index ")) {
      lines.push({ type: "header", text: line, oldLine: null, newLine: null });
    } else if (line.startsWith("+")) {
      additions++;
      lines.push({ type: "add", text: line.slice(1), oldLine: null, newLine: newLine });
      newLine++;
    } else if (line.startsWith("-")) {
      deletions++;
      lines.push({ type: "delete", text: line.slice(1), oldLine: oldLine, newLine: null });
      oldLine++;
    } else {
      // Context line (starts with space or is empty)
      const text = line.startsWith(" ") ? line.slice(1) : line;
      lines.push({ type: "context", text, oldLine: oldLine, newLine: newLine });
      oldLine++;
      newLine++;
    }
  }

  return { lines, additions, deletions };
}

const COLLAPSE_THRESHOLD = 15;

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
  const { lines, additions, deletions } = useMemo(
    () => parseDiff(diff.unifiedDiff),
    [diff.unifiedDiff],
  );

  const shouldCollapse = lines.length > COLLAPSE_THRESHOLD;
  const [expanded, setExpanded] = useState(!shouldCollapse);

  const visibleLines = expanded ? lines : lines.slice(0, COLLAPSE_THRESHOLD);
  const hiddenCount = lines.length - COLLAPSE_THRESHOLD;

  // Extract just the filename from the path
  const fileName = diff.path.split(/[/\\]/).pop() ?? diff.path;
  const dirPath = diff.path.includes("/") || diff.path.includes("\\")
    ? diff.path.slice(0, diff.path.length - fileName.length)
    : "";

  return (
    <div className={`diff-card${isApplied ? " diff-card--applied" : ""}`}>
      {/* ── Header ── */}
      <div className="diff-header">
        <span className="diff-file-icon">📄</span>
        <span className="diff-path" title={diff.path}>
          {dirPath && <span className="diff-path__dir">{dirPath}</span>}
          {fileName}
        </span>
        <span className="diff-stats">
          {additions > 0 && <span className="diff-stats__add">+{additions}</span>}
          {deletions > 0 && <span className="diff-stats__del">-{deletions}</span>}
        </span>
        {diff.isNewFile && <span className="badge new-file">New file</span>}
        {isApplied && <span className="badge applied">✓ Applied</span>}
      </div>

      {/* ── Syntax-highlighted diff body ── */}
      <div className="diff-body">
        <table className="diff-table">
          <tbody>
            {visibleLines.map((line, i) => (
              <tr key={i} className={`diff-line diff-line--${line.type}`}>
                <td className="diff-gutter diff-gutter--old">
                  {line.type === "hunk" || line.type === "header"
                    ? ""
                    : line.oldLine ?? ""}
                </td>
                <td className="diff-gutter diff-gutter--new">
                  {line.type === "hunk" || line.type === "header"
                    ? ""
                    : line.newLine ?? ""}
                </td>
                <td className="diff-line__prefix">
                  {line.type === "add"
                    ? "+"
                    : line.type === "delete"
                    ? "-"
                    : line.type === "hunk" || line.type === "header"
                    ? ""
                    : " "}
                </td>
                <td className="diff-line__content">
                  {line.type === "hunk" || line.type === "header"
                    ? line.text
                    : line.text}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Collapse/expand toggle */}
        {shouldCollapse && (
          <button
            className="diff-collapse-toggle"
            onClick={() => setExpanded((prev) => !prev)}
          >
            {expanded
              ? "▲ Collapse"
              : `▼ Show ${hiddenCount} more line${hiddenCount === 1 ? "" : "s"}`}
          </button>
        )}
      </div>

      {/* ── Action buttons ── */}
      <div className="diff-actions">
        <button
          className="diff-action-btn diff-action-btn--view"
          onClick={onView}
          title="Open side-by-side diff in VS Code editor"
        >
          <span className="diff-action-icon">🔍</span> View
        </button>
        {!isApplied ? (
          <>
            <button
              className="diff-action-btn diff-action-btn--apply"
              onClick={onApply}
              disabled={!online || isApplying}
            >
              <span className="diff-action-icon">✓</span>
              {isApplying ? "Applying…" : "Accept"}
            </button>
            <button
              className="diff-action-btn diff-action-btn--reject"
              onClick={onReject}
              title="Reject and dismiss this diff"
            >
              <span className="diff-action-icon">✕</span> Reject
            </button>
          </>
        ) : (
          <button
            className="diff-action-btn diff-action-btn--revert"
            onClick={onRevert}
            disabled={!online || isReverting}
          >
            <span className="diff-action-icon">⎌</span>
            {isReverting ? "Reverting…" : "Revert"}
          </button>
        )}
      </div>
      {errorMessage && <p className="error-text">{errorMessage}</p>}
    </div>
  );
}
