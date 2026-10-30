/**
 * HTTP client for the local Speak2Build backend.
 *
 * All backend traffic from the extension goes through this class so that
 * timeouts, error mapping, and URL handling live in exactly one place.
 */

const REQUEST_TIMEOUT_MS = 5000;

export interface HealthResult {
  ok: boolean;
  version?: string;
  error?: string;
}

interface PingResponse {
  echo: string;
  received_chars: number;
  timestamp: number;
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

  private async request<T>(method: string, path: string, init?: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        method,
        signal: controller.signal,
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(
          `Backend responded with HTTP ${response.status}${body ? `: ${body}` : ""}`,
        );
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
