import type { ReactNode } from "react";

interface SessionStartHeaderProps {
  startedAt?: number;
}

/**
 * Visual banner rendered at the top of the chat view when scrolling past earlier messages.
 * Gives users an unambiguous, elegant visual indicator that they have reached the beginning of the session.
 */
export function SessionStartHeader({ startedAt }: SessionStartHeaderProps): ReactNode {
  const formattedTime = startedAt
    ? new Date(startedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : undefined;

  return (
    <div className="chat-session-start" role="separator" aria-label="Chat session started">
      <div className="chat-session-start__divider" />
      <div className="chat-session-start__badge">
        <span className="chat-session-start__icon">🚀</span>
        <span className="chat-session-start__text">
          Chat Session Started{formattedTime ? ` · ${formattedTime}` : ""}
        </span>
      </div>
      <div className="chat-session-start__divider" />
    </div>
  );
}

