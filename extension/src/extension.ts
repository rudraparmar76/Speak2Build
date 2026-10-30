import * as vscode from "vscode";

import { SidebarPanelProvider } from "./providers/sidebarPanel";

export function activate(context: vscode.ExtensionContext): void {
  const getBackendUrl = (): string =>
    vscode.workspace
      .getConfiguration("speak2build")
      .get<string>("backendUrl", "http://127.0.0.1:8000");

  const provider = new SidebarPanelProvider(context.extensionUri, getBackendUrl);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SidebarPanelProvider.viewId, provider),
  );
}

export function deactivate(): void {
  // Nothing to clean up yet.
}
