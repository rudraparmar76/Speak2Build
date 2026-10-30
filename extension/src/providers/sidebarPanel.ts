import * as vscode from "vscode";
import { randomBytes } from "node:crypto";

import type { HostToWebview, WebviewToHost } from "../types/messages";
import { BackendClient, describeError } from "../services/backendClient";

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
