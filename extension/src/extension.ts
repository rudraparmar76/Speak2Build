import * as vscode from "vscode";

import { SidebarPanelProvider } from "./providers/sidebarPanel";

export function activate(context: vscode.ExtensionContext): void {
  const getBackendUrl = (): string =>
    vscode.workspace
      .getConfiguration("speak2build")
      .get<string>("backendUrl", "http://127.0.0.1:8000");

  // workspaceState survives webview teardowns and window reloads, scoped to
  // this workspace — exactly where sidebar sessions belong.
  const provider = new SidebarPanelProvider(
    context.extensionUri,
    getBackendUrl,
    context.workspaceState,
  );

  context.subscriptions.push(
    // retainContextWhenHidden keeps the React app mounted while the sidebar is
    // hidden (e.g. the user edits a file); without it the iframe is torn down
    // on every focus change.
    vscode.window.registerWebviewViewProvider(SidebarPanelProvider.viewId, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );
}

export function deactivate(): void {
  // Nothing to clean up yet.
}
