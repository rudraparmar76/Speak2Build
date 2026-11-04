import * as vscode from "vscode";
import { randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

import type {
  HostToWebview,
  WebviewToHost,
  FileNode as FrontendFileNode,
} from "../types/messages";
import { BackendClient, describeError } from "../services/backendClient";
import type { FileNode as BackendFileNode, LLMConfigStatus } from "../services/backendClient";
import { SessionStore } from "../services/sessionStore";

/** Known provider base URLs. */
const PROVIDER_URLS: Record<string, string> = {
  "google-ai-studio": "https://generativelanguage.googleapis.com/v1beta/openai",
  "groq": "https://api.groq.com/openai/v1",
  "ollama": "http://127.0.0.1:11434/v1",
  "nvidia-nim": "https://integrate.api.nvidia.com/v1",
  "openai": "https://api.openai.com/v1",
};

/** Default model per provider (when user doesn't specify one). */
const PROVIDER_DEFAULT_MODELS: Record<string, string> = {
  "google-ai-studio": "gemini-2.5-flash",
  "groq": "qwen-qwq-32b",
  "ollama": "qwen3:14b",
  "nvidia-nim": "nvidia/nemotron-3-ultra-550b-a55b",
  "openai": "gpt-4.1-mini",
};

/**
 * Owns the sidebar webview lifecycle:
 *   - injects the bundled React app with a strict CSP + per-render nonce
 *   - routes webview messages to backend calls and posts results back
 */
export class SidebarPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = "speak2build.sidebar";

  private _view?: vscode.WebviewView;
  private readonly sessions: SessionStore;
  private bargeInPollTimer?: NodeJS.Timeout;

  private getClient(): BackendClient {
    return new BackendClient(this.getBackendUrl());
  }

  private bargeInSessionActive = false;

  private startBargeInPolling(maxDurationMs: number): void {
    this.stopBargeInPolling();
    this.bargeInSessionActive = false;
    const startTime = Date.now();
    const interval = 200;
    this.bargeInPollTimer = setInterval(async () => {
      if (!this.bargeInSessionActive && Date.now() - startTime > maxDurationMs) {
        this.stopBargeInPolling();
        return;
      }
      try {
        const client = this.getClient();
        const status = await client.getBargeInStatus();
        if (status.barge_in_triggered && !this.bargeInSessionActive) {
          this.bargeInSessionActive = true;
          this.post({ type: "speakingStopped" });
          this.post({ type: "bargeInTriggered" });
        }
        if (status.auto_audio_id) {
          this.stopBargeInPolling();
          const audioId = status.auto_audio_id;
          const duration = status.duration_seconds || 1.5;
          this.post({
            type: "audioUploaded",
            audioId,
            durationSeconds: duration,
            sampleRate: 16000,
            channels: 1,
            sizeBytes: 0,
          });
        }
      } catch {
        // Ignore polling errors
      }
    }, interval);
  }

  private stopBargeInPolling(): void {
    if (this.bargeInPollTimer) {
      clearInterval(this.bargeInPollTimer);
      this.bargeInPollTimer = undefined;
    }
  }

  private autoListenPollTimer?: NodeJS.Timeout;
  private autoListenActive = false;
  private lastAutoListenState = "disabled";

  private async startAutoListen(client?: BackendClient): Promise<void> {
    const c = client || this.getClient();
    this.stopAutoListenPolling();
    this.autoListenActive = true;
    try {
      const res = await c.setAutoListen(true);
      this.lastAutoListenState = res.state;
      this.post({ type: "autoListenState", enabled: true, state: res.state });
    } catch {
      // best-effort
    }

    this.autoListenPollTimer = setInterval(async () => {
      if (!this.autoListenActive) {
        this.stopAutoListenPolling();
        return;
      }
      try {
        const cl = this.getClient();
        const status = await cl.getAutoListenStatus();
        if (status.state !== this.lastAutoListenState) {
          this.lastAutoListenState = status.state;
          this.post({ type: "autoListenState", enabled: status.enabled, state: status.state });
        }
        if (status.state === "captured" && status.audio_id) {
          const consumed = await cl.consumeAutoListen();
          const audioId = consumed.audio_id || status.audio_id;
          const duration = status.duration_seconds || 1.5;
          this.post({
            type: "audioUploaded",
            audioId,
            durationSeconds: duration,
            sampleRate: 16000,
            channels: 1,
            sizeBytes: 0,
          });
        }
      } catch {
        // ignore transient poll errors
      }
    }, 200);
  }

  private async stopAutoListen(client?: BackendClient): Promise<void> {
    this.autoListenActive = false;
    this.stopAutoListenPolling();
    try {
      const c = client || this.getClient();
      await c.setAutoListen(false);
    } catch {
      // best-effort
    }
    this.lastAutoListenState = "disabled";
    this.post({ type: "autoListenState", enabled: false, state: "disabled" });
  }

  private stopAutoListenPolling(): void {
    if (this.autoListenPollTimer) {
      clearInterval(this.autoListenPollTimer);
      this.autoListenPollTimer = undefined;
    }
  }

  private async speakUtterance(text: string, voice?: string): Promise<void> {
    try {
      const client = this.getClient();
      if (this.autoListenActive) {
        await client.pauseAutoListen();
      }
      const result = await client.speak(text, voice);
      this.post({
        type: "speakingStarted",
        characters: result.characters,
        estimatedSeconds: result.duration_seconds,
        voice: result.voice,
      });
      const pollDuration = Math.max((result.duration_seconds + 1.0) * 1000, 3000);
      this.startBargeInPolling(pollDuration);
      setTimeout(async () => {
        if (this.autoListenActive) {
          await client.resumeAutoListen();
        }
      }, pollDuration);
    } catch {
      if (this.autoListenActive) {
        const client = this.getClient();
        await client.resumeAutoListen();
      }
    }
  }


  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly getBackendUrl: () => string,
    sessionStorage: vscode.Memento,
  ) {
    this.sessions = new SessionStore(sessionStorage);
  }

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
          // Sync LLM config from VS Code settings → backend (fire-and-forget)
          if (health.ok) {
            this.syncLlmConfig(client).catch(() => {/* best-effort */});
          }
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

          // Check for voice commands ("apply it", "revert", "run tests", "fix it", etc.)
          let isCommand = false;
          try {
            const trimmed = (result.text || "").trim();
            if (trimmed.length > 0) {
              const command = await client.classifyCommand(trimmed);
              if (command.is_command && command.action !== "none") {
                isCommand = true;
                if (command.action === "stop_listening") {
                  await this.stopAutoListen(client);
                } else if (command.action === "start_listening") {
                  await this.startAutoListen(client);
                }
                this.post({
                  type: "voiceCommandExecuted",
                  action: command.action,
                  feedbackSpeech: command.feedback_speech,
                });
                if (command.feedback_speech) {
                  await this.speakUtterance(command.feedback_speech).catch(() => {});
                }
              }
            }
          } catch {
            // best-effort classification
          }

          this.post({
            type: "transcription",
            audioId: result.audio_id,
            language: result.language,
            text: result.text,
            segments: result.segments,
            durationSeconds: result.duration_seconds,
            processingSeconds: result.processing_seconds,
            isCommand,
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
          // Auto-detect test framework for this workspace
          try {
            const detected = await client.detectTestFramework(workspaceRoot);
            this.post({
              type: "testFrameworkDetected",
              framework: detected.framework,
              name: detected.name,
            });
          } catch {
            // best-effort
          }
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
            message.requirementText ?? "",
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
        case "repairCode": {
          const folders = vscode.workspace.workspaceFolders;
          const workspaceRoot = folders && folders.length > 0 ? folders[0].uri.fsPath : "";
          try {
            const repairResult = await client.repairCode(
              message.requirementText,
              message.failedTestOutput,
              message.contextSnippets,
              workspaceRoot,
              message.framework,
            );
            this.post({
              type: "generationResult",
              result: {
                diffs: repairResult.diffs.map((d) => ({
                  path: d.path,
                  language: d.language,
                  unifiedDiff: d.unified_diff,
                  isNewFile: d.is_new_file,
                })),
                summary: repairResult.summary,
                model: repairResult.model,
                processingSeconds: repairResult.processing_seconds,
                validated: repairResult.validated,
                validationErrors: repairResult.validation_errors,
                testErrors: repairResult.test_errors,
                testsPassed: repairResult.tests_passed,
              },
            });
            await this.speakUtterance(repairResult.summary).catch(() => {});
          } catch (error) {
            this.post({
              type: "hostError",
              message: describeError(error, this.getBackendUrl()),
            });
          }
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
          const result = await client.runTests(workspaceRoot, message.testPath, message.framework);
          this.post({
            type: "testRunResult",
            result: {
              success: result.success,
              framework: result.framework,
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
        case "detectTestFramework": {
          const folders = vscode.workspace.workspaceFolders;
          if (!folders || folders.length === 0) {
            return;
          }
          const workspaceRoot = folders[0].uri.fsPath;
          try {
            const detected = await client.detectTestFramework(workspaceRoot);
            this.post({
              type: "testFrameworkDetected",
              framework: detected.framework,
              name: detected.name,
            });
          } catch {
            // best-effort
          }
          break;
        }
        case "openSettings": {
          await vscode.commands.executeCommand("workbench.action.openSettings", "speak2build");
          break;
        }
        case "getLlmConfig": {
          const cfg = vscode.workspace.getConfiguration("speak2build");
          const provider = cfg.get<string>("llmProvider", "nvidia-nim");
          const backendCfg = await client.getLlmConfig();
          const configuredKeys = cfg.get<Record<string, string>>("llmApiKeys", {});
          const configuredProviders: Record<string, boolean> = {
            "ollama": true, // ollama never needs key
            "google-ai-studio": Boolean(configuredKeys["google-ai-studio"]),
            "groq": Boolean(configuredKeys["groq"]),
            "openai": Boolean(configuredKeys["openai"]),
            "nvidia-nim": Boolean(configuredKeys["nvidia-nim"] || (backendCfg.has_api_key && backendCfg.base_url.includes("nvidia"))),
          };

          this.post({
            type: "llmConfigResult",
            config: {
              provider,
              baseUrl: backendCfg.base_url,
              model: backendCfg.model,
              configuredProviders,
            },
          });
          break;
        }
        case "updateLlmConfig": {
          const provider = message.provider;
          const baseUrl = PROVIDER_URLS[provider] || "";
          const model = message.model || PROVIDER_DEFAULT_MODELS[provider] || "";
          const apiKey = message.apiKey || "";

          // Also persist into VS Code settings so they stay across restarts
          const cfg = vscode.workspace.getConfiguration("speak2build");
          await cfg.update("llmProvider", provider, vscode.ConfigurationTarget.Global);
          await cfg.update("llmModel", model, vscode.ConfigurationTarget.Global);
          
          let effectiveKey = apiKey;
          const keysMap = { ...cfg.get<Record<string, string>>("llmApiKeys", {}) };
          if (apiKey) {
            keysMap[provider] = apiKey;
            await cfg.update("llmApiKeys", keysMap, vscode.ConfigurationTarget.Global);
            await cfg.update("llmApiKey", apiKey, vscode.ConfigurationTarget.Global);
          } else {
            effectiveKey = keysMap[provider] || "";
          }

          // Push to live backend
          await client.updateLlmConfig({
            base_url: baseUrl,
            model,
            api_key: effectiveKey,
          });

          this.post({
            type: "llmConfigSaved",
            success: true,
            provider,
            model,
          });
          break;
        }
        case "testLlmConfig": {
          const provider = message.provider;
          const baseUrl = PROVIDER_URLS[provider] || "";
          const model = message.model || PROVIDER_DEFAULT_MODELS[provider] || "";

          const cfg = vscode.workspace.getConfiguration("speak2build");
          const keysMap = cfg.get<Record<string, string>>("llmApiKeys", {});
          const effectiveKey = message.apiKey || keysMap[provider] || "";

          try {
            const testRes = await client.testLlm({
              base_url: baseUrl,
              model,
              api_key: effectiveKey,
            });
            this.post({
              type: "llmTestResult",
              valid: testRes.valid,
              message: testRes.message,
              latencyMs: testRes.latency_ms,
            });
          } catch (err: unknown) {
            this.post({
              type: "llmTestResult",
              valid: false,
              message: describeError(err, baseUrl),
              latencyMs: 0,
            });
          }
          break;
        }
        case "loadSessionState": {
          const { meta, snapshot } = this.sessions.ensureActive();
          this.post({
            type: "sessionState",
            activeId: meta.id,
            session: meta,
            snapshot,
            sessions: this.sessions.list(),
          });
          break;
        }
        case "saveSessionState": {
          let activeId = this.sessions.activeId();
          if (!activeId) {
            activeId = this.sessions.ensureActive().meta.id;
          }
          const sessions = this.sessions.save(activeId, message.snapshot);
          this.post({ type: "sessionList", sessions });
          break;
        }
        case "openSession": {
          const loaded = this.sessions.open(message.sessionId);
          if (!loaded) {
            this.post({ type: "hostError", message: "Session not found in history." });
            break;
          }
          this.post({
            type: "sessionState",
            activeId: loaded.meta.id,
            session: loaded.meta,
            snapshot: loaded.snapshot,
            sessions: this.sessions.list(),
          });
          break;
        }
        case "newSession": {
          const { meta, snapshot } = this.sessions.create();
          this.post({
            type: "sessionState",
            activeId: meta.id,
            session: meta,
            snapshot,
            sessions: this.sessions.list(),
          });
          break;
        }
        case "deleteSession": {
          const { meta, snapshot } = this.sessions.delete(message.sessionId);
          this.post({
            type: "sessionState",
            activeId: meta.id,
            session: meta,
            snapshot,
            sessions: this.sessions.list(),
          });
          break;
        }
        case "speak": {
          await this.speakUtterance(message.text, message.voice);
          break;
        }
        case "stopSpeaking": {
          this.stopBargeInPolling();
          await client.stopSpeaking();
          if (this.autoListenActive) {
            await client.resumeAutoListen();
          }
          this.post({ type: "speakingStopped" });
          break;
        }
        case "transcribeAnswer": {
          const result = await client.transcribe(message.audioId);
          this.post({ type: "answerTranscript", text: result.text });
          break;
        }
        case "enableAutoListen": {
          await this.startAutoListen(client);
          break;
        }
        case "disableAutoListen": {
          await this.stopAutoListen(client);
          break;
        }
        case "getAutoListenStatus": {
          const status = await client.getAutoListenStatus();
          this.post({ type: "autoListenState", enabled: status.enabled, state: status.state });
          break;
        }
        case "mapAnswers": {
          const mapped = await client.mapAnswers(message.questions, message.transcript);
          this.post({
            type: "answersMapped",
            answers: mapped.answers,
            model: mapped.model,
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

  /**
   * Read LLM settings from VS Code configuration and push them to the
   * backend so the user never needs to touch .env files.
   */
  private async syncLlmConfig(client: BackendClient): Promise<void> {
    const cfg = vscode.workspace.getConfiguration("speak2build");
    const provider = cfg.get<string>("llmProvider", "custom");
    const userModel = cfg.get<string>("llmModel", "");
    const userBaseUrl = cfg.get<string>("llmBaseUrl", "");
    const timeout = cfg.get<number>("llmTimeout", 120);

    const keysMap = cfg.get<Record<string, string>>("llmApiKeys", {});
    const apiKey = keysMap[provider] || cfg.get<string>("llmApiKey", "");

    // Resolve base URL: user override > provider default
    const baseUrl = userBaseUrl || PROVIDER_URLS[provider] || "";
    // Resolve model: user override > provider default
    const model = userModel || PROVIDER_DEFAULT_MODELS[provider] || "";

    if (!baseUrl && !model) {
      return; // Nothing configured yet, let backend use its .env defaults
    }

    await client.updateLlmConfig({
      base_url: baseUrl,
      model,
      api_key: apiKey,
      timeout,
    });
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
