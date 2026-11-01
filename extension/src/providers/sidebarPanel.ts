import * as vscode from "vscode";
import { randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

import type {
  WebviewToHost,
  HostToWebview,
  FileNode as FrontendFileNode,
} from "../types/messages";
import { BackendClient, describeError } from "../services/backendClient";
import type { FileNode as BackendFileNode } from "../services/backendClient";

/**
 * Owns the sidebar webview lifecycle:
 *   - injects the bundled React app with a strict CSP + per-render nonce
 *   - routes webview messages to backend calls and posts results back
 */
export class SidebarPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = "speak2build.sidebar";

  private _view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly getBackendUrl: () => string,
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this._view = view;

    view.webview.options = {
      enableScripts: true,
      // Only our own build output may be loaded; blocking other origins keeps
      // the iframe contained even if injected content misbehaves.
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "media")],
    };

    view.webview.html = this.getHtml(view.webview);

    view.webview.onDidReceiveMessage((message) => {
      void this.handleMessage(message);
    });

    // A hidden sidebar may never have received the initial health check.
    view.onDidChangeVisibility(() => {
      if (view.visible) {
        void this.handleMessage({ type: "checkHealth" });
      }
    });
  }

  private async handleMessage(message: WebviewToHost): Promise<void> {
    if (!this._view) {
      return;
    }
    // A fresh client per message means editing the backendUrl setting takes
    // effect immediately, without needing an extension reload.
    const client = new BackendClient(this.getBackendUrl());
    try {
      switch (message.type) {
        case "checkHealth": {
          const health = await client.health();
          this.post({ type: "health", ...health });
          break;
        }
        case "ping": {
          const reply = await client.ping(message.message);
          this.post({ type: "pingResult", reply });
          break;
        }
        case "startRecording": {
          const info = await client.startRecording();
          this.post({
            type: "recordingStarted",
            sampleRate: info.sample_rate,
            channels: info.channels,
          });
          break;
        }
        case "stopRecording": {
          const result = await client.stopRecording();
          this.post({
            type: "audioUploaded",
            audioId: result.audio_id,
            durationSeconds: result.duration_seconds,
            sampleRate: result.sample_rate,
            channels: result.channels,
            sizeBytes: result.size_bytes,
          });
          break;
        }
        case "cancelRecording": {
          await client.cancelRecording();
          this.post({ type: "recordingCancelled" });
          break;
        }
        case "transcribe": {
          const result = await client.transcribe(message.audioId);
          this.post({
            type: "transcription",
            audioId: result.audio_id,
            language: result.language,
            text: result.text,
            segments: result.segments,
            durationSeconds: result.duration_seconds,
            processingSeconds: result.processing_seconds,
          });
          break;
        }
        case "extractRequirements": {
          const extraction = await client.extractRequirements(
            message.transcript,
            message.answers,
            message.contextSnippets,
          );
          this.post({
            type: "requirements",
            requirement: {
              task: extraction.requirement.task,
              language: extraction.requirement.language,
              inputs: extraction.requirement.inputs,
              outputs: extraction.requirement.outputs,
              constraints: extraction.requirement.constraints,
              acceptanceCriteria: extraction.requirement.acceptance_criteria,
              clarifications: extraction.requirement.clarifications.map((item) => ({
                question: item.question,
                reason: item.reason ?? undefined,
                answer: item.answer ?? undefined,
              })),
            },
            model: extraction.model,
            processingSeconds: extraction.processing_seconds,
            repaired: extraction.repaired,
          });
          break;
        }
        case "scanContext": {
          // Resolve workspace root: if the webview sends "${workspaceFolder}",
          // use the first workspace folder; otherwise use the provided path.
          let workspaceRoot = message.workspaceRoot;
          if (workspaceRoot === "${workspaceFolder}") {
            const folders = vscode.workspace.workspaceFolders;
            if (folders && folders.length > 0) {
              workspaceRoot = folders[0].uri.fsPath;
            } else {
              this.post({
                type: "hostError",
                message: "No workspace folder open. Open a folder first.",
              });
              return;
            }
          }
          const result = await client.scanContext(workspaceRoot);
          this.post({
            type: "contextScan",
            result: {
              workspaceRoot: result.workspace_root,
              languages: result.languages,
              fileTree: this.mapFileNode(result.file_tree),
              totalFiles: result.total_files,
              scannedFiles: result.scanned_files,
            },
          });
          break;
        }
        case "getRelevantContext": {
          // Resolve workspace root from VS Code workspace folders
          const folders = vscode.workspace.workspaceFolders;
          if (!folders || folders.length === 0) {
            this.post({
              type: "hostError",
              message: "No workspace folder open.",
            });
            return;
          }
          const workspaceRoot = folders[0].uri.fsPath;
          const result = await client.getRelevantContext(
            message.requirementText,
            message.filePaths,
            workspaceRoot,
          );
          this.post({
            type: "contextRelevant",
            result: {
              snippets: result.snippets.map((s) => ({
                path: s.path,
                language: s.language,
                content: s.content,
                startLine: s.startLine,
                endLine: s.endLine,
              })),
              totalChars: result.total_chars,
              truncated: result.truncated,
            },
          });
          break;
        }
        case "generateCode": {
          const folders = vscode.workspace.workspaceFolders;
          if (!folders || folders.length === 0) {
            this.post({
              type: "hostError",
              message: "No workspace folder open.",
            });
            return;
          }
          const workspaceRoot = folders[0].uri.fsPath;
          const result = await client.generateCode(
            message.requirementText,
            message.contextSnippets,
            message.options,
            workspaceRoot,
          );
          this.post({
            type: "generationResult",
            result: {
              diffs: result.diffs.map((d) => ({
                path: d.path,
                language: d.language,
                unifiedDiff: d.unified_diff,
                isNewFile: d.is_new_file,
              })),
              summary: result.summary,
              model: result.model,
              processingSeconds: result.processing_seconds,
              validated: result.validated,
              validationErrors: result.validation_errors,
              testErrors: result.test_errors,
              testsPassed: result.tests_passed,
            },
          });
          break;
        }
        case "applyDiff": {
          const folders = vscode.workspace.workspaceFolders;
          if (!folders || folders.length === 0) {
            this.post({
              type: "hostError",
              message: "No workspace folder open.",
            });
            return;
          }
          const workspaceRoot = folders[0].uri.fsPath;
          const result = await client.applyDiff(message.unifiedDiff, workspaceRoot);
          this.post({
            type: "diffApplied",
            success: result.success,
            message: result.message,
            affectedFiles: result.affected_files,
          });
          break;
        }
        case "revertDiff": {
          const folders = vscode.workspace.workspaceFolders;
          if (!folders || folders.length === 0) {
            this.post({
              type: "hostError",
              message: "No workspace folder open.",
            });
            return;
          }
          const workspaceRoot = folders[0].uri.fsPath;
          const result = await client.revertDiff(message.unifiedDiff, workspaceRoot);
          this.post({
            type: "diffReverted",
            success: result.success,
            message: result.message,
            affectedFiles: result.affected_files,
          });
          break;
        }
        case "openDiffInEditor": {
          const folders = vscode.workspace.workspaceFolders;
          if (!folders || folders.length === 0) {
            return;
          }
          const workspaceRoot = folders[0].uri;
          const targetUri = vscode.Uri.joinPath(workspaceRoot, message.filePath);

          let originalContent = "";
          let originalUri: vscode.Uri;

          const tmpDir = os.tmpdir();
          const baseName = path.basename(message.filePath);

          if (message.isNewFile) {
            const emptyPath = path.join(tmpDir, `speak2build_empty_${baseName}`);
            fs.writeFileSync(emptyPath, "", "utf-8");
            originalUri = vscode.Uri.file(emptyPath);
          } else {
            try {
              const raw = await vscode.workspace.fs.readFile(targetUri);
              originalContent = new TextDecoder().decode(raw);
              originalUri = targetUri;
            } catch {
              const emptyPath = path.join(tmpDir, `speak2build_empty_${baseName}`);
              fs.writeFileSync(emptyPath, "", "utf-8");
              originalUri = vscode.Uri.file(emptyPath);
            }
          }

          const proposedContent = computeProposedContent(originalContent, message.unifiedDiff, !!message.isNewFile);
          const proposedPath = path.join(tmpDir, `speak2build_proposed_${baseName}`);
          fs.writeFileSync(proposedPath, proposedContent, "utf-8");
          const proposedUri = vscode.Uri.file(proposedPath);

          await vscode.commands.executeCommand(
            "vscode.diff",
            originalUri,
            proposedUri,
            `${baseName} (Current ↔ Proposed)`,
          );
          break;
        }
        case "runWorkspaceTests": {
          const folders = vscode.workspace.workspaceFolders;
          if (!folders || folders.length === 0) {
            this.post({
              type: "hostError",
              message: "No workspace folder open.",
            });
            return;
          }
          const workspaceRoot = folders[0].uri.fsPath;
          const result = await client.runTests(workspaceRoot, message.testPath);
          this.post({
            type: "testRunResult",
            result: {
              success: result.success,
              passed: result.passed,
              failed: result.failed,
              errors: result.errors,
              skipped: result.skipped,
              total: result.total,
              durationSeconds: result.duration_seconds,
              summary: result.summary,
              output: result.output,
            },
          });
          break;
        }
        default: {
          // Exhaustiveness guard: if a new WebviewToHost variant is added
          // without a case here, TypeScript flags this as an unhandled type.
          const exhaustive: never = message;
          throw new Error(`Unhandled message: ${JSON.stringify(exhaustive)}`);
        }
      }
    } catch (error) {
      this.post({ type: "hostError", message: describeError(error, this.getBackendUrl()) });
    }
  }

  private mapFileNode(node: BackendFileNode): FrontendFileNode {
    return {
      name: node.name,
      path: node.path,
      isDir: node.is_dir,
      language: node.language,
      sizeBytes: node.size_bytes,
      children: node.children?.map((c: BackendFileNode) => this.mapFileNode(c)),
    };
  }

  private post(message: HostToWebview): void {
    void this._view?.webview.postMessage(message);
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", "webview", "main.js"),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", "webview", "main.css"),
    );
    const nonce = randomBytes(16).toString("hex");

    // CSP: scripts/styles only when carrying this render's nonce. This is the
    // primary defense against persistent script injection into the webview.
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} https:;" />
  <title>Speak2Build</title>
</head>
<body>
  <div id="root"></div>
  <link nonce="${nonce}" rel="stylesheet" href="${styleUri}" />
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function computeProposedContent(
  originalContent: string,
  unifiedDiff: string,
  isNewFile: boolean,
): string {
  if (isNewFile) {
    const lines = unifiedDiff.split(/\r?\n/);
    const added: string[] = [];
    let pastHeader = false;
    for (const l of lines) {
      if (!pastHeader) {
        if (l.startsWith("@@")) {
          pastHeader = true;
        }
        continue;
      }
      if (l.startsWith("+")) {
        added.push(l.slice(1));
      }
    }
    return added.join("\n") + "\n";
  }

  const oldLines = originalContent.split(/\r?\n/);
  const newLines = [...oldLines];
  const diffLines = unifiedDiff.split(/\r?\n/);

  let i = 0;
  while (i < diffLines.length) {
    const line = diffLines[i];
    if (line.startsWith("@@")) {
      const match = line.match(/@@\s*-(\d+),?(\d*)\s*\+(\d+),?(\d*)\s*@@/);
      if (!match) {
        i++;
        continue;
      }
      const oldStart = Math.max(0, parseInt(match[1], 10) - 1);
      const oldCount = match[2] ? parseInt(match[2], 10) : 1;

      i++;
      const insertLines: string[] = [];
      while (i < diffLines.length && !diffLines[i].startsWith("@@")) {
        const hunkLine = diffLines[i];
        if (hunkLine.startsWith("+")) {
          insertLines.push(hunkLine.slice(1));
        }
        i++;
      }

      const count = Math.min(oldCount, Math.max(0, newLines.length - oldStart));
      newLines.splice(oldStart, count, ...insertLines);
    } else {
      i++;
    }
  }

  return newLines.join("\n");
}
