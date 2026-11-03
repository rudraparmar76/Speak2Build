/**
 * Message contract between the React webview and the extension host.
 *
 * A webview is a sandboxed iframe: it cannot reach VS Code APIs, the file
 * system, the microphone, or arbitrary network endpoints. The ONLY channel in
 * and out is `postMessage`. Neither side is a trust boundary shortcut: webview
 * messages are small JSON commands; the host performs all privileged work.
 */

export type WebviewToHost =
  | { type: "checkHealth" }
  | { type: "ping"; message: string }
  /** Start a microphone session owned by the local backend process. */
  | { type: "startRecording" }
  | { type: "stopRecording" }
  | { type: "cancelRecording" }
  /** Transcribe a stored recording by id. */
  | { type: "transcribe"; audioId: string }
  /** Extract structured requirements from the (edited) transcript. */
  | {
      type: "extractRequirements";
      transcript: string;
      answers?: Record<string, string>;
      contextSnippets?: Snippet[];
    }
  /** Scan workspace for project context. */
  | { type: "scanContext"; workspaceRoot: string }
  /** Request relevant snippets from user-selected files. */
  | { type: "getRelevantContext"; requirementText?: string; filePaths: string[] }
  /** Generate code diffs from requirement + context. */
  | { type: "generateCode"; requirementText: string; contextSnippets: Snippet[]; options?: Record<string, unknown> }
  /** Apply a unified diff to the workspace. */
  | { type: "applyDiff"; unifiedDiff: string; workspaceRoot: string }
  /** Revert an applied unified diff in the workspace. */
  | { type: "revertDiff"; unifiedDiff: string; workspaceRoot: string }
  /** Open proposed diff in VS Code native side-by-side diff editor. */
  | { type: "openDiffInEditor"; filePath: string; unifiedDiff: string; isNewFile?: boolean }
  /** Run tests in the workspace and report results. */
  | { type: "runWorkspaceTests"; testPath?: string; framework?: string }
  /** Auto-repair failing tests using diagnostics. */
  | {
      type: "repairCode";
      requirementText: string;
      failedTestOutput: string;
      contextSnippets?: Snippet[];
      framework?: string;
    }

  /** Detect test framework for workspace. */
  | { type: "detectTestFramework" }
  /** Open VS Code Settings filtered to Speak2Build. */
  | { type: "openSettings" }
  /** Request current LLM config state. */
  | { type: "getLlmConfig" }
  /** Update LLM provider, model, and optional API key. */
  | {
      type: "updateLlmConfig";
      provider: string;
      model: string;
      apiKey?: string;
    }
  /** Test connection to LLM with candidate credentials. */
  | {
      type: "testLlmConfig";
      provider: string;
      model: string;
      apiKey?: string;
    }
  /** Webview was rebuilt by VS Code: request the active session snapshot. */
  | { type: "loadSessionState" }
  /** Webview persists its current state (debounced; host owns storage). */
  | { type: "saveSessionState"; snapshot: SessionSnapshot }
  /** Switch the active session to a previously saved one. */
  | { type: "openSession"; sessionId: string }
  /** Discard the current board and start a fresh session. */
  | { type: "newSession" }
  /** Delete a saved session from history. */
  | { type: "deleteSession"; sessionId: string }
  /** Webview → host: read text aloud through the backend's speakers. */
  | { type: "speak"; text: string; voice?: string }
  /** Webview → host: cancel current playback. */
  | { type: "stopSpeaking" }
  /** Voice-answers flow: transcribe a dedicated answer recording. */
  | { type: "transcribeAnswer"; audioId: string }
  /** Voice-answers flow: map the transcript onto pending questions. */
  | { type: "mapAnswers"; questions: string[]; transcript: string };

/**
 * Pipeline stages for live progress reporting (streaming). The webview shows
 * them as a step strip; the host emits them from the streamed workflow.
 */
export type GenerationStage =
  | "listening"
  | "transcribing"
  | "extracting_requirements"
  | "answering_clarifications"
  | "reading_context"
  | "generating"
  | "validating"
  | "applying"
  | "repairing"
  | "done";

/** Reserved streaming chunk payload (Phase 2.5 activates emission). */
export type GenerationDeltaKind = "text" | "diff";

/**
 * RESERVED message types for token streaming. They are part of the contract
 * in Phase 0 so the UI can render them from day one; the host only starts
 * EMITTING them in Phase 2.5 (SSE from the backend). Receiving them before
 * that must be harmless (the webview ignores unknown/unhandled messages).
 */

export type LlmConfigData = {
  provider: string;
  baseUrl: string;
  model: string;
  configuredProviders: Record<string, boolean>;
};

export type ClarificationInfo = {
  question: string;
  reason?: string;
  answer?: string | null;
};

export type RequirementResult = {
  task: string;
  language: string;
  inputs: string[];
  outputs: string[];
  constraints: string[];
  acceptanceCriteria: string[];
  clarifications: ClarificationInfo[];
};

export type FileNode = {
  name: string;
  path: string;
  isDir: boolean;
  language?: string;
  sizeBytes: number;
  children?: FileNode[];
};

export type ScanResult = {
  workspaceRoot: string;
  languages: string[];
  fileTree: FileNode;
  totalFiles: number;
  scannedFiles: number;
};

export type Snippet = {
  path: string;
  language?: string;
  content: string;
  startLine: number;
  endLine: number;
};

export type RelevantResult = {
  snippets: Snippet[];
  totalChars: number;
  truncated: boolean;
};

export type FileDiff = {
  path: string;
  language: string;
  unifiedDiff: string;
  isNewFile: boolean;
};

export type GenerationResult = {
  diffs: FileDiff[];
  summary: string;
  model: string;
  processingSeconds: number;
  validated: boolean;
  validationErrors: string[];
  testErrors: string[];
  testsPassed: boolean;
};

export type TestRunResult = {
  success: boolean;
  framework?: string;
  passed: number;
  failed: number;
  errors: number;
  skipped: number;
  total: number;
  durationSeconds: number;
  summary: string;
  output: string;
};

/** Activity-log entry shape, shared between webview state and snapshots. */
export type SessionHistoryEntry = {
  id: number;
  text: string;
  timestamp: string;
};

/**
 * Everything the chat tab should rediscover when VS Code tears the webview
 * down and rebuilds it later. Transient UI state (spinners, inline errors,
 * health status) is intentionally excluded.
 */
export type SessionSnapshot = {
  version: 1;
  lastUpload: {
    audioId: string;
    durationSeconds: number;
    sampleRate: number;
    channels: number;
    sizeBytes: number;
  } | null;
  transcript: {
    audioId: string;
    language?: string;
    text: string;
    segments: Array<{ start: number; end: number; text: string }>;
    durationSeconds: number;
    processingSeconds: number;
  } | null;
  requirement: RequirementResult | null;
  requirementMeta: { model: string; processingSeconds: number; repaired: boolean } | null;
  extractAnswers: Record<string, string>;
  scanResult: ScanResult | null;
  selectedFiles: string[];
  relevantResult: RelevantResult | null;
  generationResult: GenerationResult | null;
  appliedDiffs: string[];
  dismissedDiffs: string[];
  testRunResult: TestRunResult | null;
  history: SessionHistoryEntry[];
};

/** One row in the session-history tab. */
export type SessionMeta = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
};

export type HostToWebview =
  | { type: "health"; ok: boolean; version?: string; error?: string; transcription?: string }
  | { type: "pingResult"; reply: string }
  | { type: "recordingStarted"; sampleRate: number; channels: number }
  | { type: "recordingCancelled" }
  | { type: "audioUploaded"; audioId: string; durationSeconds: number; sampleRate: number; channels: number; sizeBytes: number }
  | { type: "transcription"; audioId: string; language?: string; text: string; segments: Array<{ start: number; end: number; text: string }>; durationSeconds: number; processingSeconds: number; isCommand?: boolean }
  | { type: "requirements"; requirement: RequirementResult; model: string; processingSeconds: number; repaired: boolean }
  | { type: "contextScan"; result: ScanResult }
  | { type: "contextRelevant"; result: RelevantResult }
  | { type: "generationResult"; result: GenerationResult }
  | { type: "diffApplied"; success: boolean; message: string; affectedFiles: string[] }
  | { type: "diffReverted"; success: boolean; message: string; affectedFiles: string[] }
  | { type: "testRunResult"; result: TestRunResult }
  | { type: "voiceCommandExecuted"; action: string; feedbackSpeech: string }
  | { type: "bargeInTriggered" }

  | { type: "testFrameworkDetected"; framework: string; name: string }
  | { type: "llmConfigResult"; config: LlmConfigData }
  | { type: "llmConfigSaved"; success: boolean; model: string; provider: string }
  | { type: "llmTestResult"; valid: boolean; message: string; latencyMs: number }
  | { type: "hostError"; message: string }
  /** Full state after load/new/open/delete: snapshot + history list. */
  | {
      type: "sessionState";
      activeId: string;
      session: SessionMeta;
      snapshot: SessionSnapshot;
      sessions: SessionMeta[];
    }
  /** Lightweight refresh after a background save (title list may change). */
  | { type: "sessionList"; sessions: SessionMeta[] }
  /** Playback started on the backend. */
  | { type: "speakingStarted"; characters: number; estimatedSeconds: number; voice: string }
  /** Playback finished being cancelled / stopped. */
  | { type: "speakingStopped" }
  /** Voice-answers flow intermediates. */
  | { type: "answerTranscript"; text: string }
  | { type: "answersMapped"; answers: Array<{ question: string; answer: string }>; model: string }
  /**
   * Streaming progress for the pipeline (Phase 2.5). The webview shows the
   * current stage in a Copilot-style step strip with an elapsed timer.
   */
  | { type: "generationStage"; turnId: string; stage: GenerationStage }
  /**
   * Streamed token delta (Phase 2.5). The host batches deltas (~80–100 ms)
   * so the webview does not flood. `kind: "text"` streams into the message
   * bubble; `kind: "diff"` grows the inline diff block.
   */
  | {
      type: "generationDelta";
      turnId: string;
      kind: GenerationDeltaKind;
      /** File path for kind "diff"; ignored for kind "text". */
      filePath?: string;
      payload: string;
    }
  /** Streamed turn finished; the final result message supersedes the deltas. */
  | { type: "generationDone"; turnId: string }
  /** Context attach suggestions (Phase 1/3): top scored files for the chips. */
  | {
      type: "contextSuggest";
      turnId: string;
      files: Array<{ path: string; language?: string }>;
    }
  /** Auto-pilot mode changed (Phase 3). */
  | { type: "modeChanged"; auto: boolean };

/** Minimal typing for the object VS Code injects as `acquireVsCodeApi()`. */
export interface VsCodeApi {
  postMessage(message: WebviewToHost): void;
}
