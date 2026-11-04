import { useEffect, useRef, type ReactNode } from "react";

import type { ChatMessage } from "../types/chat";
import type { FileDiff } from "../../types/messages";
import { ChatBubble } from "./ChatBubble";
import { QuickActions } from "./QuickActions";
import { WelcomeScreen } from "./WelcomeScreen";

interface ChatViewProps {
  messages: ChatMessage[];
  appliedDiffs: Set<string>;
  dismissedDiffs: Set<string>;
  applyingDiff: string | null;
  revertingDiff: string | null;
  applyError: { diff: string; message: string } | null;
  online: boolean;
  onApplyDiff: (unifiedDiff: string) => void;
  onRevertDiff: (unifiedDiff: string) => void;
  onViewDiff: (filePath: string, unifiedDiff: string, isNewFile: boolean) => void;
  onDismissDiff: (unifiedDiff: string) => void;
  onApplyAll: (diffs: FileDiff[]) => void;
  onRunTests: () => void;
  onAutoRepair: () => void;
  runningTests: boolean;
  generating: boolean;
  testFrameworkName: string;
  onSuggestionClick: (text: string) => void;
}

export function ChatView({
  messages,
  appliedDiffs,
  dismissedDiffs,
  applyingDiff,
  revertingDiff,
  applyError,
  online,
  onApplyDiff,
  onRevertDiff,
  onViewDiff,
  onDismissDiff,
  onApplyAll,
  onRunTests,
  onAutoRepair,
  runningTests,
  generating,
  testFrameworkName,
  onSuggestionClick,
}: ChatViewProps): ReactNode {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, messages.length]);

  return (
    <div className="chat-view">
      {messages.length === 0 ? (
        <WelcomeScreen onSuggestionClick={onSuggestionClick} />
      ) : (
        <>
          {messages.map((message) => (
            <ChatBubble
              key={message.id}
              message={message}
              appliedDiffs={appliedDiffs}
              dismissedDiffs={dismissedDiffs}
              applyingDiff={applyingDiff}
              revertingDiff={revertingDiff}
              applyError={applyError}
              online={online}
              onApplyDiff={onApplyDiff}
              onRevertDiff={onRevertDiff}
              onViewDiff={onViewDiff}
              onDismissDiff={onDismissDiff}
              onApplyAll={onApplyAll}
              onRunTests={onRunTests}
              onAutoRepair={onAutoRepair}
              runningTests={runningTests}
              generating={generating}
              testFrameworkName={testFrameworkName}
            />
          ))}
          {!generating && (() => {
            const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
            const pendingDiffs = (lastAssistant?.diffs ?? []).filter(
              (d) => !appliedDiffs.has(d.unifiedDiff) && !dismissedDiffs.has(d.unifiedDiff),
            );
            const hasFailedTests =
              lastAssistant?.testRunResult?.success === false ||
              (lastAssistant?.testErrors?.length ?? 0) > 0;
            return (
              <QuickActions
                hasPendingDiffs={pendingDiffs.length > 0}
                hasFailedTests={hasFailedTests}
                runningTests={runningTests}
                online={online}
                onApplyAll={() => onApplyAll(pendingDiffs)}
                onRunTests={onRunTests}
                onAutoRepair={onAutoRepair}
                onSuggestionClick={onSuggestionClick}
              />
            );
          })()}
        </>
      )}
      <div ref={bottomRef} />
    </div>
  );
}

