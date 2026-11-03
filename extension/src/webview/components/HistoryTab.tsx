import type { ReactNode } from "react";

import type { SessionMeta } from "../../types/messages";
import { formatSessionTime } from "../constants";

/**
 * Session-history tab: saved sessions for this workspace with open/delete.
 * Pure rendering; App owns active-session state and host calls.
 */

interface HistoryTabProps {
  sessionList: SessionMeta[];
  activeSession: SessionMeta | null;
  onOpenSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
}

export function HistoryTab({
  sessionList,
  activeSession,
  onOpenSession,
  onDeleteSession,
}: HistoryTabProps): ReactNode {
  return (
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
              onClick={() => onOpenSession(s.id)}
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
                  onDeleteSession(s.id);
                }}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
