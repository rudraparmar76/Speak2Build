/**
 * Message contract between the React webview and the extension host.
 *
 * A webview is a sandboxed iframe: it cannot reach VS Code APIs, the file
 * system, or arbitrary network endpoints. The ONLY channel in and out is
 * `postMessage`. Both sides are type-checked against these unions, so adding
 * a message type in one place keeps both ends honest.
 *
 * Flow for every feature:
 *   webview --WebviewToHost--> host --HTTP--> backend --HTTP--> host
 *   host --HostToWebview--> webview (React re-renders from state)
 */

export type WebviewToHost =
  | { type: "checkHealth" }
  | { type: "ping"; message: string }
  /** `data` is a base64-encoded 16 kHz mono WAV recording. */
  | { type: "uploadAudio"; data: string };

export type HostToWebview =
  | { type: "health"; ok: boolean; version?: string; error?: string }
  | { type: "pingResult"; reply: string }
  | { type: "audioUploaded"; audioId: string; durationSeconds: number; sampleRate: number; channels: number; sizeBytes: number }
  | { type: "hostError"; message: string };

/** Minimal typing for the object VS Code injects as `acquireVsCodeApi()`. */
export interface VsCodeApi {
  postMessage(message: WebviewToHost): void;
}
