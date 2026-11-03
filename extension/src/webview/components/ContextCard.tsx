import type { ReactNode } from "react";

import type { FileNode, RelevantResult, ScanResult, Snippet } from "../../types/messages";

/**
 * Project Context card: workspace scan, checkbox file tree, and the loaded
 * snippet list. Pure rendering — selection state and handlers come from App.
 */

interface ContextCardProps {
  online: boolean;
  scanResult: ScanResult | null;
  scanning: boolean;
  fetchingRelevant: boolean;
  contextError: string | null;
  selectedFiles: Set<string>;
  relevantResult: RelevantResult | null;
  /** Whether a requirements result exists (drives the re-extract button). */
  hasRequirement: boolean;
  extracting: boolean;
  onScan: () => void;
  onToggleFile: (path: string) => void;
  onFetchRelevant: () => void;
  onReExtract: () => void;
}

function renderFileTree(
  node: FileNode,
  selectedFiles: Set<string>,
  toggleFileSelection: (path: string) => void,
): ReactNode {
  if (node.isDir) {
    return (
      <details key={node.path} className="file-tree-dir" open>
        <summary className="file-tree-summary">
          <span className="dir-name">📁 {node.name}</span>
        </summary>
        <div className="file-tree-children">
          {node.children?.map((child) => renderFileTree(child, selectedFiles, toggleFileSelection))}
        </div>
      </details>
    );
  }
  const isSelected = selectedFiles.has(node.path);
  return (
    <label key={node.path} className="file-tree-file">
      <input
        type="checkbox"
        checked={isSelected}
        onChange={() => toggleFileSelection(node.path)}
      />
      <span className={`file-name ${node.language ? `lang-${node.language}` : ""}`}>
        📄 {node.name}
      </span>
    </label>
  );
}

function renderSnippets(relevantResult: RelevantResult): ReactNode {
  if (relevantResult.snippets.length === 0) return null;
  return (
    <div className="snippets">
      <div className="sub-label">Relevant Snippets ({relevantResult.snippets.length})</div>
      {relevantResult.snippets.map((snippet: Snippet, index: number) => (
        <div key={index} className="snippet">
          <div className="snippet-header">
            <span className="snippet-path">{snippet.path}</span>
            {snippet.language && <span className="hint">({snippet.language})</span>}
            <span className="hint">lines {snippet.startLine}–{snippet.endLine}</span>
          </div>
          <pre className="snippet-content">{snippet.content}</pre>
        </div>
      ))}
      {relevantResult.truncated && (
        <p className="hint">⚠ Context truncated to fit budget ({relevantResult.totalChars} chars)</p>
      )}
    </div>
  );
}

export function ContextCard({
  online,
  scanResult,
  scanning,
  fetchingRelevant,
  contextError,
  selectedFiles,
  relevantResult,
  hasRequirement,
  extracting,
  onScan,
  onToggleFile,
  onFetchRelevant,
  onReExtract,
}: ContextCardProps): ReactNode {
  if (!scanResult) {
    return (
      <section className="card">
        <div className="label">Project Context</div>
        <div>
          <p className="hint">
            Select workspace files to provide code context before or after speaking.
          </p>
          <button
            className="button"
            onClick={onScan}
            disabled={!online || scanning}
          >
            {scanning ? "Scanning…" : "🔍 Scan workspace"}
          </button>
          {contextError && <p className="error-text">{contextError}</p>}
        </div>
      </section>
    );
  }

  return (
    <section className="card">
      <div className="label">Project Context</div>
      <div>
        <p className="hint">
          Detected: {scanResult.languages.join(", ") || "none"} · {scanResult.scannedFiles} files
        </p>
        <button
          className="button"
          onClick={onScan}
          disabled={!online || scanning}
        >
          {scanning ? "Scanning…" : "🔍 Re-scan workspace"}
        </button>
        {contextError && <p className="error-text">{contextError}</p>}

        <div className="file-tree">
          {renderFileTree(scanResult.fileTree, selectedFiles, onToggleFile)}
        </div>

        <div className="file-selection-summary">
          {selectedFiles.size > 0 && (
            <>
              <p className="hint">{selectedFiles.size} file(s) selected</p>
              <button
                className="button"
                onClick={onFetchRelevant}
                disabled={!online || fetchingRelevant}
              >
                {fetchingRelevant ? "Fetching snippets…" : "📥 Get relevant context"}
              </button>
            </>
          )}
        </div>

        {relevantResult && renderSnippets(relevantResult)}

        {relevantResult && relevantResult.snippets.length > 0 && (
          <div
            className="context-ready-badge"
            style={{
              marginTop: "8px",
              padding: "6px 10px",
              background: "rgba(34, 197, 94, 0.15)",
              border: "1px solid rgba(34, 197, 94, 0.4)",
              borderRadius: "4px",
            }}
          >
            <span style={{ color: "#4ade80", fontWeight: 600, fontSize: "12px" }}>
              ✓ Context loaded ({relevantResult.snippets.length} snippet{relevantResult.snippets.length === 1 ? "" : "s"} ready for voice instructions)
            </span>
          </div>
        )}

        {relevantResult && relevantResult.snippets.length > 0 && hasRequirement && (
          <button
            className="button"
            style={{ marginTop: "8px" }}
            onClick={onReExtract}
            disabled={!online || extracting}
          >
            {extracting ? "Updating requirements…" : "🔄 Re-extract requirements with selected context"}
          </button>
        )}
      </div>
    </section>
  );
}
