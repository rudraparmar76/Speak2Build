import * as vscode from "vscode";
import { randomBytes } from "node:crypto";

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
                startLine: s.start_line,
                endLine: s.end_line,
              })),
              totalChars: result.total_chars,
              truncated: result.truncated,
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
