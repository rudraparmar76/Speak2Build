/**
 * HTTP client for the local Speak2Build backend.
 *
 * All backend traffic from the extension goes through this class so that
 * timeouts, error mapping, and URL handling live in exactly one place.
 */

const REQUEST_TIMEOUT_MS = 5000;
/** Stop calls can elapse while audio drains, so allow a longer window. */
const RECORDING_STOP_TIMEOUT_MS = 15000;
/**
 * First transcription can contend with model warm-up (or a one-time model
 * download), so allow minutes rather than seconds.
 */
const TRANSCRIBE_TIMEOUT_MS = 180_000;
/** LLM extraction round-trips can be slow; allow two minutes. */
const REQUIREMENTS_TIMEOUT_MS = 120_000;
/** Context scan can take a few seconds on large workspaces. */
const CONTEXT_SCAN_TIMEOUT_MS = 30_000;
/** Relevance scoring is fast; keep default. */
const RELEVANT_TIMEOUT_MS = 15_000;
/** Code generation can take a minute or more (multi-file + repair loop). */
const GENERATION_TIMEOUT_MS = 300_000;
/** Diff apply is fast. */
const APPLY_DIFF_TIMEOUT_MS = 10_000;
/** TTS: network synthesis (1–3 s typical) + play-start only, never full playback. */
const SPEAK_TIMEOUT_MS = 20_000;

export interface HealthResult {
  ok: boolean;
  version?: string;
  error?: string;
  /** Whisper model state: idle | loading | ready | error. */
  transcription?: string;
}

interface TranscriptionResponse {
  audio_id: string;
  language?: string;
  duration_seconds: number;
  processing_seconds: number;
  text: string;
  segments: Array<{ start: number; end: number; text: string }>;
}

export interface FileNode {
  name: string;
  path: string;
  is_dir: boolean;
  language?: string;
  size_bytes: number;
  children?: FileNode[];
}

export interface FileDiff {
  path: string;
  language: string;
  unified_diff: string;
  is_new_file: boolean;
}

interface Snippet {
  path: string;
  language?: string;
  content: string;
  startLine: number;
  endLine: number;
}

interface RequirementsApiResponse {
  requirement: {
    task: string;
    language: string;
    inputs: string[];
    outputs: string[];
    constraints: string[];
    acceptance_criteria: string[];
    clarifications: Array<{ question: string; reason?: string | null; answer?: string | null }>;
  };
  model: string;
  processing_seconds: number;
  repaired: boolean;
}

interface ScanResponse {
  workspace_root: string;
  languages: string[];
  file_tree: FileNode;
  total_files: number;
  scanned_files: number;
}

interface RelevantResponse {
  snippets: Snippet[];
  total_chars: number;
  truncated: boolean;
}

interface GenerationApiResponse {
  diffs: FileDiff[];
  summary: string;
  model: string;
  processing_seconds: number;
  validated: boolean;
  validation_errors: string[];
  test_errors: string[];
  tests_passed: boolean;
}

interface ApplyDiffResponse {
  success: boolean;
  message: string;
  affected_files: string[];
}

export interface TestRunApiResponse {
  success: boolean;
  framework?: string;
  passed: number;
  failed: number;
  errors: number;
  skipped: number;
  total: number;
  duration_seconds: number;
  summary: string;
  output: string;
}

export interface CommandClassifyResponse {
  is_command: boolean;
  action: "apply" | "revert" | "reject" | "run_tests" | "repair" | "new_session" | "stop_listening" | "start_listening" | "cancel" | "none";
  confidence: number;
  feedback_speech: string;
}

export interface RepairApiResponse extends GenerationApiResponse {
  repaired?: boolean;
}

export interface TestFrameworkDetectResponse {
  framework: string;
  name: string;
}

export interface SpeakResponse {
  played: boolean;
  characters: number;
  duration_seconds: number;
  sample_rate: number;
  voice: string;
  rate: string;
}

export interface BargeInStatusResponse {
  barge_in_active: boolean;
  barge_in_triggered: boolean;
  state: string;
  auto_audio_id?: string | null;
  duration_seconds?: number;
}

export interface AutoListenStatusResponse {
  enabled: boolean;
  state: "disabled" | "listening" | "recording" | "captured" | "paused";
  audio_id?: string | null;
  duration_seconds: number;
}

export interface AutoListenConsumeResponse {
  audio_id?: string | null;
}

export interface StopSpeakResponse {
  stopped: boolean;
}

export interface MappedAnswersResponse {
  answers: Array<{ question: string; answer: string }>;
  model: string;
  processing_seconds: number;
}

interface GenerationOptions {
  include_tests?: boolean;
  max_files?: number;
  style_guidance?: string;
}

export interface AudioUploadResult {
  audio_id: string;
  duration_seconds: number;
  sample_rate: number;
  channels: number;
  size_bytes: number;
}

export interface LLMConfigStatus {
  base_url: string;
  model: string;
  has_api_key: boolean;
  timeout: number;
  configured: boolean;
}

export interface LLMTestResult {
  valid: boolean;
  message: string;
  latency_ms: number;
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
      const data = await this.request<{ status: string; version: string; transcription: string }>(
        "GET",
        "/api/health",
      );
      return {
        ok: data.status === "ok",
        version: data.version,
        transcription: data.transcription,
      };
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

  /** Get current LLM configuration from the backend. */
  async getLlmConfig(): Promise<LLMConfigStatus> {
    return await this.request<LLMConfigStatus>("GET", "/api/llm/config");
  }

  /** Push LLM configuration from VS Code settings to the backend. */
  async updateLlmConfig(config: {
    base_url?: string;
    model?: string;
    api_key?: string;
    timeout?: number;
  }): Promise<LLMConfigStatus> {
    return await this.request<LLMConfigStatus>("PUT", "/api/llm/config", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
  }

  /** Test LLM credentials by requesting a quick ping from the backend. */
  async testLlm(payload: {
    base_url: string;
    model: string;
    api_key?: string;
    timeout?: number;
  }): Promise<LLMTestResult> {
    return await this.request<LLMTestResult>("POST", "/api/llm/test", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }, 20_000);
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

  /** Transcribe a stored recording by id. Throws; caller surfaces errors. */
  async transcribe(audioId: string): Promise<TranscriptionResponse> {
    return await this.request<TranscriptionResponse>(
      "POST",
      "/api/transcribe",
      {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio_id: audioId }),
      },
      TRANSCRIBE_TIMEOUT_MS,
    );
  }

  /**
   * Extract structured requirements from the edited transcript.
   * Optional `answers` re-runs extraction after clarification rounds.
   * Optional `contextSnippets` provides project code context to avoid
   * asking for existing code in clarification questions.
   */
  async extractRequirements(
    transcript: string,
    answers?: Record<string, string>,
    contextSnippets?: Snippet[],
  ): Promise<RequirementsApiResponse> {
    const body: Record<string, unknown> = { transcript };
    if (answers && Object.keys(answers).length > 0) {
      body.answers = answers;
    }
    if (contextSnippets && contextSnippets.length > 0) {
      body.context_snippets = contextSnippets;
    }
    return await this.request<RequirementsApiResponse>(
      "POST",
      "/api/requirements",
      {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      REQUIREMENTS_TIMEOUT_MS,
    );
  }

  /** Scan workspace for languages and file tree (metadata only). */
  async scanContext(workspaceRoot: string): Promise<ScanResponse> {
    return await this.request<ScanResponse>(
      "POST",
      "/api/context/scan",
      {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace_root: workspaceRoot }),
      },
      CONTEXT_SCAN_TIMEOUT_MS,
    );
  }

  /** Get relevant snippets from selected files for a requirement. */
  async getRelevantContext(
    requirementText: string = "",
    filePaths: string[],
    workspaceRoot: string,
  ): Promise<RelevantResponse> {
    return await this.request<RelevantResponse>(
      "POST",
      "/api/context/relevant",
      {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requirement_text: requirementText,
          file_paths: filePaths,
          workspace_root: workspaceRoot,
        }),
      },
      RELEVANT_TIMEOUT_MS,
    );
  }

  /** Generate code diffs from requirement + context snippets. */
  async generateCode(
    requirementText: string,
    contextSnippets: Snippet[],
    options?: GenerationOptions,
    workspaceRoot?: string,
  ): Promise<GenerationApiResponse> {
    return await this.request<GenerationApiResponse>(
      "POST",
      "/api/generate",
      {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requirement_text: requirementText,
          context_snippets: contextSnippets,
          options: options || {},
          workspace_root: workspaceRoot,
        }),
      },
      GENERATION_TIMEOUT_MS,
    );
  }

  /** Apply a unified diff to the workspace. */
  async applyDiff(unifiedDiff: string, workspaceRoot: string): Promise<ApplyDiffResponse> {
    return await this.request<ApplyDiffResponse>(
      "POST",
      "/api/diff/apply",
      {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unified_diff: unifiedDiff, workspace_root: workspaceRoot }),
      },
      APPLY_DIFF_TIMEOUT_MS,
    );
  }

  /** Revert an applied unified diff in the workspace. */
  async revertDiff(unifiedDiff: string, workspaceRoot: string): Promise<ApplyDiffResponse> {
    return await this.request<ApplyDiffResponse>(
      "POST",
      "/api/diff/revert",
      {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unified_diff: unifiedDiff, workspace_root: workspaceRoot }),
      },
      APPLY_DIFF_TIMEOUT_MS,
    );
  }

  /** Run workspace tests (auto-detected or specified framework). */
  async runTests(
    workspaceRoot: string,
    testPath?: string,
    framework?: string,
    timeoutSeconds: number = 30,
  ): Promise<TestRunApiResponse> {
    return await this.request<TestRunApiResponse>(
      "POST",
      "/api/validate/tests",
      {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_root: workspaceRoot,
          test_path: testPath || undefined,
          framework: framework || undefined,
          timeout_seconds: timeoutSeconds,
        }),
      },
      (timeoutSeconds + 5) * 1000,
    );
  }

/** Classify spoken transcript into an actionable voice command. */
  async classifyCommand(transcript: string): Promise<CommandClassifyResponse> {
    return await this.request<CommandClassifyResponse>(
      "POST",
      "/api/commands/classify",
      {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
      },
      REQUEST_TIMEOUT_MS,
    );
  }

  /** Auto-repair failing tests with LLM guidance. */
  async repairCode(
    requirementText: string,
    failedTestOutput: string,
    contextSnippets: Snippet[] = [],
    workspaceRoot?: string,
    framework?: string,
    options?: Record<string, unknown>,
  ): Promise<RepairApiResponse> {
    return await this.request<RepairApiResponse>(
      "POST",
      "/api/repair",
      {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requirement_text: requirementText,
          failed_test_output: failedTestOutput,
          context_snippets: contextSnippets,
          workspace_root: workspaceRoot || undefined,
          framework: framework || undefined,
          options: options || {},
        }),
      },
      GENERATION_TIMEOUT_MS,
    );
  }

  /** Auto-detect test framework for workspace. */
  async detectTestFramework(workspaceRoot: string): Promise<TestFrameworkDetectResponse> {
    return await this.request<TestFrameworkDetectResponse>(
      "GET",
      `/api/validate/detect?workspace_root=${encodeURIComponent(workspaceRoot)}`,
    );
  }

  /** Synthesize text and start non-blocking playback on the backend's speakers. */
  async speak(text: string, voice?: string): Promise<SpeakResponse> {
    return await this.request<SpeakResponse>(
      "POST",
      "/api/tts/play",
      {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: voice || undefined }),
      },
      SPEAK_TIMEOUT_MS,
    );
  }

  /** Cancel the utterance currently playing (no-op success when idle). */
  async stopSpeaking(): Promise<StopSpeakResponse> {
    return await this.request<StopSpeakResponse>(
      "POST",
      "/api/tts/stop",
      { method: "POST" },
      REQUEST_TIMEOUT_MS,
    );
  }

  /** Check voice barge-in status during TTS speech playback. */
  async getBargeInStatus(): Promise<BargeInStatusResponse> {
    return await this.request<BargeInStatusResponse>(
      "GET",
      "/api/recording/barge-in-status",
      undefined,
      1000,
    );
  }

  /** Map one spoken-reply transcript onto pending clarification questions. */
  /** Enable or disable always-listening Silero VAD monitoring. */
  async setAutoListen(enabled: boolean): Promise<AutoListenStatusResponse> {
    return await this.request<AutoListenStatusResponse>(
      "PUT",
      "/api/recording/auto-listen",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      },
      REQUEST_TIMEOUT_MS,
    );
  }

  /** Get status of always-listening Silero VAD. */
  async getAutoListenStatus(): Promise<AutoListenStatusResponse> {
    return await this.request<AutoListenStatusResponse>(
      "GET",
      "/api/recording/auto-listen/status",
      undefined,
      1000,
    );
  }

  /** Pop captured audio id and return listener to listening state. */
  async consumeAutoListen(): Promise<AutoListenConsumeResponse> {
    return await this.request<AutoListenConsumeResponse>(
      "POST",
      "/api/recording/auto-listen/consume",
      { method: "POST" },
      REQUEST_TIMEOUT_MS,
    );
  }

  /** Temporarily pause always-listening. */
  async pauseAutoListen(): Promise<void> {
    try {
      await this.request(
        "POST",
        "/api/recording/auto-listen/pause",
        { method: "POST" },
        REQUEST_TIMEOUT_MS,
      );
    } catch {
      // best-effort
    }
  }

  /** Resume always-listening. */
  async resumeAutoListen(): Promise<void> {
    try {
      await this.request(
        "POST",
        "/api/recording/auto-listen/resume",
        { method: "POST" },
        REQUEST_TIMEOUT_MS,
      );
    } catch {
      // best-effort
    }
  }
  async mapAnswers(questions: string[], transcript: string): Promise<MappedAnswersResponse> {
    return await this.request<MappedAnswersResponse>(
      "POST",
      "/api/requirements/map-answers",
      {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions, transcript }),
      },
      REQUIREMENTS_TIMEOUT_MS,
    );
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
