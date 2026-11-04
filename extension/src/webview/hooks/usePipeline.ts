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
  /** Speaks aloud, then the extension auto-opens the mic for a voice reply. */
  speakAndListen: (text: string) => void;
  /** Keeps the typed-answer editor in sync when voice answers are mapped. */
  onAnswersUpdated?: (answers: Record<string, string>) => void;
  postMessage: (msg: any) => void;
  pushHistory: (entry: string) => void;
  applyDiff: (diff: string) => void;
  applyAllDiffs?: (diffs: string[]) => void;
  revertDiff: (diff: string) => void;
  dismissDiff?: (diff: string) => void;
  runWorkspaceTests: () => void;
  triggerAutoRepair: () => void;
  createNewSession: () => void;
}

/** One active clarification turn: pipeline pauses until questions are answered. */
export interface ClarificationTurn {
  /** The original user prompt that started this clarification sequence. */
  prompt: string;
  /** Queue of questions still to ask (each becomes its own bubble). */
  pendingQuestions: string[];
  /** Questions already asked (in order) with their answers. */
  answeredQuestions: Array<{ question: string; answer: string; source: "voice" | "text" }>;
  /** The ID of the current assistant bubble asking the question. */
  currentAskBubbleId: string | null;
  /** A voice transcript is being mapped onto the current question. */
  mapping: boolean;
  /** Waiting for user to answer the current question (mic open / typing). */
  awaitingVoice: boolean;
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

/** Builds the TTS line for reading clarification questions aloud. */
function questionsSpeech({
  questions,
  preamble,
}: {
  questions: string[];
  preamble?: string;
}): string {
  const intro = preamble ? `${preamble}, ` : "";
  if (questions.length === 1) {
    return `${intro}one question. ${questions[0]}`;
  }
  return (
    `${intro}I have ${questions.length} questions. ` +
    questions.map((q, i) => `Question ${i + 1}. ${q}`).join(" ")
  );
}

export function usePipeline(options: PipelineOptions) {
  const {
    scanResult,
    selectedFiles,
    speakText,
    speakAndListen,
    onAnswersUpdated,
    postMessage,
    pushHistory,
    applyDiff,
    applyAllDiffs,
    revertDiff,
    dismissDiff,
    runWorkspaceTests,
    triggerAutoRepair,
    createNewSession,
  } = options;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const currentPromptRef = useRef<string>("");
  const currentSnippetsRef = useRef<Snippet[]>([]);
  const currentTurnMsgIdRef = useRef<string>("");
  const lastRequirementRef = useRef<RequirementResult | null>(null);

  // ── Clarification Answering Mode state ─────────────────────────
  // Mounted in a ref so the message router can read it synchronously
  // (voice transcripts must NOT start a new pipeline while open).
  const clarificationRef = useRef<ClarificationTurn | null>(null);
  const [clarification, setClarification] = useState<ClarificationTurn | null>(null);
  const awaitingVoiceAnswerRef = useRef(false);

  const setClarificationTurn = useCallback(
    (turn: ClarificationTurn | null) => {
      clarificationRef.current = turn;
      awaitingVoiceAnswerRef.current = turn?.awaitingVoice === true && turn.mapping === false;
      setClarification(turn);
    },
    [],
  );

  /** Asks the next clarification question in a new assistant bubble. */
  const askNextQuestion = useCallback(() => {
    const turn = clarificationRef.current;
    if (!turn || turn.pendingQuestions.length === 0) return;

    const nextQuestion = turn.pendingQuestions[0];
    const askBubbleId = createMessageId();

    const askMsg: ChatMessage = {
      id: askBubbleId,
      role: "assistant",
      content: nextQuestion,
      status: "done",
      stages: [
        { stage: "reading_context", done: true },
        { stage: "extracting_requirements", done: true },
        { stage: "answering_clarifications", done: false },
      ],
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, askMsg]);
    pushHistory(`🤖 Asking: "${nextQuestion}"`);
    speakAndListen(nextQuestion);

    setClarificationTurn({
      ...turn,
      currentAskBubbleId: askBubbleId,
      awaitingVoice: true,
      mapping: false,
    });
  }, [pushHistory, speakAndListen]);

  /** Mirror of messages so callbacks can look up bubbles without stale closures. */
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;

  const getConversationHistory = useCallback(() => {
    return messagesRef.current
      .filter((m) => m.content && m.status !== "error" && m.status !== "thinking")
      .slice(-6)
      .map((m) => ({ role: m.role, content: m.content }));
  }, []);

  /** Updates a specific assistant message by id (falls back to last assistant). */
  const updateMessageById = useCallback(
    (msgId: string, updater: (msg: ChatMessage) => ChatMessage) => {
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === msgId);
        if (idx < 0) return prev;
        const next = [...prev];
        next[idx] = updater(next[idx]);
        return next;
      });
    },
    [],
  );

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
      if (isProcessing) {
        console.warn("Pipeline already processing, ignoring duplicate start:", clean);
        return;
      }

      currentPromptRef.current = clean;
      setClarificationTurn(null);
      setIsProcessing(true);

      const userMsgId = createMessageId();
      const asstMsgId = createMessageId();
      currentTurnMsgIdRef.current = asstMsgId;

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
        candidatePaths = Array.from(selectedFiles).slice(0, 50);
      } else if (scanResult) {
        candidatePaths = flattenFileTree(scanResult.fileTree).slice(0, 50);
      }

      // Request relevant snippets from backend
      postMessage({
        type: "getRelevantContext",
        requirementText: clean,
        filePaths: candidatePaths,
      });
    },
    [selectedFiles, scanResult, postMessage, pushHistory, isProcessing],
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
        conversationHistory: getConversationHistory(),
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
        // Sequential clarification flow: each question gets its own bubble.
        setClarificationTurn({
          prompt: currentPromptRef.current,
          pendingQuestions: openQuestions.map((q) => q.question),
          answeredQuestions: [],
          currentAskBubbleId: null,
          awaitingVoice: false,
          mapping: false,
        });
        setIsProcessing(false);

        // Ask the first question in a new bubble
        askNextQuestion();
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
          conversationHistory: getConversationHistory(),
        });
      }
    },
    [speakAndListen, postMessage, updateAssistantMessage, askNextQuestion],
  );

  /**
   * Resumes the pipeline once every pending clarification question has an
   * answer. Folds the Q&A into the transcript as facts (the LLM may rephrase
   * questions on re-extraction) AND passes the structured answers map so the
   * backend attaches them when the questions match verbatim.
   */
  const resumeExtractionWithAnswers = useCallback(
    (turn: ClarificationTurn, answers: Record<string, string>) => {
      setClarificationTurn(null);
      setIsProcessing(true);

      const qaText = Object.entries(answers)
        .map(([q, a]) => `- Q: ${q}\n  A: ${a}`)
        .join("\n");
      const transcript = `${turn.prompt}\n\nThe developer answered these clarification questions:\n${qaText}`;

      // Create a NEW assistant bubble for code generation (not updating the question bubble)
      const genMsgId = createMessageId();
      const genMsg: ChatMessage = {
        id: genMsgId,
        role: "assistant",
        content: "Generating code…",
        status: "thinking",
        stages: [
          { stage: "reading_context", done: true },
          { stage: "extracting_requirements", done: true },
          { stage: "answering_clarifications", done: true },
          { stage: "generating", done: false },
        ],
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, genMsg]);
      pushHistory(`⚡ Generating code with ${Object.keys(answers).length} clarification answers`);

      postMessage({
        type: "extractRequirements",
        transcript,
        answers,
        ...(currentSnippetsRef.current.length > 0
          ? { contextSnippets: currentSnippetsRef.current }
          : {}),
        conversationHistory: getConversationHistory(),
      });
    },
    [postMessage, pushHistory],
  );

  /**
   * A spoken reply was transcribed while waiting for clarification answers.
   * Instead of starting a new pipeline, we treat it as the answer to the
   * current question. If multiple questions might be answered at once, we
   * use the backend map-answers to distribute.
   */
  const handleVoiceAnswerTranscript = useCallback(
    (transcript: string) => {
      const turn = clarificationRef.current;
      const clean = transcript.trim();
      if (!turn || !clean) return;
      if (turn.mapping) return;
      if (!turn.currentAskBubbleId) return;

      const currentQuestion = turn.pendingQuestions[0];
      if (!currentQuestion) return;

      setClarificationTurn({ ...turn, awaitingVoice: false, mapping: true });

      // Show the spoken reply as a user bubble so the feed reads naturally.
      const userMsg: ChatMessage = {
        id: createMessageId(),
        role: "user",
        content: clean,
        source: "voice",
        status: "done",
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg]);
      pushHistory(`🎙️ Spoken answer to "${currentQuestion}": "${clean}"`);

      // If there are multiple pending questions, use mapAnswers to distribute.
      // Otherwise, just take the transcript as the answer to the current question.
      if (turn.pendingQuestions.length > 1) {
        updateMessageById(turn.currentAskBubbleId, (msg) => ({
          ...msg,
          content: "Mapping your spoken answers to the questions…",
          stages: [
            { stage: "reading_context", done: true },
            { stage: "extracting_requirements", done: true },
            { stage: "mapping_answers", done: false },
            { stage: "answering_clarifications", done: false },
          ],
        }));
        postMessage({ type: "mapAnswers", questions: turn.pendingQuestions, transcript: clean });
      } else {
        // Single question — answer it directly
        handleSingleAnswerMapped(currentQuestion, clean, "voice");
      }
    },
    [postMessage, pushHistory, updateMessageById],
  );

  /**
   * Process a mapped answer for a single question (or the distributed results
   * from mapAnswers). Then ask the next question or resume generation.
   */
  const handleAnswersMapped = useCallback(
    (mapped: Array<{ question: string; answer: string }>) => {
      const turn = clarificationRef.current;
      if (!turn || !turn.mapping) return;

      // Distribute mapped answers to their respective questions
      for (const item of mapped) {
        const value = (item.answer || "").trim();
        if (item.answer !== undefined && value && turn.pendingQuestions.includes(item.question)) {
          handleSingleAnswerMapped(item.question, value, "voice");
        }
      }
    },
    [],
  );

  const handleSingleAnswerMapped = useCallback(
    (question: string, answer: string, source: "voice" | "text") => {
      const turn = clarificationRef.current;
      if (!turn) return;

      // Move this question from pending to answered
      const newPending = turn.pendingQuestions.filter((q) => q !== question);
      const newAnswered = [...turn.answeredQuestions, { question, answer, source }];

      // Update the ask bubble to show the answer (optional visual feedback)
      if (turn.currentAskBubbleId) {
        updateMessageById(turn.currentAskBubbleId, (msg) => ({
          ...msg,
          content: `${question}\n\n✓ **Answer:** ${answer}`,
        }));
      }

      if (newPending.length === 0) {
        // All answered — resume extraction
        const mergedAnswers = Object.fromEntries(
          newAnswered.map((a) => [a.question, a.answer]),
        );
        setClarificationTurn(null);
        resumeExtractionWithAnswers(
          { ...turn, answeredQuestions: newAnswered, pendingQuestions: [] },
          mergedAnswers,
        );
        return;
      }

      // Ask next question
      setClarificationTurn({
        ...turn,
        pendingQuestions: newPending,
        answeredQuestions: newAnswered,
        currentAskBubbleId: null,
        awaitingVoice: false,
        mapping: false,
      });
      askNextQuestion();
    },
    [askNextQuestion, resumeExtractionWithAnswers, updateMessageById],
  );

  /**
   * Typed answers submitted from the inline editor. Answers the current
   * question and moves to the next one.
   */
  const handleClarificationAnswersSubmitted = useCallback(
    (answers: Record<string, string>) => {
      const turn = clarificationRef.current;
      if (!turn || !turn.currentAskBubbleId) return;

      const currentQuestion = turn.pendingQuestions[0];
      const answer = (answers[currentQuestion] || "").trim();
      if (!answer) return;

      handleSingleAnswerMapped(currentQuestion, answer, "text");
    },
    [handleSingleAnswerMapped],
  );

  /**
   * Auto-repair requested: Spawn a new assistant message representing the Auto-Repair turn.
   * This ensures the new diffs appear chronologically after the test run that triggered it.
   */
  const startAutoRepairTurn = useCallback(() => {
    setIsProcessing(true);
    const repairMsgId = createMessageId();
    currentTurnMsgIdRef.current = repairMsgId;
    const repairMsg: ChatMessage = {
      id: repairMsgId,
      role: "assistant",
      content: "Auto-repairing failing tests with AI…",
      status: "thinking",
      stages: [
        { stage: "repairing", done: false },
      ],
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, repairMsg]);
  }, []);

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
        stages: msg.stages?.some((s) => s.stage === "repairing")
          ? [
              { stage: "repairing", done: true },
              { stage: "done", done: true },
            ]
          : [
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
          if (applyAllDiffs && pending.length > 1) {
            applyAllDiffs(pending.map((d) => d.unifiedDiff));
          } else {
            for (const diff of pending) {
              applyDiff(diff.unifiedDiff);
            }
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
        case "reject": {
          const pending = activeDiffs.filter((d) => !appliedDiffs.has(d.unifiedDiff));
          for (const diff of pending) {
            dismissDiff?.(diff.unifiedDiff);
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
    [pushHistory, applyDiff, applyAllDiffs, revertDiff, dismissDiff, runWorkspaceTests, triggerAutoRepair, createNewSession],
  );

  return {
    messages,
    setMessages,
    isProcessing,
    clarification,
    clarificationRef,
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
    startAutoRepairTurn,
  };
}

