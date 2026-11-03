import { useCallback, useEffect, useRef, useState } from "react";

import { RecorderCard, type RecorderState } from "./components/RecorderCard";
import { getVsCodeApi } from "./bridge";
import type {
  ClarificationInfo,
  FileDiff,
  FileNode,
  GenerationResult,
  HostToWebview,
  LlmConfigData,
  RelevantResult,
  RequirementResult,
  ScanResult,
  SessionMeta,
  SessionSnapshot,
  Snippet,
  TestRunResult,
} from "../types/messages";

const PROVIDER_MODELS: Record<string, { label: string; models: { id: string; name: string }[]; needsKey: boolean; keyHint: string; keyUrl?: string }> = {
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

const vscode = getVsCodeApi();

const MAX_RECORDING_MS = 120_000;

type BackendStatus = "connecting" | "online" | "offline";

interface HistoryEntry {
  id: number;
  text: string;
  timestamp: string;
}

interface UploadInfo {
  audioId: string;
  durationSeconds: number;
  sampleRate: number;
  channels: number;
  sizeBytes: number;
}

interface TranscriptInfo {
  audioId: string;
  language?: string;
  text: string;
  segments: Array<{ start: number; end: number; text: string }>;
  durationSeconds: number;
  processingSeconds: number;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Friendly relative time for the session-history list. */
function formatSessionTime(ts: number): string {
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

export function App() {
  const [status, setStatus] = useState<BackendStatus>("connecting");
  const [statusDetail, setStatusDetail] = useState("Contacting backend…");
  const [draft, setDraft] = useState("Hello Speak2Build");
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const [recorderState, setRecorderState] = useState<RecorderState>("idle");
  const [recorderError, setRecorderError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [lastUpload, setLastUpload] = useState<UploadInfo | null>(null);
  const [transcript, setTranscript] = useState<TranscriptInfo | null>(null);
  const [transcribingId, setTranscribingId] = useState<string | null>(null);

  const [requirement, setRequirement] = useState<RequirementResult | null>(null);
  const [requirementMeta, setRequirementMeta] = useState<{
    model: string;
    processingSeconds: number;
    repaired: boolean;
  } | null>(null);
  const [extractAnswers, setExtractAnswers] = useState<Record<string, string>>({});
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);

  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [relevantResult, setRelevantResult] = useState<RelevantResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [fetchingRelevant, setFetchingRelevant] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);

  const [generationResult, setGenerationResult] = useState<GenerationResult | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [applyingDiff, setApplyingDiff] = useState<string | null>(null);
  const [appliedDiffs, setAppliedDiffs] = useState<Set<string>>(new Set());
  const [applyError, setApplyError] = useState<{ diff: string; message: string } | null>(null);
  const applyingDiffRef = useRef<string | null>(null);
  const [revertingDiff, setRevertingDiff] = useState<string | null>(null);
  const [dismissedDiffs, setDismissedDiffs] = useState<Set<string>>(new Set());
  const [runningTests, setRunningTests] = useState(false);
  const [testRunResult, setTestRunResult] = useState<TestRunResult | null>(null);
  const [testFramework, setTestFramework] = useState<{ framework: string; name: string }>({
    framework: "auto",
    name: "pytest",
  });
  const revertingDiffRef = useRef<string | null>(null);
const generationResultRef = useRef<GenerationResult | null>(null);
  generationResultRef.current = generationResult;
  const appliedDiffsRef = useRef<Set<string>>(new Set());
  appliedDiffsRef.current = appliedDiffs;
  const testRunResultRef = useRef<TestRunResult | null>(null);
  testRunResultRef.current = testRunResult;
  const requirementRef = useRef<RequirementResult | null>(null);
  requirementRef.current = requirement;
  const relevantResultRef = useRef<RelevantResult | null>(null);
  relevantResultRef.current = relevantResult;

  // In-UI LLM Settings modal
  const [showSettings, setShowSettings] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string>("google-ai-studio");
  const [selectedModel, setSelectedModel] = useState<string>("gemini-2.5-flash");
  const [apiKeyInput, setApiKeyInput] = useState<string>("");
  const [configuredProviders, setConfiguredProviders] = useState<Record<string, boolean>>({});
  const [settingsSavedMsg, setSettingsSavedMsg] = useState<string | null>(null);
  const [testingConnection, setTestingConnection] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ valid: boolean; message: string; latencyMs: number } | null>(null);

  // Session persistence (Chat / History tabs; host keeps the durable copy).
  const [viewTab, setViewTab] = useState<"chat" | "history">("chat");
  const [activeSession, setActiveSession] = useState<SessionMeta | null>(null);
  const [sessionList, setSessionList] = useState<SessionMeta[]>([]);
  // Guards against an echo loop: while a host snapshot is being applied,
  // the autosave effect must not immediately save it back.
  const restoringRef = useRef(false);

  // Voice output: spoken clarifications/summaries via the backend's speakers.
  const [voiceOn, setVoiceOn] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const speakingTimerRef = useRef<number | null>(null);

  // Voice-answers flow: idle → recording → processing → idle.
  const [answerFlow, setAnswerFlow] = useState<"idle" | "recording" | "processing">("idle");
  const answerFlowRef = useRef<"idle" | "recording" | "processing">("idle");
  const openQuestionsRef = useRef<string[]>([]);
  const setAnswerFlowBoth = useCallback(
    (next: "idle" | "recording" | "processing") => {
      answerFlowRef.current = next;
      setAnswerFlow(next);
    },
    [],
  );

  const pushHistory = useCallback((text: string) => {
    setHistory((items) => [
      { id: Date.now() + Math.random(), text, timestamp: new Date().toLocaleTimeString() },
      ...items.slice(0, 19),
    ]);
  }, []);

  /** Read text aloud through the backend's speakers (no-op when muted). */
  const speakText = useCallback((text: string) => {
    if (!voiceOn || !text.trim()) {
      return;
    }
    setSpeaking(true);
    vscode.postMessage({ type: "speak", text: text.slice(0, 1900) });
  }, [voiceOn]);

  const stopVoiceNow = useCallback(() => {
    if (speakingTimerRef.current !== null) {
      window.clearTimeout(speakingTimerRef.current);
      speakingTimerRef.current = null;
    }
    vscode.postMessage({ type: "stopSpeaking" });
    setSpeaking(false);
  }, []);

  const armSpeakingTimer = useCallback((seconds: number) => {
    if (speakingTimerRef.current !== null) {
      window.clearTimeout(speakingTimerRef.current);
    }
    speakingTimerRef.current = window.setTimeout(() => {
      setSpeaking(false);
    }, seconds * 1000 + 2000);
  }, []);

  const stopRecording = useCallback(() => {
    setRecorderState("stopping");
    vscode.postMessage({ type: "stopRecording" });
  }, []);

  // Listen for everything the extension host sends back.
  useEffect(() => {
    const handler = (event: MessageEvent<HostToWebview>) => {
      const message = event.data;
      switch (message.type) {
        case "health": {
          if (message.ok) {
            setStatus("online");
            setStatusDetail(
              `Backend online (v${message.version ?? "?"})` +
                (message.transcription ? ` · STT: ${message.transcription}` : ""),
            );
          } else {
            setStatus("offline");
            setStatusDetail(message.error ?? "Backend is not reachable.");
          }
          break;
        }
        case "pingResult": {
          pushHistory(`Round-trip OK — backend echoed: "${message.reply}"`);
          break;
        }
        case "recordingStarted": {
          setRecorderState("recording");
          setElapsedMs(0);
          setRecorderError(null);
          pushHistory(
            `Recording… (${message.sampleRate} Hz, ${message.channels} ch, backend-owned mic)`,
          );
          break;
        }
        case "bargeInTriggered": {
          setRecorderState("recording");
          setElapsedMs(0);
          setRecorderError(null);
          setSpeaking(false);
          if (speakingTimerRef.current !== null) {
            window.clearTimeout(speakingTimerRef.current);
            speakingTimerRef.current = null;
          }
          pushHistory("🎙️ Voice barge-in detected! Interrupted AI playback and recording your speech...");
          break;
        }
        case "audioUploaded": {
          // The dedicated voice-answers recording must NOT clobber the main
          // transcript flow — route it into the answer state machine instead.
          if (answerFlowRef.current === "recording") {
            setAnswerFlowBoth("processing");
            pushHistory(
              `Answers recorded (${message.durationSeconds.toFixed(1)}s) — transcribing…`,
            );
            vscode.postMessage({ type: "transcribeAnswer", audioId: message.audioId });
            break;
          }
          setRecorderState("idle");
          setLastUpload({
            audioId: message.audioId,
            durationSeconds: message.durationSeconds,
            sampleRate: message.sampleRate,
            channels: message.channels,
            sizeBytes: message.sizeBytes,
          });
          // A fresh recording invalidates any previous transcript.
          setTranscript((current) =>
            current && current.audioId === message.audioId ? current : null,
          );
          pushHistory(
            `Recording stored: ${message.durationSeconds.toFixed(1)}s @ ${message.sampleRate} Hz, ` +
              `${(message.sizeBytes / 1024).toFixed(0)} KB (id ${message.audioId.slice(0, 8)}…)`,
          );
          break;
        }
        case "transcription": {
          setTranscribingId(null);
          setTranscript({
            audioId: message.audioId,
            language: message.language,
            text: message.text,
            segments: message.segments,
            durationSeconds: message.durationSeconds,
            processingSeconds: message.processingSeconds,
          });
          const preview = message.text.length > 80 ? `${message.text.slice(0, 80)}…` : message.text;
          pushHistory(
            `Transcribed in ${message.processingSeconds.toFixed(1)}s` +
              (message.language ? ` [${message.language}]` : "") + `: "${preview}"`,
          );
          break;
        }
        case "recordingCancelled": {
          setRecorderState("idle");
          pushHistory("Recording cancelled — nothing stored.");
          break;
        }
        case "requirements": {
          setExtracting(false);
          setExtractError(null);
          setRequirement(message.requirement);
          setRequirementMeta({
            model: message.model,
            processingSeconds: message.processingSeconds,
            repaired: message.repaired,
          });
          const asked = message.requirement.clarifications.filter(
            (item) => !item.answer,
          ).length;
          pushHistory(
            `Requirements extracted (${message.model}` +
              (message.repaired ? ", repaired" : "") + `) in ` +
              `${message.processingSeconds.toFixed(1)}s · ` +
              (asked > 0 ? `${asked} clarification question(s)` : "no open questions"),
          );
          // Read the questions aloud when voice is enabled — the user answers
          // by ear, though the text also stays visible below.
          if (asked > 0) {
            const questions = message.requirement.clarifications
              .filter((item) => !item.answer)
              .map((item, i) => `Question ${i + 1}. ${item.question}`)
              .join(" ");
            const speech =
              asked === 1
                ? `Before I write any code, one question. ${questions}`
                : `Before I write any code, ${asked} questions. ${questions}`;
            speakText(speech);
          }
          break;
        }
        case "hostError": {
          // If a recorder or transcription operation was in flight, return
          // the affected flow to idle and show the reason where it happened.
          setRecorderState((current) => (current !== "idle" ? "idle" : current));
          setTranscribingId(null);
          setExtracting(false);
          setExtractError(message.message);
          setScanning(false);
          setFetchingRelevant(false);
          setGenerating(false);
          setGenerationError(message.message);
          setContextError(message.message);
          setRecorderError((prevRecorderError) => message.message);
          setSpeaking(false);
          // Abort any in-flight voice-answers run.
          if (answerFlowRef.current !== "idle") {
            openQuestionsRef.current = [];
            setAnswerFlowBoth("idle");
          }
          pushHistory(`Error: ${message.message}`);
          break;
        }
        case "contextScan": {
          setScanning(false);
          setContextError(null);
          setScanResult(message.result);
          setSelectedFiles(new Set());
          setRelevantResult(null);
          const langs = message.result.languages || [];
          if (!langs.includes("python") && (langs.includes("typescript") || langs.includes("javascript"))) {
            setTestFramework({ framework: "npm", name: "npm test" });
          } else if (langs.includes("rust")) {
            setTestFramework({ framework: "cargo", name: "cargo test" });
          } else if (langs.includes("go")) {
            setTestFramework({ framework: "go", name: "go test" });
          }
          pushHistory(`Workspace scanned: ${message.result.languages.join(", ")} · ${message.result.scannedFiles} files`);
          break;
        }
        case "testFrameworkDetected": {
          setTestFramework({ framework: message.framework, name: message.name });
          break;
        }
        case "contextRelevant": {
          setFetchingRelevant(false);
          setContextError(null);
          setRelevantResult(message.result);
          pushHistory(
            `Context gathered: ${message.result.snippets.length} snippets · ${message.result.totalChars} chars` +
              (message.result.truncated ? " (truncated)" : ""),
          );
          break;
        }
        case "generationResult": {
          setGenerating(false);
          setGenerationError(null);
          setGenerationResult(message.result);
          // The spoken variant says just the summary; never read diffs aloud.
          if (message.result.summary) {
            speakText(message.result.summary);
          }
          pushHistory(
            `Code generated: ${message.result.diffs.length} file(s) · ${message.result.model} · ${message.result.processingSeconds.toFixed(1)}s` +
              (message.result.validated ? " ✓ validated" : " ⚠ validation issues") +
              (message.result.testsPassed ? " ✓ tests passed" : "") +
              (message.result.testErrors && message.result.testErrors.length > 0 ? " ⚠ test failures" : "") +
              (message.result.validationErrors.length > 0 ? `: ${message.result.validationErrors.join("; ")}` : ""),
          );
          break;
        }
        case "diffApplied": {
          const currentDiff = applyingDiffRef.current;
          setApplyingDiff(null);
          if (message.success) {
            if (currentDiff) {
              setAppliedDiffs((prev) => new Set(prev).add(currentDiff));
            }
            setApplyError(null);
            pushHistory(`Diff applied: ${message.affectedFiles.join(", ")}`);
          } else {
            setApplyError(
              currentDiff
                ? { diff: currentDiff, message: message.message }
                : { diff: "", message: message.message }
            );
            pushHistory(`Diff apply failed: ${message.message}`);
          }
          break;
        }
        case "diffReverted": {
          const target = revertingDiffRef.current;
          setRevertingDiff(null);
          if (message.success) {
            if (target) {
              setAppliedDiffs((prev) => {
                const next = new Set(prev);
                next.delete(target);
                return next;
              });
            }
            pushHistory(`Diff reverted: ${message.affectedFiles.join(", ")}`);
          } else {
            pushHistory(`Diff revert failed: ${message.message}`);
          }
          break;
        }
case "voiceCommandExecuted": {
          pushHistory(`🎙️ Voice Command: ${message.action} ("${message.feedbackSpeech}")`);
          if (message.action === "apply") {
            const gen = generationResultRef.current;
            const applied = appliedDiffsRef.current;
            if (gen && gen.diffs) {
              const pending = gen.diffs.filter((d) => !applied.has(d.unifiedDiff));
              for (const diff of pending) {
                applyDiffRef.current(diff.unifiedDiff);
              }
            }
          } else if (message.action === "revert") {
            const gen = generationResultRef.current;
            const applied = appliedDiffsRef.current;
            if (gen && gen.diffs) {
              const toRevert = gen.diffs.filter((d) => applied.has(d.unifiedDiff));
              for (const diff of toRevert) {
                revertDiffRef.current(diff.unifiedDiff);
              }
            }
          } else if (message.action === "run_tests") {
            runWorkspaceTestsRef.current();
          } else if (message.action === "repair") {
            triggerAutoRepairRef.current();
          } else if (message.action === "new_session") {
            createNewSessionRef.current();
          }
          break;
        }
        case "testRunResult": {
          setRunningTests(false);
          setTestRunResult(message.result);
          if (message.result.framework) {
            setTestFramework((prev) => ({ ...prev, name: message.result.framework || prev.name }));
          }
          pushHistory(`Tests: ${message.result.summary}`);
          if (message.result.total > 0) {
            speakText(
              message.result.success
                ? `All good. ${message.result.summary}`
                : `Tests did not pass. ${message.result.summary}. Say fix it or click auto repair.`,
            );
          }
          break;
        }
        case "llmConfigResult": {
          if (message.config.provider && PROVIDER_MODELS[message.config.provider]) {
            setSelectedProvider(message.config.provider);
          }
          if (message.config.model) {
            setSelectedModel(message.config.model);
          }
          if (message.config.configuredProviders) {
            setConfiguredProviders(message.config.configuredProviders);
          }
          break;
        }
        case "llmConfigSaved": {
          setSettingsSavedMsg(`Saved! Using ${message.model}`);
          pushHistory(`LLM changed: ${message.provider} / ${message.model}`);
          setTimeout(() => {
            setSettingsSavedMsg(null);
            setShowSettings(false);
          }, 1500);
          break;
        }
        case "llmTestResult": {
          setTestingConnection(false);
          setTestResult({
            valid: message.valid,
            message: message.message,
            latencyMs: message.latencyMs,
          });
          break;
        }
        case "answersMapped": {
          const merged: Record<string, string> = {};
          for (const { question, answer } of message.answers) {
            if (answer.trim().length > 0) {
              merged[question] = answer.trim();
            }
          }
          setExtractAnswers((current) => ({ ...current, ...merged }));
          openQuestionsRef.current = [];
          setAnswerFlowBoth("idle");
          pushHistory(
            `Voice answers mapped (${message.model}): ` +
              `${Object.keys(merged).length} of ${message.answers.length} answered — re-extracting…`,
          );
          void extractRequirementsRef.current?.(merged);
          break;
        }
        case "answerTranscript": {
          const text = message.text.trim();
          const questions = openQuestionsRef.current;
          if (!text || questions.length === 0) {
            openQuestionsRef.current = [];
            setAnswerFlowBoth("idle");
            setRecorderError("No speech detected — start again and speak your answers.");
            pushHistory("Voice answers: nothing speakable found.");
            break;
          }
          pushHistory(
            `Answers captured: "${text.length > 80 ? `${text.slice(0, 80)}…` : text}" — mapping to questions…`,
          );
          vscode.postMessage({ type: "mapAnswers", questions, transcript: text });
          break;
        }
        case "speakingStarted": {
          setSpeaking(true);
          armSpeakingTimer(message.estimatedSeconds);
          break;
        }
        case "speakingStopped": {
          setSpeaking(false);
          if (speakingTimerRef.current !== null) {
            window.clearTimeout(speakingTimerRef.current);
            speakingTimerRef.current = null;
          }
          break;
        }
        case "sessionState": {
          setActiveSession(message.session);
          setSessionList(message.sessions);
          applySnapshot(message.snapshot);
          setViewTab("chat");
          break;
        }
        case "sessionList": {
          setSessionList(message.sessions);
          break;
        }
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [pushHistory, speakText, armSpeakingTimer, setAnswerFlowBoth]);

  // Ask the host to check backend health once on mount, and load current LLM config.
  useEffect(() => {
    vscode.postMessage({ type: "checkHealth" });
    vscode.postMessage({ type: "getLlmConfig" });
    // Restore the active session when the webview has been rebuilt.
    vscode.postMessage({ type: "loadSessionState" });
    vscode.postMessage({ type: "detectTestFramework" });
  }, []);

  // Re-apply a host-provided snapshot into the UI. Used after fresh boot,
  // session open, new session, and delete.
  const applySnapshot = useCallback((snap: SessionSnapshot) => {
    restoringRef.current = true;
    setLastUpload(snap.lastUpload);
    setTranscript(snap.transcript);
    setRequirement(snap.requirement);
    setRequirementMeta(snap.requirementMeta);
    setExtractAnswers(snap.extractAnswers ?? {});
    setScanResult(snap.scanResult);
    setSelectedFiles(new Set(snap.selectedFiles ?? []));
    setRelevantResult(snap.relevantResult);
    setGenerationResult(snap.generationResult);
    setAppliedDiffs(new Set(snap.appliedDiffs ?? []));
    setDismissedDiffs(new Set(snap.dismissedDiffs ?? []));
    setTestRunResult(snap.testRunResult);
    if (snap.testRunResult?.framework) {
      const fw = snap.testRunResult.framework.toLowerCase();
      let fwId = "npm";
      if (fw.includes("pytest") || fw.includes("python")) fwId = "pytest";
      else if (fw.includes("cargo") || fw.includes("rust")) fwId = "cargo";
      else if (fw.includes("go")) fwId = "go";
      else if (fw.includes("jest")) fwId = "jest";
      else if (fw.includes("vitest")) fwId = "vitest";
      else if (fw.includes("node")) fwId = "node";
      setTestFramework({ framework: fwId, name: snap.testRunResult.framework });
    } else if (snap.scanResult?.languages) {
      const langs = snap.scanResult.languages;
      if (!langs.includes("python") && (langs.includes("typescript") || langs.includes("javascript"))) {
        setTestFramework({ framework: "npm", name: "npm test" });
      } else if (langs.includes("rust")) {
        setTestFramework({ framework: "cargo", name: "cargo test" });
      } else if (langs.includes("go")) {
        setTestFramework({ framework: "go", name: "go test" });
      }
    }
    setHistory(snap.history ?? []);
    // Release the save-guard once the batched renders + effects have flushed.
    window.setTimeout(() => {
      restoringRef.current = false;
    }, 50);
  }, []);

  // Autosave: push meaningful state to the host (debounced) whenever it
  // changes. Spinners, transient errors, and health status are excluded.
  useEffect(() => {
    if (restoringRef.current) {
      return;
    }
    const timer = window.setTimeout(() => {
      const snapshot: SessionSnapshot = {
        version: 1,
        lastUpload,
        transcript,
        requirement,
        requirementMeta,
        extractAnswers,
        scanResult,
        selectedFiles: Array.from(selectedFiles),
        relevantResult,
        generationResult,
        appliedDiffs: Array.from(appliedDiffs),
        dismissedDiffs: Array.from(dismissedDiffs),
        testRunResult,
        history,
      };
      vscode.postMessage({ type: "saveSessionState", snapshot });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [
    lastUpload,
    transcript,
    requirement,
    requirementMeta,
    extractAnswers,
    scanResult,
    selectedFiles,
    relevantResult,
    generationResult,
    appliedDiffs,
    dismissedDiffs,
    testRunResult,
    history,
  ]);

  // Elapsed-time display while the backend owns the mic.
  useEffect(() => {
    if (recorderState !== "recording") {
      return;
    }
    const timer = window.setInterval(() => {
      setElapsedMs((ms) => ms + 100);
    }, 100);
    return () => window.clearInterval(timer);
  }, [recorderState]);

  // Backend enforces the same cap; the UI also stops at 120 s.
  useEffect(() => {
    if (recorderState === "recording" && elapsedMs >= MAX_RECORDING_MS) {
      stopRecording();
    }
  }, [recorderState, elapsedMs, stopRecording]);

  const startRecording = useCallback(() => {
    setRecorderError(null);
    setRecorderState("starting");
    vscode.postMessage({ type: "startRecording" });
  }, []);

  const cancelRecording = useCallback(() => {
    setRecorderState("stopping");
    vscode.postMessage({ type: "cancelRecording" });
  }, []);

  const startTranscription = useCallback((audioId: string) => {
    setTranscribingId(audioId);
    vscode.postMessage({ type: "transcribe", audioId });
  }, []);

  const extractRequirements = useCallback(
    (answers?: Record<string, string>) => {
      if (transcript === null || transcript.text.trim().length < 3) {
        return;
      }
      setExtracting(true);
      setExtractError(null);
      const snippets = relevantResult?.snippets;
      vscode.postMessage({
        type: "extractRequirements",
        transcript: transcript.text,
        ...(answers && Object.keys(answers).length > 0 ? { answers } : {}),
        ...(snippets && snippets.length > 0 ? { contextSnippets: snippets } : {}),
      });
    },
    [transcript, relevantResult],
  );

  const updateAnswer = useCallback((question: string, value: string) => {
    setExtractAnswers((current) => ({ ...current, [question]: value }));
  }, []);

  // Stable access to the latest extractRequirements from the message handler
  // (which must not re-register on every state change).
  const extractRequirementsRef = useRef(extractRequirements);
  useEffect(() => {
    extractRequirementsRef.current = extractRequirements;
  }, [extractRequirements]);

  const scanWorkspace = useCallback(() => {
    vscode.postMessage({ type: "scanContext", workspaceRoot: "${workspaceFolder}" });
    setScanning(true);
    setContextError(null);
  }, []);

  // Auto-scan workspace when backend is online and scan has not run yet.
  useEffect(() => {
    if (status === "online" && !scanResult && !scanning) {
      scanWorkspace();
    }
  }, [status, scanResult, scanning, scanWorkspace]);

  const toggleFileSelection = useCallback((path: string) => {
    setSelectedFiles((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const collectFilePaths = useCallback((node: FileNode, acc: string[] = []): string[] => {
    if (!node.isDir) {
      acc.push(node.path);
    } else {
      node.children?.forEach((child) => collectFilePaths(child, acc));
    }
    return acc;
  }, []);

  const fetchRelevantContext = useCallback(() => {
    if (selectedFiles.size === 0) return;
    setFetchingRelevant(true);
    setContextError(null);
    const reqText = requirement?.task ?? transcript?.text ?? "";
    vscode.postMessage({
      type: "getRelevantContext",
      requirementText: reqText,
      filePaths: Array.from(selectedFiles),
    });
  }, [requirement, transcript, selectedFiles]);

  const generateCode = useCallback(() => {
    if (!requirement) return;
    const reqText = transcript?.text ?? requirement.task;
    if (reqText.trim().length < 3) return;
    setGenerating(true);
    setGenerationError(null);
    vscode.postMessage({
      type: "generateCode",
      requirementText: reqText,
      contextSnippets: relevantResult?.snippets ?? [],
      options: { include_tests: true },
    });
  }, [transcript, requirement, relevantResult]);

  const applyDiff = useCallback((unifiedDiff: string) => {
    // The host will resolve the workspace root from VS Code workspace folders
    applyingDiffRef.current = unifiedDiff;
    setApplyingDiff(unifiedDiff);
    setApplyError(null);
    vscode.postMessage({
      type: "applyDiff",
      unifiedDiff,
      workspaceRoot: "",
    });
  }, []);

  const revertDiff = useCallback((unifiedDiff: string) => {
    revertingDiffRef.current = unifiedDiff;
    setRevertingDiff(unifiedDiff);
    vscode.postMessage({
      type: "revertDiff",
      unifiedDiff,
      workspaceRoot: "",
    });
  }, []);

  const openDiffInEditor = useCallback((filePath: string, unifiedDiff: string, isNewFile: boolean) => {
    vscode.postMessage({
      type: "openDiffInEditor",
      filePath,
      unifiedDiff,
      isNewFile,
    });
  }, []);

  const dismissDiff = useCallback((unifiedDiff: string) => {
    setDismissedDiffs((prev) => new Set(prev).add(unifiedDiff));
    pushHistory("Diff rejected/dismissed");
  }, [pushHistory]);

  const openPastSession = useCallback((sessionId: string) => {
    vscode.postMessage({ type: "openSession", sessionId });
  }, []);

  const createNewSession = useCallback(() => {
    vscode.postMessage({ type: "newSession" });
  }, []);

  const removeSession = useCallback((sessionId: string) => {
    vscode.postMessage({ type: "deleteSession", sessionId });
  }, []);

  // Voice answers: record one take that covers all open questions, then map.
  const startVoiceAnswers = useCallback(
    (questions: string[]) => {
      if (status !== "online" || questions.length === 0) {
        return;
      }
      openQuestionsRef.current = questions;
      stopVoiceNow();
      setAnswerFlowBoth("recording");
      setRecorderError(null);
      vscode.postMessage({ type: "startRecording" });
    },
    [status, stopVoiceNow, setAnswerFlowBoth],
  );

  // Recording is still owned by the standard recorder messages; stopping it
  // produces audioUploaded, which the message handler routes into the answer
  // flow instead of the normal transcript flow.
  const finishVoiceAnswers = stopRecording;
const triggerAutoRepair = useCallback(() => {
    const lastResult = testRunResultRef.current;
    if (!lastResult || !lastResult.output) return;
    setGenerating(true);
    setGenerationError(null);
    pushHistory("Auto-repair started for failing tests…");
    speakText("Starting test auto repair.");
    const reqText = requirementRef.current
      ? JSON.stringify(requirementRef.current)
      : "Fix failing tests in workspace";
    const snippets = relevantResultRef.current?.snippets ?? [];
    vscode.postMessage({
      type: "repairCode",
      requirementText: reqText,
      failedTestOutput: lastResult.output,
      contextSnippets: snippets,
      framework: testFramework.framework !== "auto" ? testFramework.framework : undefined,
    });
  }, [testFramework.framework, speakText, pushHistory]);

  const runWorkspaceTestsRef = useRef<() => void>(() => {});
  const triggerAutoRepairRef = useRef<() => void>(() => {});
  const applyDiffRef = useRef<(diff: string) => void>(() => {});
  const revertDiffRef = useRef<(diff: string) => void>(() => {});
  const createNewSessionRef = useRef<() => void>(() => {});

  const runWorkspaceTests = useCallback(() => {
    setRunningTests(true);
    vscode.postMessage({
      type: "runWorkspaceTests",
      framework: testFramework.framework !== "auto" ? testFramework.framework : undefined,
    });
  }, [testFramework.framework]);

runWorkspaceTestsRef.current = runWorkspaceTests;
  triggerAutoRepairRef.current = triggerAutoRepair;
  applyDiffRef.current = applyDiff;
  revertDiffRef.current = revertDiff;
  createNewSessionRef.current = createNewSession;

    const sendPing = useCallback(() => {
    pushHistory(`Sending: "${draft}"`);
    vscode.postMessage({ type: "ping", message: draft });
  }, [draft, pushHistory]);

  // Render file tree with checkboxes
  const renderFileTree = useCallback((node: FileNode): React.ReactNode => {
    if (node.isDir) {
      return (
        <details key={node.path} className="file-tree-dir" open>
          <summary className="file-tree-summary">
            <span className="dir-name">📁 {node.name}</span>
          </summary>
          <div className="file-tree-children">
            {node.children?.map((child) => renderFileTree(child))}
          </div>
        </details>
      );
    }
    const isSelected = selectedFiles.has(node.path);
    return (
      <label key={node.path} className="file-tree-file">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => toggleFileSelection(node.path)}
        />
        <span className={`file-name ${node.language ? `lang-${node.language}` : ""}`}>
          📄 {node.name}
        </span>
      </label>
    );
  }, [selectedFiles, toggleFileSelection]);

  // Render snippets
  const renderSnippets = useCallback(() => {
    if (!relevantResult || relevantResult.snippets.length === 0) return null;
    return (
      <div className="snippets">
        <div className="sub-label">Relevant Snippets ({relevantResult.snippets.length})</div>
        {relevantResult.snippets.map((snippet: Snippet, index: number) => (
          <div key={index} className="snippet">
            <div className="snippet-header">
              <span className="snippet-path">{snippet.path}</span>
              {snippet.language && <span className="hint">({snippet.language})</span>}
              <span className="hint">lines {snippet.startLine}–{snippet.endLine}</span>
            </div>
            <pre className="snippet-content">{snippet.content}</pre>
          </div>
        ))}
        {relevantResult.truncated && (
          <p className="hint">⚠ Context truncated to fit budget ({relevantResult.totalChars} chars)</p>
        )}
      </div>
    );
  }, [relevantResult]);

  return (
    <main className="panel">
      <h1 className="title">Speak2Build</h1>
      <p className="subtitle">Speak → Transcribe → Understand → Build</p>

      <section className={`status status--${status}`}>
        <span className="status-dot" aria-hidden="true" />
        <div className="status-text">
          <strong>{status === "online" ? "Backend connected" : status === "offline" ? "Backend offline" : "Checking backend…"}</strong>
          <span>{statusDetail}</span>
        </div>
        <button
          className={`settings-gear-btn ${voiceOn ? "" : "muted"}`}
          onClick={() => {
            if (voiceOn && speaking) {
              stopVoiceNow();
            }
            setVoiceOn((prev) => !prev);
          }}
          title={voiceOn ? "Mute spoken responses" : "Enable spoken responses"}
        >
          {voiceOn ? "🔈" : "🔇"}
        </button>
        <button
          className={`settings-gear-btn ${showSettings ? "active" : ""}`}
          style={{ marginLeft: "auto" }}
          onClick={() => {
            setShowSettings((prev) => !prev);
            if (!showSettings) {
              vscode.postMessage({ type: "getLlmConfig" });
            }
          }}
          title="Configure LLM Provider & Model"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M9.1 4.4L8.6 2H7.4l-.5 2.4-.7.3-2-1.3-.9.8 1.3 2-.2.7-2.4.5v1.2l2.4.5.3.8-1.3 2 .8.8 2-1.3.8.3.4 2.3h1.2l.5-2.4.8-.3 2 1.3.8-.8-1.3-2 .3-.8 2.3-.4V7.4l-2.4-.5-.3-.7 1.3-2-.8-.9-2 1.3-.7-.2zm-1.1 5c-.8 0-1.5-.7-1.5-1.5s.7-1.5 1.5-1.5 1.5.7 1.5 1.5-.7 1.5-1.5 1.5z"/>
          </svg>
        </button>
      </section>

      {/* In-UI LLM Model & Provider Settings */}
      {showSettings && (
        <section className="settings-modal-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 600, fontSize: "12px" }}>🤖 LLM Provider & Model</span>
            <button
              onClick={() => setShowSettings(false)}
              style={{ background: "transparent", border: "none", cursor: "pointer", color: "inherit", opacity: 0.6 }}
            >
              ✕
            </button>
          </div>

          <div className="settings-field">
            <label htmlFor="llm-provider-select">Provider</label>
            <select
              id="llm-provider-select"
              className="settings-select"
              value={selectedProvider}
              onChange={(e) => {
                const prov = e.target.value;
                setSelectedProvider(prov);
                const models = PROVIDER_MODELS[prov]?.models;
                if (models && models.length > 0) {
                  setSelectedModel(models[0].id);
                }
              }}
            >
              {Object.entries(PROVIDER_MODELS).map(([key, info]) => (
                <option key={key} value={key}>
                  {info.label}
                </option>
              ))}
            </select>
          </div>

          <div className="settings-field">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label htmlFor="llm-model-input">Model Name</label>
              <span style={{ fontSize: "10px", opacity: 0.7 }}>e.g. gemini-2.5-flash, qwen-qwq-32b</span>
            </div>
            <input
              id="llm-model-input"
              type="text"
              className="settings-input"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              placeholder="Enter model name..."
            />
          </div>

          {PROVIDER_MODELS[selectedProvider]?.needsKey && (
            <div className="settings-field">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label htmlFor="llm-api-key-input">
                  API Key {configuredProviders[selectedProvider] && !apiKeyInput && (
                    <span style={{ color: "#4ade80", fontWeight: "normal" }}>(Key configured ✓)</span>
                  )}
                </label>
                {PROVIDER_MODELS[selectedProvider]?.keyUrl && (
                  <span style={{ fontSize: "10px", opacity: 0.8 }}>
                    {PROVIDER_MODELS[selectedProvider]?.keyHint}
                  </span>
                )}
              </div>
              <input
                id="llm-api-key-input"
                type="password"
                className="settings-input"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder={
                  configuredProviders[selectedProvider]
                    ? "•••••••••••••••• (Leave blank to keep existing)"
                    : "Paste your API key here (required)"
                }
              />
            </div>
          )}

          {!PROVIDER_MODELS[selectedProvider]?.needsKey && (
            <div style={{ fontSize: "11px", opacity: 0.75, background: "rgba(255,255,255,0.05)", padding: "6px 8px", borderRadius: "4px" }}>
              💡 {PROVIDER_MODELS[selectedProvider]?.keyHint}
            </div>
          )}

          {testResult && (
            <div
              style={{
                fontSize: "11px",
                padding: "6px 8px",
                borderRadius: "4px",
                background: testResult.valid ? "rgba(35, 134, 54, 0.15)" : "rgba(218, 54, 51, 0.15)",
                border: `1px solid ${testResult.valid ? "#238636" : "#da3633"}`,
                color: testResult.valid ? "#4ade80" : "#f87171",
              }}
            >
              {testResult.valid ? "✓ " : "✗ "}
              {testResult.message}
              {testResult.valid && testResult.latencyMs > 0 && ` (${testResult.latencyMs}ms)`}
            </div>
          )}

          {settingsSavedMsg && (
            <div style={{ color: "#4ade80", fontSize: "11px", textAlign: "center" }}>
              ✓ {settingsSavedMsg}
            </div>
          )}

          <div className="settings-actions">
            <button
              className="button secondary"
              style={{ padding: "4px 10px", fontSize: "11px" }}
              disabled={testingConnection}
              onClick={() => {
                setTestingConnection(true);
                setTestResult(null);
                vscode.postMessage({
                  type: "testLlmConfig",
                  provider: selectedProvider,
                  model: selectedModel.trim(),
                  apiKey: apiKeyInput.trim() || undefined,
                });
              }}
            >
              {testingConnection ? "Pinging…" : "🔌 Test Key"}
            </button>
            <button
              className="button secondary"
              style={{ padding: "4px 10px", fontSize: "11px" }}
              onClick={() => setShowSettings(false)}
            >
              Cancel
            </button>
            <button
              className="button"
              style={{ padding: "4px 12px", fontSize: "11px" }}
              disabled={
                !selectedModel.trim() ||
                (PROVIDER_MODELS[selectedProvider]?.needsKey &&
                  !configuredProviders[selectedProvider] &&
                  !apiKeyInput.trim())
              }
              title={
                PROVIDER_MODELS[selectedProvider]?.needsKey &&
                !configuredProviders[selectedProvider] &&
                !apiKeyInput.trim()
                  ? "Enter an API key before proceeding"
                  : "Save and apply this configuration"
              }
              onClick={() => {
                vscode.postMessage({
                  type: "updateLlmConfig",
                  provider: selectedProvider,
                  model: selectedModel.trim(),
                  apiKey: apiKeyInput.trim() || undefined,
                });
              }}
            >
              Apply & Save
            </button>
          </div>
        </section>
      )}

      {/* Session tabs: the working board vs. saved sessions */}
      <section className="tab-bar">
        <button
          className={`tab ${viewTab === "chat" ? "active" : ""}`}
          onClick={() => setViewTab("chat")}
        >
          💬 Chat
        </button>
        <button
          className={`tab ${viewTab === "history" ? "active" : ""}`}
          onClick={() => setViewTab("history")}
        >
          🕘 History{sessionList.length > 0 ? ` (${sessionList.length})` : ""}
        </button>
        <button className="tab new" onClick={createNewSession} title="Discard this board and start a new session">
          ＋ New
        </button>
      </section>

      {speaking && (
        <section className="speaking-bar">
          <span>🔊 Speaking…</span>
          <button className="button secondary" onClick={stopVoiceNow} title="Stop the audio immediately">
            ■ Stop voice
          </button>
        </section>
      )}

      {viewTab === "chat" ? (
        <>
      {/* 1. Project Context (Context-First Workflow) */}
      <section className="card">
        <div className="label">Project Context</div>
        {!scanResult ? (
          <div>
            <p className="hint">
              Select workspace files to provide code context before or after speaking.
            </p>
            <button
              className="button"
              onClick={scanWorkspace}
              disabled={status !== "online" || scanning}
            >
              {scanning ? "Scanning…" : "🔍 Scan workspace"}
            </button>
            {contextError && <p className="error-text">{contextError}</p>}
          </div>
        ) : (
          <div>
            <p className="hint">
              Detected: {scanResult.languages.join(", ") || "none"} · {scanResult.scannedFiles} files
            </p>
            <button
              className="button"
              onClick={scanWorkspace}
              disabled={status !== "online" || scanning}
            >
              {scanning ? "Scanning…" : "🔍 Re-scan workspace"}
            </button>
            {contextError && <p className="error-text">{contextError}</p>}

            <div className="file-tree">
              {renderFileTree(scanResult.fileTree)}
            </div>

            <div className="file-selection-summary">
              {selectedFiles.size > 0 && (
                <>
                  <p className="hint">{selectedFiles.size} file(s) selected</p>
                  <button
                    className="button"
                    onClick={fetchRelevantContext}
                    disabled={status !== "online" || fetchingRelevant}
                  >
                    {fetchingRelevant ? "Fetching snippets…" : "📥 Get relevant context"}
                  </button>
                </>
              )}
            </div>

            {renderSnippets()}

            {relevantResult && relevantResult.snippets.length > 0 && (
              <div
                className="context-ready-badge"
                style={{
                  marginTop: "8px",
                  padding: "6px 10px",
                  background: "rgba(34, 197, 94, 0.15)",
                  border: "1px solid rgba(34, 197, 94, 0.4)",
                  borderRadius: "4px",
                }}
              >
                <span style={{ color: "#4ade80", fontWeight: 600, fontSize: "12px" }}>
                  ✓ Context loaded ({relevantResult.snippets.length} snippet{relevantResult.snippets.length === 1 ? "" : "s"} ready for voice instructions)
                </span>
              </div>
            )}

            {relevantResult && relevantResult.snippets.length > 0 && requirement && (
              <button
                className="button"
                style={{ marginTop: "8px" }}
                onClick={() => extractRequirements(extractAnswers)}
                disabled={status !== "online" || extracting}
              >
                {extracting ? "Updating requirements…" : "🔄 Re-extract requirements with selected context"}
              </button>
            )}
          </div>
        )}
      </section>

      {/* 2. Voice Capture */}
      <RecorderCard
        state={recorderState}
        elapsedMs={elapsedMs}
        error={recorderError}
        disabled={status !== "online"}
        onToggle={recorderState === "recording" ? stopRecording : startRecording}
        onCancel={cancelRecording}
      />

      {/* 3. Last Recording */}
      {lastUpload && (
        <section className="card">
          <div className="label">Last recording received by backend</div>
          <p className="recording-meta">
            Duration {lastUpload.durationSeconds.toFixed(1)}s
            {" · "}{lastUpload.sampleRate} Hz
            {" · "}{lastUpload.channels} channel{lastUpload.channels === 1 ? "" : "s"}
            {" · "}{(lastUpload.sizeBytes / 1024).toFixed(0)} KB
          </p>
          <button
            className="button"
            onClick={() => startTranscription(lastUpload.audioId)}
            disabled={status !== "online" || transcribingId !== null}
          >
            {transcribingId === lastUpload.audioId
              ? "Transcribing… (first call may warm the model)"
              : "▶ Transcribe"}
          </button>
        </section>
      )}

      {/* 4. Transcript */}
      {transcript && (
        <section className="card">
          <div className="label">Transcript (editable)</div>
          {transcript.language && (
            <p className="hint">Detected language: {transcript.language}</p>
          )}
          <textarea
            className="textarea"
            rows={Math.min(10, Math.max(3, Math.ceil(transcript.text.length / 60) + 1))}
            value={transcript.text}
            onChange={(event) =>
              setTranscript((current) =>
                current === null ? current : { ...current, text: event.target.value },
              )
            }
            placeholder="Transcription will appear here…"
          />
          {transcript.segments.length > 1 && (
            <ul className="segments">
              {transcript.segments.map((segment, index) => (
                <li key={index}>
                  <span className="entry-time">
                    {formatTime(segment.start)}–{formatTime(segment.end)}
                  </span>{" "}
                  {segment.text}
                </li>
              ))}
            </ul>
          )}
          <p className="hint">
            {transcript.durationSeconds.toFixed(1)}s of audio processed in {transcript.processingSeconds.toFixed(1)}s.
            {relevantResult && relevantResult.snippets.length > 0
              ? ` Loaded context (${relevantResult.snippets.length} snippets) will guide requirement extraction.`
              : " Fix any misrecognized terms above."}
          </p>
          <button
            className="button"
            onClick={() => extractRequirements()}
            disabled={status !== "online" || extracting || transcript.text.trim().length < 3}
          >
            {extracting ? "Extracting requirements…" : "⚙ Extract requirements"}
          </button>
          {extractError && <p className="error-text">{extractError}</p>}
        </section>
      )}

      {/* 5. Requirements */}
      {requirement && (
        <section className="card">
          <div className="label">Requirements</div>
          {requirementMeta && (
            <p className="hint">
              {requirementMeta.model}
              {requirementMeta.repaired ? " · schema-repaired" : ""} ·{" "}
              {requirementMeta.processingSeconds.toFixed(1)}s
            </p>
          )}
          <p className="requirement-task">{requirement.task}</p>

          {(
            [
              ["Inputs", requirement.inputs],
              ["Outputs", requirement.outputs],
              ["Constraints", requirement.constraints],
              ["Acceptance criteria", requirement.acceptanceCriteria],
            ] as Array<[string, string[]]>
          ).map(
            ([title, items]) =>
              items.length > 0 && (
                <div key={title}>
                  <div className="sub-label">{title}</div>
                  <ul className="bullets">
                    {items.map((item, index) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>
                </div>
              ),
          )}

          {requirement.clarifications.length > 0 && (
            <div>
              <div className="sub-label">
                Clarifications ({requirement.clarifications.length})
              </div>
              {requirement.clarifications.map((item: ClarificationInfo, index) => (
                <div key={index} className="clarification">
                  <p className="clarification-question">
                    {item.question}
                    {item.reason && <span className="hint"> — {item.reason}</span>}
                  </p>
                  <input
                    className="input"
                    value={
                      extractAnswers[item.question] ?? item.answer ?? ""
                    }
                    onChange={(event) => updateAnswer(item.question, event.target.value)}
                    placeholder="Your answer…"
                  />
                </div>
              ))}
              <button
                className="button"
                onClick={() => extractRequirements(extractAnswers)}
                disabled={
                  status !== "online" ||
                  extracting ||
                  answerFlow !== "idle" ||
                  (Object.values(extractAnswers).every((a) => a.trim().length === 0) &&
                    (!relevantResult || relevantResult.snippets.length === 0))
                }
              >
                {extracting
                  ? "Extracting…"
                  : relevantResult && relevantResult.snippets.length > 0
                  ? "⚙ Re-extract with context & answers"
                  : "⚙ Re-extract with answers"}
              </button>
              <div className="voice-answers-flow">
                {answerFlow === "idle" &&
                  requirement.clarifications.some((item) => !item.answer) && (
                    <button
                      className="button secondary"
                      onClick={() =>
                        startVoiceAnswers(
                          requirement.clarifications
                            .filter((item) => !item.answer)
                            .map((item) => item.question),
                        )
                      }
                      title="Record one spoken take answering every open question"
                      disabled={status !== "online"}
                    >
                      🎤 Answer all by voice
                    </button>
                  )}
                {answerFlow === "recording" && (
                  <>
                    <p className="hint">
                      🎙 Recording — speak each answer in the order the questions were asked,
                      pause between them, then stop.
                    </p>
                    <button className="button" onClick={finishVoiceAnswers}>
                      ■ Stop &amp; process answers
                    </button>
                  </>
                )}
                {answerFlow === "processing" && (
                  <p className="hint">↻ Transcribing and mapping your spoken answers…</p>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {/* 6. Code Generation */}
      {requirement && (
        <section className="card">
          <div className="label">Code Generation</div>
          <p className="hint">
            {relevantResult && relevantResult.snippets.length > 0
              ? `Generate code from requirements + ${relevantResult.snippets.length} context snippet(s).`
              : "Generate code from requirements (select files in Project Context above for best accuracy)."}
          </p>
          <button
            className="button"
            onClick={generateCode}
            disabled={status !== "online" || generating}
          >
            {generating ? "Generating code…" : "⚡ Generate code"}
          </button>
          {generationError && <p className="error-text">{generationError}</p>}
        </section>
      )}

      {/* 7. Generated Diffs & Test Validation */}
      {generationResult && (
        <section className="card">
          <div className="label">
            Generated Diffs ({generationResult.diffs.length})
          </div>
          {generationResult.summary && (
            <p className="hint">{generationResult.summary}</p>
          )}
          <p className="hint">
            {generationResult.model} · {generationResult.processingSeconds.toFixed(1)}s
            {generationResult.validated ? " ✓ validated" : " ⚠ validation issues"}
            {generationResult.testsPassed && " ✓ tests passed"}
            {generationResult.testErrors && generationResult.testErrors.length > 0 && !generationResult.testsPassed && " ⚠ test failures"}
          </p>
          {generationResult.validationErrors.length > 0 && (
            <div className="validation-errors">
              <strong>Validation warnings:</strong>
              <ul>
                {generationResult.validationErrors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}
          {generationResult.testErrors && generationResult.testErrors.length > 0 && (
            <div className="validation-errors">
              <strong>Test failures:</strong>
              <ul>
                {generationResult.testErrors.map((err, i) => (
                  <li key={i}><pre style={{whiteSpace: 'pre-wrap', fontSize: '10px', margin: 0}}>{err}</pre></li>
                ))}
              </ul>
            </div>
          )}
          {generationResult.diffs
            .filter((d: FileDiff) => !dismissedDiffs.has(d.unifiedDiff))
            .map((diff: FileDiff, index: number) => {
              const isApplying = applyingDiff === diff.unifiedDiff;
              const isReverting = revertingDiff === diff.unifiedDiff;
              const isApplied = appliedDiffs.has(diff.unifiedDiff);
              const hasError = applyError?.diff === diff.unifiedDiff;
              return (
                <div key={index} className="diff-card">
                  <div className="diff-header">
                    <span className="diff-path">{diff.path}</span>
                    <span className="hint">({diff.language})</span>
                    {diff.isNewFile && <span className="badge new-file">New file</span>}
                    {isApplied && <span className="badge applied">✓ Applied</span>}
                  </div>
                  <pre className="diff-content">{diff.unifiedDiff}</pre>
                  <div className="diff-actions">
                    <button
                      className="button secondary"
                      onClick={() => openDiffInEditor(diff.path, diff.unifiedDiff, diff.isNewFile)}
                      title="Open side-by-side diff in VS Code editor"
                    >
                      🔍 View in Editor
                    </button>
                    {!isApplied ? (
                      <>
                        <button
                          className="button"
                          onClick={() => applyDiff(diff.unifiedDiff)}
                          disabled={status !== "online" || isApplying}
                        >
                          {isApplying ? "Applying…" : "✓ Apply"}
                        </button>
                        <button
                          className="button secondary"
                          onClick={() => dismissDiff(diff.unifiedDiff)}
                          title="Reject and dismiss this diff"
                        >
                          ✕ Reject
                        </button>
                      </>
                    ) : (
                      <button
                        className="button danger"
                        onClick={() => revertDiff(diff.unifiedDiff)}
                        disabled={status !== "online" || isReverting}
                      >
                        {isReverting ? "Reverting…" : "⎌ Revert"}
                      </button>
                    )}
                  </div>
                  {hasError && <p className="error-text">{applyError.message}</p>}
                </div>
              );
            })}

          <div className="test-validation-section">
            <div className="sub-label">Workspace Test Validation</div>
            <button
              className="button secondary"
              onClick={runWorkspaceTests}
              disabled={status !== "online" || runningTests}
            >
              {runningTests ? "Running tests…" : `🧪 Run Workspace Tests (${testFramework.name})`}
            </button>
            {testRunResult && (
              <div className={`test-result-box ${testRunResult.success ? "success" : "failed"}`}>
                <p style={{ margin: "0 0 4px 0" }}>
                  <strong>{testRunResult.success ? "✓ Tests Passed" : "✗ Tests Failed"}:</strong> {testRunResult.summary}
                </p>
                {!testRunResult.success && (
                  <button
                    className="button primary"
                    style={{ marginTop: 8, width: "100%" }}
                    onClick={triggerAutoRepair}
                    disabled={generating}
                  >
                    {generating ? "Auto-repairing with AI…" : "⚡ Auto-Repair with AI (or say \"fix it\")"}
                  </button>
                )}
                {testRunResult.output && (
                  <details style={{ marginTop: "4px" }}>
                    <summary style={{ cursor: "pointer", opacity: 0.8 }}>View test output log</summary>
                    <pre className="test-output-log">{testRunResult.output}</pre>
                  </details>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      <section className="card">
        <label className="label" htmlFor="ping-input">
          Connection check (Milestone 0)
        </label>
        <input
          id="ping-input"
          className="input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Type a short message…"
        />
        <button
          className="button"
          onClick={sendPing}
          disabled={status !== "online" || draft.trim().length === 0}
        >
          Send to backend
        </button>
      </section>

      <section className="history">
        <div className="label">Activity log</div>
        {history.length === 0 ? (
          <p className="empty">No activity yet.</p>
        ) : (
          <ul>
            {history.map((entry) => (
              <li key={entry.id}>
                <span className="entry-time">{entry.timestamp}</span> {entry.text}
              </li>
            ))}
          </ul>
        )}
      </section>
        </>
      ) : (
        <section className="card history-tab">
          <div className="label">🕘 Session history</div>
          <p className="hint">
            Sessions are saved automatically for this workspace — including transcripts,
            requirements, context, and generated diffs.
          </p>
          {activeSession && (
            <p className="hint session-active-hint">
              Active: <strong>{activeSession.title}</strong>
            </p>
          )}
          {sessionList.length === 0 ? (
            <p className="empty">No saved sessions yet.</p>
          ) : (
            <ul className="session-list">
              {sessionList.map((s) => (
                <li
                  key={s.id}
                  className={`session-row ${s.id === activeSession?.id ? "active" : ""}`}
                  onClick={() => openPastSession(s.id)}
                  title="Open this session and continue where you left off"
                >
                  <div className="session-text">
                    <span className="session-title">{s.title}</span>
                    <span className="session-meta">{formatSessionTime(s.updatedAt)}</span>
                  </div>
                  <button
                    className="session-delete"
                    title="Delete this session"
                    onClick={(event) => {
                      event.stopPropagation();
                      removeSession(s.id);
                    }}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}
