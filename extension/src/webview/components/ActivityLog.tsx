import type { ReactNode } from "react";

import type { HistoryEntry } from "../constants";

/**
 * Activity log: the rolling diagnostic feed. In the Phase 1 chat-first
 * redesign most of these entries become chat bubbles instead.
 */

interface ActivityLogProps {
  history: HistoryEntry[];
}

export function ActivityLog({ history }: ActivityLogProps): ReactNode {
  return (
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
  );
}
