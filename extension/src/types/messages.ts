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
  | { type: "cancelRecording" };

export type HostToWebview =
  | { type: "health"; ok: boolean; version?: string; error?: string }
  | { type: "pingResult"; reply: string }
  | { type: "recordingStarted"; sampleRate: number; channels: number }
  | { type: "recordingCancelled" }
  | { type: "audioUploaded"; audioId: string; durationSeconds: number; sampleRate: number; channels: number; sizeBytes: number }
  | { type: "hostError"; message: string };

/** Minimal typing for the object VS Code injects as `acquireVsCodeApi()`. */
export interface VsCodeApi {
  postMessage(message: WebviewToHost): void;
}
