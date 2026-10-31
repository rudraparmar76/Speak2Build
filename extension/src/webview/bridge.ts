import type { VsCodeApi } from "../types/messages";

declare const acquireVsCodeApi: () => VsCodeApi;

let api: VsCodeApi | undefined;

/**
 * VS Code injects `acquireVsCodeApi` exactly once per webview document;
 * calling it twice throws. Every UI module that needs the bridge obtains the
 * shared instance from here.
 */
export function getVsCodeApi(): VsCodeApi {
  if (!api) {
    api = acquireVsCodeApi();
  }
  return api;
}
