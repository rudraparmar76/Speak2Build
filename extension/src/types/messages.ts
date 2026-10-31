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
  | { type: "getRelevantContext"; requirementText: string; filePaths: string[] }
  /** Generate code diffs from requirement + context. */
  | { type: "generateCode"; requirementText: string; contextSnippets: Snippet[]; options?: Record<string, unknown> }
  /** Apply a unified diff to the workspace. */
  | { type: "applyDiff"; unifiedDiff: string; workspaceRoot: string };

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
};

export type HostToWebview =
  | { type: "health"; ok: boolean; version?: string; error?: string; transcription?: string }
  | { type: "pingResult"; reply: string }
  | { type: "recordingStarted"; sampleRate: number; channels: number }
  | { type: "recordingCancelled" }
  | { type: "audioUploaded"; audioId: string; durationSeconds: number; sampleRate: number; channels: number; sizeBytes: number }
  | { type: "transcription"; audioId: string; language?: string; text: string; segments: Array<{ start: number; end: number; text: string }>; durationSeconds: number; processingSeconds: number }
  | { type: "requirements"; requirement: RequirementResult; model: string; processingSeconds: number; repaired: boolean }
  | { type: "contextScan"; result: ScanResult }
  | { type: "contextRelevant"; result: RelevantResult }
  | { type: "generationResult"; result: GenerationResult }
  | { type: "diffApplied"; success: boolean; message: string; affectedFiles: string[] }
  | { type: "hostError"; message: string };

/** Minimal typing for the object VS Code injects as `acquireVsCodeApi()`. */
export interface VsCodeApi {
  postMessage(message: WebviewToHost): void;
}
