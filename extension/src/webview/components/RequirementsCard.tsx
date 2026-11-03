import type { ReactNode } from "react";

import type { ClarificationInfo, RequirementResult } from "../../types/messages";

/**
 * Requirements card: structured task summary, clarification inputs, and the
 * voice-answers flow. All state (answers, answer flow) lives in App;
 * re-extraction semantics are unchanged.
 */

export type AnswerFlowState = "idle" | "recording" | "processing";

interface RequirementsCardProps {
  requirement: RequirementResult;
  meta: { model: string; processingSeconds: number; repaired: boolean } | null;
  answers: Record<string, string>;
  answerFlow: AnswerFlowState;
  hasRelevantContext: boolean;
  extracting: boolean;
  online: boolean;
  onAnswerChange: (question: string, value: string) => void;
  onReExtract: () => void;
  onStartVoiceAnswers: (questions: string[]) => void;
  onFinishVoiceAnswers: () => void;
}

export function RequirementsCard({
  requirement,
  meta,
  answers,
  answerFlow,
  hasRelevantContext,
  extracting,
  online,
  onAnswerChange,
  onReExtract,
  onStartVoiceAnswers,
  onFinishVoiceAnswers,
}: RequirementsCardProps): ReactNode {
  return (
    <section className="card">
      <div className="label">Requirements</div>
      {meta && (
        <p className="hint">
          {meta.model}
          {meta.repaired ? " · schema-repaired" : ""} ·{" "}
          {meta.processingSeconds.toFixed(1)}s
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
                  answers[item.question] ?? item.answer ?? ""
                }
                onChange={(event) => onAnswerChange(item.question, event.target.value)}
                placeholder="Your answer…"
              />
            </div>
          ))}
          <button
            className="button"
            onClick={onReExtract}
            disabled={
              !online ||
              extracting ||
              answerFlow !== "idle" ||
              (Object.values(answers).every((a) => a.trim().length === 0) && !hasRelevantContext)
            }
          >
            {extracting
              ? "Extracting…"
              : hasRelevantContext
              ? "⚙ Re-extract with context & answers"
              : "⚙ Re-extract with answers"}
          </button>
          <div className="voice-answers-flow">
            {answerFlow === "idle" &&
              requirement.clarifications.some((item) => !item.answer) && (
                <button
                  className="button secondary"
                  onClick={() =>
                    onStartVoiceAnswers(
                      requirement.clarifications
                        .filter((item) => !item.answer)
                        .map((item) => item.question),
                    )
                  }
                  title="Record one spoken take answering every open question"
                  disabled={!online}
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
                <button className="button" onClick={onFinishVoiceAnswers}>
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
  );
}
