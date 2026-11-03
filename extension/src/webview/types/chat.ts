import type { FileDiff, GenerationStage, TestRunResult, ClarificationInfo } from "../../types/messages";

/** A single message in the chat feed. */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  /** Display text for the message bubble. */
  content: string;
  /** How the user submitted this message (user messages only). */
  source?: "voice" | "text";
  /** Current pipeline stage (assistant messages only, while processing). */
  stages?: { stage: GenerationStage; done: boolean }[];
  /** Code diffs produced (assistant messages only). */
  diffs?: FileDiff[];
  /** LLM summary of what was generated. */
  summary?: string;
  /** Model used and time taken. */
  model?: string;
  processingSeconds?: number;
  /** Whether all diffs validated and tests passed. */
  validated?: boolean;
  validationErrors?: string[];
  testErrors?: string[];
  testsPassed?: boolean;
  /** Test run result attached to this turn. */
  testRunResult?: TestRunResult;
  /** Clarification questions from the LLM. */
  clarifications?: ClarificationInfo[];
  /** Message status. */
  status?: "sending" | "thinking" | "done" | "error";
  /** Error message if status is "error". */
  error?: string;
  /** Timestamp. */
  timestamp: number;
}

/** Generate a unique message ID. */
export function createMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
