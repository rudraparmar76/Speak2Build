import * as vscode from "vscode";
import * as child_process from "child_process";
import * as path from "path";
import * as fs from "fs";
import * as http from "http";

/**
 * Manages the local Speak2Build Python backend process.
 *
 * Implements the sidecar lifecycle:
 * 1. Checks if a backend is already running on the configured port.
 * 2. If not, locates either the bundled binary (production) or the workspace
 *    virtual environment (development).
 * 3. Spawns the process in the background and pipes logs to an OutputChannel.
 * 4. Polls the /api/health endpoint until responsive.
 * 5. Cleanly terminates the child process when VS Code deactivates.
 */
export class ServerManager {
  private process: child_process.ChildProcess | null = null;
  private outputChannel: vscode.OutputChannel;
  private isStarting = false;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly getBackendUrl: () => string,
  ) {
    this.outputChannel = vscode.window.createOutputChannel("Speak2Build Backend");
  }

  /**
   * Ensures the backend service is running and responsive.
   * Resolves true if healthy, false if unable to reach or launch.
   */
  public async ensureRunning(): Promise<boolean> {
    if (await this.pingHealth()) {
      this.outputChannel.appendLine("[ServerManager] Connected to active backend at " + this.getBackendUrl());
      return true;
    }

    if (this.isStarting) {
      return false;
    }

    this.isStarting = true;
    try {
      const launched = await this.launchServer();
      if (!launched) {
        return false;
      }

      // Poll until health endpoint responds or timeout (20 seconds)
      const maxRetries = 40;
      for (let i = 0; i < maxRetries; i++) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        if (await this.pingHealth()) {
          this.outputChannel.appendLine("[ServerManager] Backend service initialized successfully.");
          return true;
        }
      }

      this.outputChannel.appendLine("[ServerManager] Timeout waiting for backend health check.");
      vscode.window.showWarningMessage(
        "Speak2Build backend took too long to start. Check the 'Speak2Build Backend' output channel for details."
      );
      return false;
    } finally {
      this.isStarting = false;
    }
  }

  /**
   * Terminate the child process if one was spawned.
   */
  public stop(): void {
    if (this.process) {
      this.outputChannel.appendLine("[ServerManager] Stopping Speak2Build backend process...");
      try {
        if (process.platform === "win32" && this.process.pid) {
          // Force-kill child process tree on Windows
          child_process.execSync(`taskkill /pid ${this.process.pid} /T /F`);
        } else {
          this.process.kill("SIGTERM");
        }
      } catch {
        // Process might already be dead
      }
      this.process = null;
    }
  }

  /**
   * Detects the best available server execution target:
   * 1. Bundled standalone binary (production)
   * 2. Workspace backend virtualenv (development fallback)
   */
  private async launchServer(): Promise<boolean> {
    const extensionPath = this.extensionUri.fsPath;
    const isWindows = process.platform === "win32";

    // 1. Look for pre-compiled standalone binary
    const binaryName = isWindows ? "speak2build-server.exe" : "speak2build-server";
    const binaryCandidates = [
      path.join(extensionPath, "bin", "speak2build-server", binaryName),
      path.join(extensionPath, "bin", binaryName),
    ];

    for (const binPath of binaryCandidates) {
      if (fs.existsSync(binPath)) {
        this.outputChannel.appendLine(`[ServerManager] Launching bundled binary: ${binPath}`);
        this.spawnProcess(binPath, []);
        return true;
      }
    }

    // 2. Fallback: Search workspace for Python virtual environment (Dev mode)
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders) {
      for (const folder of workspaceFolders) {
        const root = folder.uri.fsPath;
        const pythonCandidates = [
          path.join(root, "backend", ".venv", isWindows ? "Scripts/python.exe" : "bin/python"),
          path.join(root, ".venv", isWindows ? "Scripts/python.exe" : "bin/python"),
        ];

        for (const pyPath of pythonCandidates) {
          if (fs.existsSync(pyPath)) {
            const cwd = path.join(root, "backend");
            this.outputChannel.appendLine(
              `[ServerManager] Dev mode: Launching backend via python virtualenv: ${pyPath}`
            );
            this.spawnProcess(
              pyPath,
              ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"],
              cwd
            );
            return true;
          }
        }
      }
    }

    this.outputChannel.appendLine(
      "[ServerManager] Neither bundled binary nor Python virtualenv was found."
    );
    return false;
  }

  private spawnProcess(command: string, args: string[], cwd?: string): void {
    this.process = child_process.spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    this.process.stdout?.on("data", (data: Buffer) => {
      this.outputChannel.append(data.toString());
    });

    this.process.stderr?.on("data", (data: Buffer) => {
      this.outputChannel.append(data.toString());
    });

    this.process.on("error", (err) => {
      this.outputChannel.appendLine(`[ServerManager] Process error: ${err.message}`);
    });

    this.process.on("exit", (code, signal) => {
      this.outputChannel.appendLine(
        `[ServerManager] Process exited with code ${code ?? signal ?? 0}`
      );
      this.process = null;
    });
  }

  private pingHealth(): Promise<boolean> {
    return new Promise((resolve) => {
      let targetUrl: URL;
      try {
        targetUrl = new URL("/api/health", this.getBackendUrl());
      } catch {
        return resolve(false);
      }

      const req = http.get(
        targetUrl.toString(),
        {
          timeout: 1000,
          headers: { Connection: "close" },
        },
        (res) => {
          resolve(res.statusCode === 200);
          res.resume(); // drain response
        }
      );

      req.on("error", () => resolve(false));
      req.on("timeout", () => {
        req.destroy();
        resolve(false);
      });
      req.end();
    });
  }
}

