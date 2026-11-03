import { useCallback, useEffect, useRef, useState } from "react";

import { RecorderCard, type RecorderState } from "./components/RecorderCard";
import { ContextCard } from "./components/ContextCard";
import { RecordingCard } from "./components/RecordingCard";
import { TranscriptCard } from "./components/TranscriptCard";
import { RequirementsCard, type AnswerFlowState } from "./components/RequirementsCard";
import { DiffBlock } from "./components/DiffBlock";
import { TestValidationCard } from "./components/TestValidationCard";
import { SettingsSheet } from "./components/SettingsSheet";
import { HistoryTab } from "./components/HistoryTab";
import { ActivityLog } from "./components/ActivityLog";
import { getVsCodeApi } from "./bridge";
import {
  MAX_RECORDING_MS,
  PROVIDER_MODELS,
  type BackendStatus,
  type HistoryEntry,
  type UploadInfo,
  type TranscriptInfo,
} from "./constants";
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
  TestRunResult,
} from "../types/messages";

const vscode = getVsCodeApi();

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
  const [answerFlow, setAnswerFlow] = useState<AnswerFlowState>("idle");
  const answerFlowRef = useRef<AnswerFlowState>("idle");
  const openQuestionsRef = useRef<string[]>([]);
  const setAnswerFlowBoth = useCallback(
    (next: AnswerFlowState) => {
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

  const online = status === "online";
  const hasRelevantContext = !!relevantResult && relevantResult.snippets.length > 0;

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
          <ContextCard
            online={online}
            scanResult={scanResult}
            scanning={scanning}
            fetchingRelevant={fetchingRelevant}
            contextError={contextError}
            selectedFiles={selectedFiles}
            relevantResult={relevantResult}
            hasRequirement={requirement !== null}
            extracting={extracting}
            onScan={scanWorkspace}
            onToggleFile={toggleFileSelection}
            onFetchRelevant={fetchRelevantContext}
            onReExtract={() => extractRequirements(extractAnswers)}
          />

          {/* 2. Voice Capture */}
          <RecorderCard
            state={recorderState}
            elapsedMs={elapsedMs}
            error={recorderError}
            disabled={!online}
            onToggle={recorderState === "recording" ? stopRecording : startRecording}
            onCancel={cancelRecording}
          />

          {/* 3. Last Recording */}
          {lastUpload && (
            <RecordingCard
              upload={lastUpload}
              transcribingId={transcribingId}
              online={online}
              onTranscribe={startTranscription}
            />
          )}

          {/* 4. Transcript */}
          {transcript && (
            <TranscriptCard
              transcript={transcript}
              relevantSnippetCount={relevantResult?.snippets.length ?? 0}
              extracting={extracting}
              extractError={extractError}
              online={online}
              onTextChange={(text) =>
                setTranscript((current) =>
                  current === null ? current : { ...current, text },
                )
              }
              onExtract={() => extractRequirements()}
            />
          )}

          {/* 5. Requirements */}
          {requirement && (
            <RequirementsCard
              requirement={requirement}
              meta={requirementMeta}
              answers={extractAnswers}
              answerFlow={answerFlow}
              hasRelevantContext={hasRelevantContext}
              extracting={extracting}
              online={online}
              onAnswerChange={updateAnswer}
              onReExtract={() => extractRequirements(extractAnswers)}
              onStartVoiceAnswers={startVoiceAnswers}
              onFinishVoiceAnswers={finishVoiceAnswers}
            />
          )}

          {/* 6. Code Generation */}
          {requirement && (
            <section className="card">
              <div className="label">Code Generation</div>
              <p className="hint">
                {hasRelevantContext
                  ? `Generate code from requirements + ${relevantResult!.snippets.length} context snippet(s).`
                  : "Generate code from requirements (select files in Project Context above for best accuracy)."}
              </p>
              <button
                className="button"
                onClick={generateCode}
                disabled={!online || generating}
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
                .map((diff: FileDiff, index: number) => (
                  <DiffBlock
                    key={index}
                    diff={diff}
                    isApplied={appliedDiffs.has(diff.unifiedDiff)}
                    isApplying={applyingDiff === diff.unifiedDiff}
                    isReverting={revertingDiff === diff.unifiedDiff}
                    errorMessage={
                      applyError?.diff === diff.unifiedDiff ? applyError.message : null
                    }
                    online={online}
                    onView={() => openDiffInEditor(diff.path, diff.unifiedDiff, diff.isNewFile)}
                    onApply={() => applyDiff(diff.unifiedDiff)}
                    onReject={() => dismissDiff(diff.unifiedDiff)}
                    onRevert={() => revertDiff(diff.unifiedDiff)}
                  />
                ))}

              <TestValidationCard
                online={online}
                runningTests={runningTests}
                generating={generating}
                testFrameworkName={testFramework.name}
                testRunResult={testRunResult}
                onRunTests={runWorkspaceTests}
                onAutoRepair={triggerAutoRepair}
              />
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
              disabled={!online || draft.trim().length === 0}
            >
              Send to backend
            </button>
          </section>

          <ActivityLog history={history} />
        </>
      ) : (
        <HistoryTab
          sessionList={sessionList}
          activeSession={activeSession}
          onOpenSession={openPastSession}
          onDeleteSession={removeSession}
        />
      )}
    </main>
  );
}
