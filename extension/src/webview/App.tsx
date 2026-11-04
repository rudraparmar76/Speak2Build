import { useCallback, useEffect, useRef, useState } from "react";

import { HeaderBar } from "./components/HeaderBar";
import { ChatView } from "./components/ChatView";
import { ChatInput } from "./components/ChatInput";
import { SettingsSheet } from "./components/SettingsSheet";
import { usePipeline } from "./hooks/usePipeline";
import { getVsCodeApi } from "./bridge";
import {
  MAX_RECORDING_MS,
  PROVIDER_MODELS,
  type BackendStatus,
  type HistoryEntry,
  type UploadInfo,
  type TranscriptInfo,
  formatSessionTime,
} from "./constants";
import type { ChatMessage } from "./types/chat";
import type {
  FileDiff,
  GenerationResult,
  HostToWebview,
  LlmConfigData,
  RelevantResult,
  RequirementResult,
  ScanResult,
  SessionMeta,
  SessionSnapshot,
  TestRunResult,
} from "../types/messages";

const vscode = getVsCodeApi();

export function App() {
  const [status, setStatus] = useState<BackendStatus>("connecting");
  const [statusDetail, setStatusDetail] = useState("Contacting backend…");
  const [draft, setDraft] = useState("");
  const [, setHistory] = useState<HistoryEntry[]>([]);

  const [recorderState, setRecorderState] = useState<
    "idle" | "starting" | "recording" | "stopping"
  >("idle");
  const [recorderError, setRecorderError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [autoListen, setAutoListen] = useState(false);
  const [autoListenState, setAutoListenState] = useState<string>("disabled");

  const handleToggleAutoListen = useCallback(() => {
    if (autoListen) {
      vscode.postMessage({ type: "disableAutoListen" });
    } else {
      vscode.postMessage({ type: "enableAutoListen" });
    }
  }, [autoListen]);
  const [lastUpload, setLastUpload] = useState<UploadInfo | null>(null);
  const [transcript, setTranscript] = useState<TranscriptInfo | null>(null);

  const [requirement, setRequirement] = useState<RequirementResult | null>(null);
  const [requirementMeta, setRequirementMeta] = useState<{
    model: string;
    processingSeconds: number;
    repaired: boolean;
  } | null>(null);
  const [extractAnswers, setExtractAnswers] = useState<Record<string, string>>({});

  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [relevantResult, setRelevantResult] = useState<RelevantResult | null>(null);

  const [generationResult, setGenerationResult] = useState<GenerationResult | null>(null);
  const [applyingDiff, setApplyingDiff] = useState<string | null>(null);
  const [appliedDiffs, setAppliedDiffs] = useState<Set<string>>(new Set());
  const [applyError, setApplyError] = useState<{ diff: string; message: string } | null>(null);
  const applyingDiffRef = useRef<string | null>(null);
  const [revertingDiff, setRevertingDiff] = useState<string | null>(null);
  const [dismissedDiffs, setDismissedDiffs] = useState<Set<string>>(new Set());
  const [runningTests, setRunningTests] = useState(false);
  const [autoApply, setAutoApply] = useState(false);
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
  const [showHistory, setShowHistory] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string>("google-ai-studio");
  const [selectedModel, setSelectedModel] = useState<string>("gemini-2.5-flash");
  const [apiKeyInput, setApiKeyInput] = useState<string>("");
  const [configuredProviders, setConfiguredProviders] = useState<Record<string, boolean>>({});
  const [settingsSavedMsg, setSettingsSavedMsg] = useState<string | null>(null);
  const [testingConnection, setTestingConnection] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{
    valid: boolean;
    message: string;
    latencyMs: number;
  } | null>(null);

  // Session persistence
  const [activeSession, setActiveSession] = useState<SessionMeta | null>(null);
  const [sessionList, setSessionList] = useState<SessionMeta[]>([]);
  const restoringRef = useRef(false);

  // Voice output
  const [voiceOn, setVoiceOn] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const speakingTimerRef = useRef<number | null>(null);

  // Clarification answering mode: after the AI speaks the questions aloud,
  // auto-open the mic so the user can just talk (hands-free answers).
  const autoListenTimerRef = useRef<number | null>(null);
  const pendingListenRef = useRef(false);
  const recorderStateRef = useRef(recorderState);
  recorderStateRef.current = recorderState;

  const pushHistory = useCallback((text: string) => {
    setHistory((items) => [
      { id: Date.now() + Math.random(), text, timestamp: new Date().toLocaleTimeString() },
      ...items.slice(0, 19),
    ]);
  }, []);

  /** Read text aloud through backend speakers */
  const speakText = useCallback(
    (text: string) => {
      if (!voiceOn || !text.trim()) {
        return;
      }
      setSpeaking(true);
      vscode.postMessage({ type: "speak", text: text.slice(0, 1900) });
    },
    [voiceOn],
  );

  /** Speaks aloud and arms mic auto-open once playback ends. */
  const speakAndListen = useCallback(
    (text: string) => {
      pendingListenRef.current = true;
      speakText(text);
    },
    [speakText],
  );

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

  const startRecording = useCallback(() => {
    setRecorderError(null);
    setRecorderState("starting");
    vscode.postMessage({ type: "startRecording" });
  }, []);

  const cancelRecording = useCallback(() => {
    setRecorderState("stopping");
    vscode.postMessage({ type: "cancelRecording" });
  }, []);

  const applyDiff = useCallback((unifiedDiff: string) => {
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

  const openDiffInEditor = useCallback(
    (filePath: string, unifiedDiff: string, isNewFile: boolean) => {
      vscode.postMessage({
        type: "openDiffInEditor",
        filePath,
        unifiedDiff,
        isNewFile,
      });
    },
    [],
  );

  const dismissDiff = useCallback((unifiedDiff: string) => {
    setDismissedDiffs((prev) => new Set(prev).add(unifiedDiff));
  }, []);

  const applyAllDiffs = useCallback((diffs: string[]) => {
    vscode.postMessage({
      type: "applyAllDiffs",
      diffs,
    });
  }, []);

  const handleApplyAll = useCallback(
    (diffsToApply: FileDiff[]) => {
      applyAllDiffs(diffsToApply.map((d) => d.unifiedDiff));
    },
    [applyAllDiffs],
  );

  const runWorkspaceTests = useCallback(() => {
    setRunningTests(true);
    vscode.postMessage({
      type: "runWorkspaceTests",
      framework: testFramework.framework !== "auto" ? testFramework.framework : undefined,
    });
  }, [testFramework.framework]);

  const triggerAutoRepair = useCallback(() => {
    const lastResult = testRunResultRef.current;
    if (!lastResult || !lastResult.output) return;
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

  const createNewSession = useCallback(() => {
    setDraft("");
    vscode.postMessage({ type: "newSession" });
  }, []);

  // ── Auto-Pipeline Hook (Phase 2) ──────────────────────────
  const {
    messages,
    setMessages,
    isProcessing,
    clarification,
    awaitingVoiceAnswerRef,
    startPipeline,
    handleContextReceived,
    handleRequirementsReceived,
    handleVoiceAnswerTranscript,
    handleAnswersMapped,
    handleClarificationAnswersSubmitted,
    handleGenerationResult,
    handleTestResult,
    handlePipelineError,
    handleVoiceCommand,
  } = usePipeline({
    scanResult,
    selectedFiles,
    relevantSnippets: relevantResult?.snippets ?? [],
    voiceOn,
    speakText,
    speakAndListen,
    onAnswersUpdated: (answers) =>
      setExtractAnswers((prev) => ({ ...prev, ...answers })),
    postMessage: (msg) => vscode.postMessage(msg),
    pushHistory,
    applyDiff,
    applyAllDiffs,
    revertDiff,
    dismissDiff,
    runWorkspaceTests,
    triggerAutoRepair,
    createNewSession,
  });

  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // Send typed message
  const handleSendMessage = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    startPipeline(text, "text");
  }, [draft, startPipeline]);

  // Click suggestion chip
  const handleSuggestionClick = useCallback(
    (text: string) => {
      startPipeline(text, "text");
    },
    [startPipeline],
  );

  // Message dispatcher from extension host
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
        case "recordingStarted": {
          setRecorderState("recording");
          setElapsedMs(0);
          setRecorderError(null);
          pushHistory(`Recording… (${message.sampleRate} Hz, mic active)`);
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
          pushHistory("🎙️ Voice barge-in detected! Interrupted AI playback.");
          break;
        }
        case "toggleRecordingHotkey": {
          if (recorderState === "recording") {
            stopRecording();
          } else if (recorderState === "idle") {
            startRecording();
          }
          break;
        }
        case "audioUploaded": {
          setRecorderState("idle");
          setLastUpload({
            audioId: message.audioId,
            durationSeconds: message.durationSeconds,
            sampleRate: message.sampleRate,
            channels: message.channels,
            sizeBytes: message.sizeBytes,
          });

          // Auto-transcribe recording immediately
          vscode.postMessage({ type: "transcribe", audioId: message.audioId });
          break;
        }
        case "transcription": {
          setTranscript({
            audioId: message.audioId,
            language: message.language,
            text: message.text,
            segments: message.segments,
            durationSeconds: message.durationSeconds,
            processingSeconds: message.processingSeconds,
          });

          // If recognized as a voice command ("apply it", "run tests"), voiceCommandExecuted handles it
          if (message.isCommand) {
            break;
          }

          const trimmed = (message.text || "").trim();
          if (!trimmed) {
            break;
          }

          // Clarification answering mode: this recording is a spoken reply to
          // the open questions — map it onto them instead of starting a new
          // pipeline from scratch.
          if (awaitingVoiceAnswerRef.current) {
            handleVoiceAnswerTranscript(trimmed);
            break;
          }

          // Guard against running parallel pipelines if already in progress
          if (isProcessing) {
            console.warn("Pipeline already in progress, ignoring duplicate transcription:", trimmed);
            break;
          }

          // Otherwise, auto-run the hands-free pipeline with the transcribed request!
          startPipeline(trimmed, "voice");
          break;
        }
        case "recordingCancelled": {
          setRecorderState("idle");
          pushHistory("Recording cancelled.");
          break;
        }
        case "contextRelevant": {
          setRelevantResult(message.result);
          handleContextReceived(message.result.snippets);
          break;
        }
        case "answersMapped": {
          handleAnswersMapped(message.answers);
          break;
        }
        case "requirements": {
          setRequirement(message.requirement);
          setRequirementMeta({
            model: message.model,
            processingSeconds: message.processingSeconds,
            repaired: message.repaired,
          });

          handleRequirementsReceived(
            message.requirement,
            message.model,
            message.processingSeconds,
            message.repaired,
          );
          break;
        }
        case "generationResult": {
          setGenerationResult(message.result);
          handleGenerationResult(message.result);

          // Auto-apply mode: automatically apply diffs if valid
          if (autoApply && message.result.diffs.length > 0) {
            const hasNoErrors = (message.result.validationErrors?.length ?? 0) === 0;
            if (hasNoErrors) {
              const diffsToApply = message.result.diffs.map((d) => d.unifiedDiff);
              applyAllDiffs(diffsToApply);
              pushHistory(`⚡ Auto-applied ${diffsToApply.length} diff(s).`);
            }
          }
          break;
        }
        case "diffApplied": {
          const appliedTarget = message.unifiedDiff || applyingDiffRef.current;
          setApplyingDiff(null);
          if (message.success) {
            if (appliedTarget) {
              setAppliedDiffs((prev) => new Set(prev).add(appliedTarget));
            }
            setApplyError(null);
            pushHistory(`Applied: ${message.affectedFiles.join(", ")}`);
          } else {
            setApplyError(
              appliedTarget
                ? { diff: appliedTarget, message: message.message }
                : { diff: "", message: message.message },
            );
          }
          break;
        }
        case "diffReverted": {
          const target = message.unifiedDiff || revertingDiffRef.current;
          setRevertingDiff(null);
          if (message.success) {
            if (target) {
              setAppliedDiffs((prev) => {
                const next = new Set(prev);
                next.delete(target);
                return next;
              });
            }
            pushHistory(`Reverted: ${message.affectedFiles.join(", ")}`);
          }
          break;
        }
        case "voiceCommandExecuted": {
          if (message.action === "auto_apply_on") {
            setAutoApply(true);
            pushHistory("⚡ Auto-apply mode enabled.");
            break;
          } else if (message.action === "auto_apply_off") {
            setAutoApply(false);
            pushHistory("⚡ Auto-apply mode disabled.");
            break;
          }
          let diffs = generationResultRef.current?.diffs ?? [];
          if (diffs.length === 0) {
            diffs = messagesRef.current.flatMap((m) => m.diffs ?? []);
          }
          handleVoiceCommand(message.action, message.feedbackSpeech, diffs, appliedDiffsRef.current);
          break;
        }
        case "testRunResult": {
          setRunningTests(false);
          setTestRunResult(message.result);
          if (message.result.framework) {
            setTestFramework((prev) => ({ ...prev, name: message.result.framework || prev.name }));
          }
          handleTestResult(message.result);
          if (message.result.total > 0) {
            speakText(
              message.result.success
                ? `All tests passed. ${message.result.summary}`
                : `Tests did not pass. ${message.result.summary}. Say fix it or click auto repair.`,
            );
          }
          break;
        }
        case "contextScan": {
          setScanResult(message.result);
          const langs = message.result.languages || [];
          if (!langs.includes("python") && (langs.includes("typescript") || langs.includes("javascript"))) {
            setTestFramework({ framework: "npm", name: "npm test" });
          } else if (langs.includes("rust")) {
            setTestFramework({ framework: "cargo", name: "cargo test" });
          } else if (langs.includes("go")) {
            setTestFramework({ framework: "go", name: "go test" });
          }
          break;
        }
        case "testFrameworkDetected": {
          setTestFramework({ framework: message.framework, name: message.name });
          break;
        }
        case "hostError": {
          setRecorderState("idle");
          setRecorderError(message.message);
          setSpeaking(false);
          handlePipelineError(message.message);
          break;
        }
        case "speakingStarted": {
          setSpeaking(true);
          armSpeakingTimer(message.estimatedSeconds);

          // Clarification answering mode: only in push-to-talk mode do we need to
          // open the mic automatically. In Always-Listening mode, Silero VAD is
          // already running and will auto-detect speech once TTS finishes!
          if (pendingListenRef.current) {
            pendingListenRef.current = false;
            if (!autoListen) {
              if (autoListenTimerRef.current !== null) {
                window.clearTimeout(autoListenTimerRef.current);
              }
              autoListenTimerRef.current = window.setTimeout(() => {
                autoListenTimerRef.current = null;
                if (!awaitingVoiceAnswerRef.current) return;
                if (recorderStateRef.current !== "idle") return;
                vscode.postMessage({ type: "startRecording" });
              }, message.estimatedSeconds * 1000 + 1200);
            }
          }
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
          setShowHistory(false);
          break;
        }
        case "sessionList": {
          setSessionList(message.sessions);
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
          setTimeout(() => {
            setSettingsSavedMsg(null);
            setShowSettings(false);
          }, 1200);
          break;
        }
        case "autoListenState": {
          setAutoListen(message.enabled);
          setAutoListenState(message.state);
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
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [
    pushHistory,
    speakText,
    armSpeakingTimer,
    startPipeline,
    handleContextReceived,
    handleRequirementsReceived,
    handleVoiceAnswerTranscript,
    handleAnswersMapped,
    handleGenerationResult,
    handleVoiceCommand,
    handleTestResult,
    handlePipelineError,
  ]);

  // In-webview keyboard shortcut (Ctrl+Alt+Space)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.altKey && (e.code === "Space" || e.key === " ")) {
        e.preventDefault();
        if (recorderState === "recording") {
          stopRecording();
        } else if (recorderState === "idle") {
          startRecording();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [recorderState, startRecording, stopRecording]);

  // Initial mount health check & active session restore
  useEffect(() => {
    vscode.postMessage({ type: "checkHealth" });
    vscode.postMessage({ type: "getLlmConfig" });
    vscode.postMessage({ type: "loadSessionState" });
    vscode.postMessage({ type: "detectTestFramework" });
    vscode.postMessage({ type: "scanContext", workspaceRoot: "${workspaceFolder}" });
    vscode.postMessage({ type: "getAutoListenStatus" });
  }, []);

  // Restore snapshot from host
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
    setHistory(snap.history ?? []);

    // Restore full chat message history
    if (snap.messages && snap.messages.length > 0) {
      setMessages(snap.messages);
    } else {
      // Fallback for old snapshots without messages array
      const initialMsgs: ChatMessage[] = [];
      if (snap.transcript?.text) {
        initialMsgs.push({
          id: "restored_user",
          role: "user",
          content: snap.transcript.text,
          source: "voice",
          status: "done",
          timestamp: Date.now() - 60000,
        });
      }
      if (snap.generationResult || snap.requirement) {
        initialMsgs.push({
          id: "restored_asst",
          role: "assistant",
          content: snap.generationResult?.summary || snap.requirement?.task || "",
          diffs: snap.generationResult?.diffs,
          summary: snap.generationResult?.summary,
          model: snap.generationResult?.model,
          processingSeconds: snap.generationResult?.processingSeconds,
          validated: snap.generationResult?.validated,
          validationErrors: snap.generationResult?.validationErrors,
          testErrors: snap.generationResult?.testErrors,
          testsPassed: snap.generationResult?.testsPassed,
          testRunResult: snap.testRunResult ?? undefined,
          clarifications: snap.requirement?.clarifications,
          status: "done",
          timestamp: Date.now() - 30000,
        });
      }
      setMessages(initialMsgs);
    }

    window.setTimeout(() => {
      restoringRef.current = false;
    }, 50);
  }, [setMessages]);

  // Autosave session state to host
  useEffect(() => {
    if (restoringRef.current) return;
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
        history: [],
        messages,
      };
      vscode.postMessage({ type: "saveSessionState", snapshot });
    }, 500);
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
    messages,
  ]);

  // Elapsed recording timer
  useEffect(() => {
    if (recorderState !== "recording") return;
    const timer = window.setInterval(() => {
      setElapsedMs((ms) => ms + 100);
    }, 100);
    return () => window.clearInterval(timer);
  }, [recorderState]);

  // Cap recording at MAX_RECORDING_MS
  useEffect(() => {
    if (recorderState === "recording" && elapsedMs >= MAX_RECORDING_MS) {
      stopRecording();
    }
  }, [recorderState, elapsedMs, stopRecording]);

  const openPastSession = useCallback((sessionId: string) => {
    vscode.postMessage({ type: "openSession", sessionId });
  }, []);

  const removeSession = useCallback((sessionId: string) => {
    vscode.postMessage({ type: "deleteSession", sessionId });
  }, []);

  const handleRemoveContextFile = useCallback((path: string) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      next.delete(path);
      return next;
    });
  }, []);

  const online = status === "online";

  return (
    <main className="panel">
      {/* 1. Top Header */}
      <HeaderBar
        voiceOn={voiceOn}
        speaking={speaking}
        autoListen={autoListen}
        autoApply={autoApply}
        onToggleAutoListen={handleToggleAutoListen}
        onToggleAutoApply={() => setAutoApply((prev) => !prev)}
        showSettings={showSettings}
        sessionCount={sessionList.length}
        onToggleVoice={() => {
          if (voiceOn && speaking) stopVoiceNow();
          setVoiceOn((prev) => !prev);
        }}
        onStopSpeaking={stopVoiceNow}
        onToggleSettings={() => {
          setShowSettings((prev) => !prev);
          setShowHistory(false);
          if (!showSettings) vscode.postMessage({ type: "getLlmConfig" });
        }}
        onNewSession={createNewSession}
        onToggleHistory={() => {
          setShowHistory((prev) => !prev);
          setShowSettings(false);
        }}
      />

      {/* 2. Settings Modal */}
      {showSettings && (
        <SettingsSheet
          selectedProvider={selectedProvider}
          selectedModel={selectedModel}
          apiKeyInput={apiKeyInput}
          configuredProviders={configuredProviders}
          settingsSavedMsg={settingsSavedMsg}
          testingConnection={testingConnection}
          testResult={testResult}
          onProviderChange={(prov) => {
            setSelectedProvider(prov);
            const models = PROVIDER_MODELS[prov]?.models;
            if (models && models.length > 0) {
              setSelectedModel(models[0].id);
            }
          }}
          onModelChange={(model) => setSelectedModel(model)}
          onApiKeyChange={(key) => setApiKeyInput(key)}
          onTestKey={() => {
            setTestingConnection(true);
            setTestResult(null);
            vscode.postMessage({
              type: "testLlmConfig",
              provider: selectedProvider,
              model: selectedModel.trim(),
              apiKey: apiKeyInput.trim() || undefined,
            });
          }}
          onClose={() => setShowSettings(false)}
          onSave={() => {
            vscode.postMessage({
              type: "updateLlmConfig",
              provider: selectedProvider,
              model: selectedModel.trim(),
              apiKey: apiKeyInput.trim() || undefined,
            });
          }}
        />
      )}

      {/* 3. Session History Overlay */}
      {showHistory && (
        <div className="history-dropdown-overlay" onClick={() => setShowHistory(false)}>
          <div className="history-dropdown-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 600, fontSize: "12px" }}>🕘 Saved Sessions</span>
              <button
                onClick={() => setShowHistory(false)}
                style={{ background: "transparent", border: "none", cursor: "pointer", color: "inherit", opacity: 0.6 }}
              >
                ✕
              </button>
            </div>
            {sessionList.length === 0 ? (
              <p style={{ fontSize: "12px", opacity: 0.6, margin: "8px 0" }}>No saved sessions yet.</p>
            ) : (
              <ul className="session-list">
                {sessionList.map((s) => (
                  <li
                    key={s.id}
                    className={`session-row ${s.id === activeSession?.id ? "active" : ""}`}
                    onClick={() => openPastSession(s.id)}
                  >
                    <div className="session-text">
                      <span className="session-title">{s.title}</span>
                      <span className="session-meta">{formatSessionTime(s.updatedAt)}</span>
                    </div>
                    <button
                      className="session-delete"
                      title="Delete session"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeSession(s.id);
                      }}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* 4. Chat View (Message Stream) */}
      <ChatView
        messages={messages}
        appliedDiffs={appliedDiffs}
        dismissedDiffs={dismissedDiffs}
        applyingDiff={applyingDiff}
        revertingDiff={revertingDiff}
        applyError={applyError}
        online={online}
        onApplyDiff={applyDiff}
        onRevertDiff={revertDiff}
        onViewDiff={openDiffInEditor}
        onDismissDiff={dismissDiff}
        onApplyAll={handleApplyAll}
        onRunTests={runWorkspaceTests}
        onAutoRepair={triggerAutoRepair}
        runningTests={runningTests}
        generating={isProcessing}
        testFrameworkName={testFramework.name}
        onSuggestionClick={handleSuggestionClick}
      />

      {/* 5. Sticky Chat Input Bar */}
      <ChatInput
        value={draft}
        recorderState={recorderState}
        elapsedMs={elapsedMs}
        disabled={!online || isProcessing}
        speaking={speaking}
        autoListen={autoListen}
        autoListenState={autoListenState}
        contextFiles={Array.from(selectedFiles)}
        recorderError={recorderError}
        onChange={setDraft}
        onSubmit={handleSendMessage}
        onToggleRecording={recorderState === "recording" ? stopRecording : startRecording}
        onCancelRecording={cancelRecording}
        onRemoveContextFile={handleRemoveContextFile}
      />
    </main>
  );
}
