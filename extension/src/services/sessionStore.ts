import type * as vscode from "vscode";
import { randomBytes } from "node:crypto";

import type { SessionMeta, SessionSnapshot } from "../types/messages";

/**
 * Session memory for the sidebar, owned by the extension host.
 *
 * VS Code tears the webview down whenever it is hidden or the window reloads;
 * the host survives both. Everything meaningful the webview produces is
 * pushed here and stored per-workspace via `workspaceState`, so focus changes
 * and even full VS Code restarts don't erase the user's transcript,
 * requirements, context, or diffs.
 */

const SESSION_INDEX_KEY = "s2b.sessionIndex";
const ACTIVE_SESSION_KEY = "s2b.activeSessionId";
const SESSION_PREFIX = "s2b.session.";

/** Keep in-memory snapshots bounded — one card, one workflow per session. */
const MAX_SESSIONS = 20;

export function emptySnapshot(): SessionSnapshot {
  return {
    version: 1,
    lastUpload: null,
    transcript: null,
    requirement: null,
    requirementMeta: null,
    extractAnswers: {},
    scanResult: null,
    selectedFiles: [],
    relevantResult: null,
    generationResult: null,
    appliedDiffs: [],
    dismissedDiffs: [],
    testRunResult: null,
    history: [],
  };
}

/** Derive a human-readable title: task line > transcript head > fallback. */
export function deriveTitle(snapshot: SessionSnapshot): string {
  const raw = snapshot.requirement?.task ?? snapshot.transcript?.text ?? "";
  const clean = raw.replace(/\s+/g, " ").trim();
  if (clean.length === 0) {
    return "Untitled session";
  }
  return clean.length > 48 ? `${clean.slice(0, 48)}…` : clean;
}

export type ActiveSession = { meta: SessionMeta; snapshot: SessionSnapshot };

export class SessionStore {
  constructor(private readonly storage: vscode.Memento) {}

  list(): SessionMeta[] {
    return this.storage.get<SessionMeta[]>(SESSION_INDEX_KEY, []);
  }

  activeId(): string | null {
    return this.storage.get<string | undefined>(ACTIVE_SESSION_KEY, undefined) ?? null;
  }

  /**
   * Return the active session, creating a fresh one when none exists (first
   * boot, or after the active session was somehow lost).
   */
  ensureActive(): ActiveSession {
    const activeId = this.activeId();
    if (activeId) {
      const snapshot =
        this.storage.get<SessionSnapshot | undefined>(SESSION_PREFIX + activeId, undefined) ?? null;
      const meta = this.list().find((s) => s.id === activeId);
      if (snapshot && meta) {
        return { meta, snapshot };
      }
    }
    return this.create();
  }

  /** Start a new session; it becomes the active one. */
  create(): ActiveSession {
    const id = `s_${new Date().toISOString().replace(/[-:]/g, "").slice(2, 14)}_${randomBytes(2).toString("hex")}`;
    const meta: SessionMeta = {
      id,
      title: "Untitled session",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const snapshot = emptySnapshot();
    this.storage.update(SESSION_PREFIX + id, snapshot);
    const index = [meta, ...this.list().filter((s) => s.id !== id)];
    this.storage.update(SESSION_INDEX_KEY, index);
    this.storage.update(ACTIVE_SESSION_KEY, id);

    return { meta, snapshot };
  }

  /** Persist a snapshot. Returns the refreshed index for the history UI. */
  save(sessionId: string, snapshot: SessionSnapshot): SessionMeta[] {
    const snapshotToStore = snapshot.history
      ? { ...snapshot, history: snapshot.history.slice(0, 50) }
      : snapshot;

    this.storage.update(SESSION_PREFIX + sessionId, snapshotToStore);

    const id = sessionId;
    let index = this.list().filter((s) => s.id !== id);
    const existing = this.list().find((s) => s.id === id);
    const meta: SessionMeta = {
      id,
      title: deriveTitle(snapshotToStore),
      createdAt: existing?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    };
    index = [meta, ...index];

    // Prune oldest non-active sessions beyond the cap.
    if (index.length > MAX_SESSIONS) {
      const active = this.activeId();
      const sorted = index.sort((a, b) => b.updatedAt - a.updatedAt);
      const survivors = sorted.slice(0, MAX_SESSIONS);
      const dropped = sorted.slice(MAX_SESSIONS).filter((s) => s.id !== active);
      for (const s of dropped) {
        this.storage.update(SESSION_PREFIX + s.id, undefined);
      }
      index = survivors;
    }

    this.storage.update(SESSION_INDEX_KEY, index);
    return index;
  }

  /** Switch the active session and return its snapshot (or null if unknown). */
  open(sessionId: string): ActiveSession | null {
    const meta = this.list().find((s) => s.id === sessionId);
    if (!meta) {
      return null;
    }
    const snapshot =
      this.storage.get<SessionSnapshot | undefined>(SESSION_PREFIX + sessionId, undefined) ?? null;
    if (!snapshot) {
      return null;
    }
    this.storage.update(ACTIVE_SESSION_KEY, sessionId);
    return { meta, snapshot };
  }

  /** Remove a session; make sure an active one exists afterwards. */
  delete(sessionId: string): ActiveSession {
    this.storage.update(SESSION_PREFIX + sessionId, undefined);
    const remainder = this.list().filter((s) => s.id !== sessionId);
    this.storage.update(SESSION_INDEX_KEY, remainder);

    if (this.activeId() === sessionId) {
      const next = remainder[0];
      if (next) {
        const snapshot =
          this.storage.get<SessionSnapshot | undefined>(SESSION_PREFIX + next.id, undefined) ?? null;
        if (snapshot) {
          this.storage.update(ACTIVE_SESSION_KEY, next.id);
          return { meta: next, snapshot };
        }
      }
      return this.create();
    }

    return this.ensureActive();
  }
}
