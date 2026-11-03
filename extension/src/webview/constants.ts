/**
 * Shared constants, small types, and formatting helpers used across the
 * webview components. Split out of App.tsx during the Phase 0 refactor:
 * no values changed — only their location.
 */

export const PROVIDER_MODELS: Record<
  string,
  { label: string; models: { id: string; name: string }[]; needsKey: boolean; keyHint: string; keyUrl?: string }
> = {
  "google-ai-studio": {
    label: "Google AI Studio (Gemini)",
    models: [
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash (Recommended - Free, Fast)" },
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro (Deep Reasoning)" },
    ],
    needsKey: true,
    keyHint: "Get free key from aistudio.google.com",
    keyUrl: "https://aistudio.google.com/apikey",
  },
  "groq": {
    label: "Groq Cloud",
    models: [
      { id: "qwen-qwq-32b", name: "Qwen QwQ 32B (Very Fast, High Quality)" },
      { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B Versatile" },
      { id: "mixtral-8x7b-32768", name: "Mixtral 8x7B" },
    ],
    needsKey: true,
    keyHint: "Get free key from console.groq.com",
    keyUrl: "https://console.groq.com/keys",
  },
  "ollama": {
    label: "Ollama (Local)",
    models: [
      { id: "qwen3:14b", name: "Qwen 3 14B (Recommended)" },
      { id: "qwen3:8b", name: "Qwen 3 8B (Fast, Low VRAM)" },
      { id: "qwen3:32b", name: "Qwen 3 32B (Best Quality)" },
      { id: "llama3.3:latest", name: "Llama 3.3 70B" },
    ],
    needsKey: false,
    keyHint: "No API key needed (runs locally at 127.0.0.1:11434)",
  },
  "nvidia-nim": {
    label: "NVIDIA NIM",
    models: [
      { id: "nvidia/nemotron-3-ultra-550b-a55b", name: "Nemotron 3 Ultra 550B (Current)" },
      { id: "meta/llama-3.3-70b-instruct", name: "Llama 3.3 70B Instruct" },
    ],
    needsKey: true,
    keyHint: "Get key from build.nvidia.com",
    keyUrl: "https://build.nvidia.com",
  },
  "openai": {
    label: "OpenAI",
    models: [
      { id: "gpt-4.1-mini", name: "GPT-4.1 mini (Recommended)" },
      { id: "gpt-4.1", name: "GPT-4.1 (Flagship)" },
      { id: "gpt-4o", name: "GPT-4o" },
    ],
    needsKey: true,
    keyHint: "Get key from platform.openai.com",
    keyUrl: "https://platform.openai.com/api-keys",
  },
};

export const MAX_RECORDING_MS = 120_000;

export type BackendStatus = "connecting" | "online" | "offline";

export interface HistoryEntry {
  id: number;
  text: string;
  timestamp: string;
}

export interface UploadInfo {
  audioId: string;
  durationSeconds: number;
  sampleRate: number;
  channels: number;
  sizeBytes: number;
}

export interface TranscriptInfo {
  audioId: string;
  language?: string;
  text: string;
  segments: Array<{ start: number; end: number; text: string }>;
  durationSeconds: number;
  processingSeconds: number;
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Friendly relative time for the session-history list. */
export function formatSessionTime(ts: number): string {
  const diffMs = Date.now() - ts;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}
