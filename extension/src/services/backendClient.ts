/**
 * HTTP client for the local Speak2Build backend.
 *
 * All backend traffic from the extension goes through this class so that
 * timeouts, error mapping, and URL handling live in exactly one place.
 */

const REQUEST_TIMEOUT_MS = 5000;
/** Stop calls can elapse while audio drains, so allow a longer window. */
const RECORDING_STOP_TIMEOUT_MS = 15000;

export interface HealthResult {
  ok: boolean;
  version?: string;
  error?: string;
}

export interface AudioUploadResult {
  audio_id: string;
  duration_seconds: number;
  sample_rate: number;
  channels: number;
  size_bytes: number;
}

export interface RecordingStartResult {
  sample_rate: number;
  channels: number;
}

export class BackendClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    // Strip trailing slashes so path joins are always well-formed.
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  /** Liveness check. Never throws: failures are reported as ok=false. */
  async health(): Promise<HealthResult> {
    try {
      const data = await this.request<{ status: string; version: string }>(
        "GET",
        "/api/health",
      );
      return { ok: data.status === "ok", version: data.version };
    } catch (error) {
      return { ok: false, error: describeError(error, this.baseUrl) };
    }
  }

  /** Echo round-trip. Throws; callers catch and surface the error. */
  async ping(message: string): Promise<string> {
    const data = await this.request<PingResponse>("POST", "/api/ping", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    return data.echo;
  }

  /** Start a microphone session on the backend process. */
  async startRecording(): Promise<RecordingStartResult> {
    return await this.request<RecordingStartResult>(
      "POST",
      "/api/recording/start",
    );
  }

  /** Finalize the active session; returns stored-recording metadata. */
  async stopRecording(): Promise<AudioUploadResult> {
    return await this.request<AudioUploadResult>(
      "POST",
      "/api/recording/stop",
      {},
      RECORDING_STOP_TIMEOUT_MS,
    );
  }

  /** Discard the active session; 204 No Content on success. */
  async cancelRecording(): Promise<void> {
    await this.request<void>("DELETE", "/api/recording");
  }

  private async request<T>(
    method: string,
    path: string,
    init?: RequestInit,
    timeoutMs: number = REQUEST_TIMEOUT_MS,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        method,
        signal: controller.signal,
      });
      if (!response.ok) {
        const body = await response.json().catch((): string | null => null);
        const detail =
          body && typeof body === "object" && body !== null && "detail" in body
            ? String((body as { detail: unknown }).detail)
            : await response.text().catch(() => "");
        throw new Error(`HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
      }
      if (response.status === 204) {
        return undefined as T;
      }
      return (await response.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }
}

export function describeError(error: unknown, baseUrl: string): string {
  if (error instanceof Error) {
    if (error.name === "AbortError") {
      return `Request to ${baseUrl} timed out. Is the backend running? (uvicorn app.main:app --port 8000)`;
    }
    // Node surfaces connection failures as generic TypeErrors; translate the common case.
    if (error.message.includes("fetch failed")) {
      return `Cannot reach backend at ${baseUrl}. Start it with: uvicorn app.main:app --port 8000`;
    }
    return error.message;
  }
  return String(error);
}

interface PingResponse {
  echo: string;
  received_chars: number;
  timestamp: number;
}
