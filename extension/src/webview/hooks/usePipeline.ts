import { useState, useCallback, useRef } from "react";
import type {
  ChatMessage,
} from "../types/chat";
import { createMessageId } from "../types/chat";
import type {
  FileDiff,
  FileNode,
  GenerationResult,
  GenerationStage,
  RequirementResult,
  ScanResult,
  Snippet,
  TestRunResult,
} from "../../types/messages";

export interface PipelineOptions {
  scanResult: ScanResult | null;
  selectedFiles: Set<string>;
  relevantSnippets: Snippet[];
  voiceOn: boolean;
  speakText: (text: string) => void;
  postMessage: (msg: any) => void;
  pushHistory: (entry: string) => void;
  applyDiff: (diff: string) => void;
  revertDiff: (diff: string) => void;
  runWorkspaceTests: () => void;
  triggerAutoRepair: () => void;
  createNewSession: () => void;
}

/** Recursively flattens a FileNode tree to a list of workspace-relative paths */
export function flattenFileTree(node: FileNode, acc: string[] = []): string[] {
  if (!node.isDir) {
    acc.push(node.path);
  } else if (node.children) {
    for (const child of node.children) {
      flattenFileTree(child, acc);
    }
  }
  return acc;
}

export function usePipeline(options: PipelineOptions) {
  const {
    scanResult,
    selectedFiles,
    speakText,
    postMessage,
    pushHistory,
    applyDiff,
    revertDiff,
    runWorkspaceTests,
    triggerAutoRepair,
    createNewSession,
  } = options;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const currentPromptRef = useRef<string>("");
  const currentSnippetsRef = useRef<Snippet[]>([]);
  const lastRequirementRef = useRef<RequirementResult | null>(null);

  /** Updates the last assistant message matching current turn */
  const updateAssistantMessage = useCallback(
    (updater: (msg: ChatMessage) => ChatMessage) => {
      setMessages((prev) => {
        const lastIndex = prev.map((m) => m.role).lastIndexOf("assistant");
        if (lastIndex >= 0) {
          const next = [...prev];
          next[lastIndex] = updater(next[lastIndex]);
          return next;
        }
        return prev;
      });
    },
    [],
  );

  /**
   * Main entry point: Start the hands-free auto-pipeline from voice or text.
   * Auto-chains: Context Discovery -> Requirements Extraction -> Code Generation
   */
  const startPipeline = useCallback(
    (promptText: string, source: "text" | "voice" = "text") => {
      const clean = promptText.trim();
      if (!clean) return;

      currentPromptRef.current = clean;
      setIsProcessing(true);

      const userMsgId = createMessageId();
      const asstMsgId = createMessageId();

      const userMsg: ChatMessage = {
        id: userMsgId,
        role: "user",
        content: clean,
        source,
        status: "done",
        timestamp: Date.now(),
      };

      const asstMsg: ChatMessage = {
        id: asstMsgId,
        role: "assistant",
        content: "",
        status: "thinking",
        stages: [
          { stage: "reading_context", done: false },
          { stage: "extracting_requirements", done: false },
          { stage: "generating", done: false },
        ],
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMsg, asstMsg]);
      pushHistory(`${source === "voice" ? "🎙️ Spoken" : "Typed"}: "${clean}"`);

      // ── Step 1: Context Discovery ─────────────────────────────
      // Determine file candidates:
      // Priority 1: User-pinned files from UI chips
      // Priority 2: All scanned workspace files (backend ranks top matches heuristically)
      let candidatePaths: string[] = [];
      if (selectedFiles.size > 0) {
        candidatePaths = Array.from(selectedFiles);
      } else if (scanResult) {
        candidatePaths = flattenFileTree(scanResult.fileTree);
      }

      // Request relevant snippets from backend
      postMessage({
        type: "getRelevantContext",
        requirementText: clean,
        filePaths: candidatePaths,
      });
    },
    [selectedFiles, scanResult, postMessage, pushHistory],
  );

  /**
   * Step 2: Context received -> Immediately auto-advance to Requirements Extraction
   */
  const handleContextReceived = useCallback(
    (snippets: Snippet[]) => {
      currentSnippetsRef.current = snippets;

      updateAssistantMessage((msg) => ({
        ...msg,
        stages: [
          { stage: "reading_context", done: true },
          { stage: "extracting_requirements", done: false },
          { stage: "generating", done: false },
        ],
      }));

      // Auto-extract requirements
      postMessage({
        type: "extractRequirements",
        transcript: currentPromptRef.current,
        ...(snippets.length > 0 ? { contextSnippets: snippets } : {}),
      });
    },
    [postMessage, updateAssistantMessage],
  );

  /**
   * Step 3: Requirements received -> Check clarifications or auto-advance to Code Generation
   */
  const handleRequirementsReceived = useCallback(
    (requirement: RequirementResult, model: string, durationSec: number, repaired: boolean) => {
      lastRequirementRef.current = requirement;
      const openQuestions = requirement.clarifications.filter((item) => !item.answer);

      if (openQuestions.length > 0) {
        // Paused for clarifications: display in bubble and speak questions aloud
        setIsProcessing(false);
        updateAssistantMessage((msg) => ({
          ...msg,
          status: "done",
          content: `I've analyzed your request: "${requirement.task}". Before generating code, please answer:`,
          clarifications: requirement.clarifications,
          stages: [
            { stage: "reading_context", done: true },
            { stage: "extracting_requirements", done: true },
            { stage: "answering_clarifications", done: false },
          ],
        }));

        const speech =
          openQuestions.length === 1
            ? `Before I write code, one question. ${openQuestions[0].question}`
            : `Before I write code, ${openQuestions.length} questions. ` +
              openQuestions.map((q, i) => `Question ${i + 1}. ${q.question}`).join(" ");
        speakText(speech);
      } else {
        // No clarifications needed -> Immediately auto-advance to Code Generation!
        updateAssistantMessage((msg) => ({
          ...msg,
          content: `Requirements extracted: "${requirement.task}". Generating code…`,
          stages: [
            { stage: "reading_context", done: true },
            { stage: "extracting_requirements", done: true },
            { stage: "generating", done: false },
          ],
        }));

        postMessage({
          type: "generateCode",
          requirementText: requirement.task,
          contextSnippets: currentSnippetsRef.current,
          options: { include_tests: true },
        });
      }
    },
    [postMessage, speakText, updateAssistantMessage],
  );

  /**
   * Resumes pipeline when clarification answers are submitted
   */
  const handleClarificationAnswersSubmitted = useCallback(
    (answers: Record<string, string>) => {
      setIsProcessing(true);
      updateAssistantMessage((msg) => ({
        ...msg,
        status: "thinking",
        content: "Applying clarification answers…",
        stages: [
          { stage: "reading_context", done: true },
          { stage: "answering_clarifications", done: true },
          { stage: "generating", done: false },
        ],
      }));

      postMessage({
        type: "extractRequirements",
        transcript: currentPromptRef.current,
        answers,
        ...(currentSnippetsRef.current.length > 0
          ? { contextSnippets: currentSnippetsRef.current }
          : {}),
      });
    },
    [postMessage, updateAssistantMessage],
  );

  /**
   * Step 4: Code Generation complete -> Present diffs and speak summary
   */
  const handleGenerationResult = useCallback(
    (result: GenerationResult) => {
      setIsProcessing(false);

      updateAssistantMessage((msg) => ({
        ...msg,
        status: "done",
        content: result.summary || "Generated code changes:",
        diffs: result.diffs,
        summary: result.summary,
        model: result.model,
        processingSeconds: result.processingSeconds,
        validated: result.validated,
        validationErrors: result.validationErrors,
        testErrors: result.testErrors,
        testsPassed: result.testsPassed,
        stages: [
          { stage: "reading_context", done: true },
          { stage: "extracting_requirements", done: true },
          { stage: "generating", done: true },
          { stage: "done", done: true },
        ],
      }));

      if (result.summary) {
        speakText(result.summary);
      }
    },
    [speakText, updateAssistantMessage],
  );

  /**
   * Test results received -> Attach to latest assistant message
   */
  const handleTestResult = useCallback((testResult: TestRunResult) => {
    updateAssistantMessage((msg) => ({
      ...msg,
      testRunResult: testResult,
    }));
  }, [updateAssistantMessage]);

  /**
   * Pipeline error handler
   */
  const handlePipelineError = useCallback(
    (errorMessage: string) => {
      setIsProcessing(false);
      updateAssistantMessage((msg) => ({
        ...msg,
        status: "error",
        error: errorMessage,
      }));
    },
    [updateAssistantMessage],
  );

  /**
   * Executes voice commands recognized by the backend classifier
   */
  const handleVoiceCommand = useCallback(
    (action: string, feedbackSpeech: string, activeDiffs: FileDiff[], appliedDiffs: Set<string>) => {
      pushHistory(`🎙️ Voice Command: ${action} ("${feedbackSpeech}")`);

      switch (action) {
        case "apply": {
          const pending = activeDiffs.filter((d) => !appliedDiffs.has(d.unifiedDiff));
          for (const diff of pending) {
            applyDiff(diff.unifiedDiff);
          }
          break;
        }
        case "revert": {
          const toRevert = activeDiffs.filter((d) => appliedDiffs.has(d.unifiedDiff));
          for (const diff of toRevert) {
            revertDiff(diff.unifiedDiff);
          }
          break;
        }
        case "run_tests": {
          runWorkspaceTests();
          break;
        }
        case "repair": {
          triggerAutoRepair();
          break;
        }
        case "new_session": {
          setMessages([]);
          createNewSession();
          break;
        }
      }
    },
    [pushHistory, applyDiff, revertDiff, runWorkspaceTests, triggerAutoRepair, createNewSession],
  );

  return {
    messages,
    setMessages,
    isProcessing,
    startPipeline,
    handleContextReceived,
    handleRequirementsReceived,
    handleClarificationAnswersSubmitted,
    handleGenerationResult,
    handleTestResult,
    handlePipelineError,
    handleVoiceCommand,
  };
}

