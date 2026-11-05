import * as vscode from "vscode";

import { SidebarPanelProvider } from "./providers/sidebarPanel";
import { ServerManager } from "./services/serverManager";

let serverManager: ServerManager | null = null;

export function activate(context: vscode.ExtensionContext): void {
  const getBackendUrl = (): string =>
    vscode.workspace
      .getConfiguration("speak2build")
      .get<string>("backendUrl", "http://127.0.0.1:8000");

  // Automatically start and manage the local backend sidecar process
  serverManager = new ServerManager(context.extensionUri, getBackendUrl);
  serverManager.ensureRunning().catch((err) => {
    console.error("[Speak2Build] Error initializing backend server:", err);
  });

  const provider = new SidebarPanelProvider(
    context.extensionUri,
    getBackendUrl,
    context.workspaceState,
  );

  // Status Bar Item
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  statusBarItem.command = "speak2build.focus";
  statusBarItem.text = "$(unmute) Speak2Build";
  statusBarItem.tooltip =
    "Speak2Build: Speech-to-code Assistant (Click to focus, Ctrl+Alt+Space to toggle recording)";
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  provider.onStateChange = (state) => {
    switch (state) {
      case "listening":
        statusBarItem.text = "$(radio-tower) Speak2Build: Listening";
        statusBarItem.tooltip = "Speak2Build: Always-listening hands-free mode active";
        break;
      case "recording":
        statusBarItem.text = "$(record) Speak2Build: Recording";
        statusBarItem.tooltip = "Speak2Build: Recording voice input…";
        break;
      case "generating":
        statusBarItem.text = "$(sync~spin) Speak2Build: Generating";
        statusBarItem.tooltip = "Speak2Build: Generating code diffs…";
        break;
      default:
        statusBarItem.text = "$(unmute) Speak2Build";
        statusBarItem.tooltip =
          "Speak2Build: Speech-to-code Assistant (Click to focus, Ctrl+Alt+Space to toggle recording)";
        break;
    }
  };

  // Commands & Shortcuts
  context.subscriptions.push(
    vscode.commands.registerCommand("speak2build.focus", () => {
      vscode.commands.executeCommand("speak2build.sidebar.focus");
    }),
    vscode.commands.registerCommand("speak2build.toggleRecording", async () => {
      await vscode.commands.executeCommand("speak2build.sidebar.focus");
      provider.toggleRecordingHotkey();
    }),
    vscode.window.registerWebviewViewProvider(SidebarPanelProvider.viewId, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );
}

export function deactivate(): void {
  serverManager?.stop();
  serverManager = null;
}
