/**
 * Build script for the Speak2Build extension.
 *
 * Produces two independent bundles:
 *   1. dist/extension.js      — the extension host code (runs in Node, has
 *                               access to the vscode API and network).
 *   2. media/webview/main.js  — the React sidebar UI (runs inside the
 *                               sandboxed webview iframe).
 *
 * `vscode` must stay external in the host bundle: it is provided by VS Code
 * at runtime and cannot be bundled.
 */
import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/extension.ts"],
  outfile: "dist/extension.js",
  bundle: true,
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  target: "node18",
  sourcemap: true,
});

await esbuild.build({
  entryPoints: ["src/webview/main.tsx"],
  outfile: "media/webview/main.js",
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2020",
  sourcemap: true,
});

console.log("extension build complete");
