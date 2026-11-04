import type { ReactNode } from "react";

/**
 * Compact header bar for the chat panel. Shows the title, voice/settings/
 * session controls, speaking indicator, and Always-Listening mode toggle.
 * Pure rendering; App owns all toggle state and dispatches actions via callbacks.
 */

interface HeaderBarProps {
  voiceOn: boolean;
  speaking: boolean;
  autoListen?: boolean;
  autoApply?: boolean;
  showSettings: boolean;
  sessionCount: number;
  onToggleVoice: () => void;
  onToggleAutoListen?: () => void;
  onToggleAutoApply?: () => void;
  onStopSpeaking: () => void;
  onToggleSettings: () => void;
  onNewSession: () => void;
  onToggleHistory: () => void;
}

export function HeaderBar({
  voiceOn,
  speaking,
  autoListen = false,
  autoApply = false,
  showSettings,
  sessionCount,
  onToggleVoice,
  onToggleAutoListen,
  onToggleAutoApply,
  onStopSpeaking,
  onToggleSettings,
  onNewSession,
  onToggleHistory,
}: HeaderBarProps): ReactNode {
  return (
    <header className="header-bar">
      <div className="header-bar__brand">
        <span className="header-bar__title">Speak2Build</span>
        {autoListen && (
          <span className="header-bar__listening-pill" title="Always-listening hands-free mode active">
            <span className="header-bar__listening-dot" />
            Hands-Free
          </span>
        )}
      </div>

      <div className="header-bar__actions">
        {speaking && (
          <button
            className="header-bar__btn header-bar__speaking-indicator"
            onClick={onStopSpeaking}
            title="AI is speaking — click to stop"
          >
            <span className="header-bar__speaking-dot" />
            Speaking…
          </button>
        )}

        <button
          className={`header-bar__btn settings-gear-btn header-bar__btn--auto-apply${autoApply ? " active" : ""}`}
          onClick={onToggleAutoApply}
          title={
            autoApply
              ? "Auto-Apply is ON (⚡) — Verified diffs apply automatically. Click to disable."
              : "Auto-Apply is OFF (⚡) — Click to enable auto-applying verified code."
          }
        >
          ⚡
        </button>

        <button
          className={`header-bar__btn settings-gear-btn${autoListen ? " active header-bar__btn--listening" : ""}`}
          onClick={onToggleAutoListen}
          title={
            autoListen
              ? "Always-Listening active (🎧) — Silero VAD monitors voice. Click to switch to Push-to-Talk"
              : "Push-to-Talk mode (🎤) — Click to enable Always-Listening"
          }
        >
          {autoListen ? "🎧" : "🎤"}
        </button>

        <button
          className="header-bar__btn settings-gear-btn"
          onClick={onToggleVoice}
          title={voiceOn ? "Mute voice output" : "Unmute voice output"}
        >
          {voiceOn ? "🔈" : "🔇"}
        </button>

        <button
          className={`header-bar__btn settings-gear-btn${showSettings ? " active" : ""}`}
          onClick={onToggleSettings}
          title="Settings"
        >
          ⚙
        </button>

        <button
          className="header-bar__btn settings-gear-btn"
          onClick={onToggleHistory}
          title="Session history"
        >
          🕘{sessionCount > 0 && (
            <span className="header-bar__badge">{sessionCount}</span>
          )}
        </button>

        <button
          className="header-bar__btn settings-gear-btn"
          onClick={onNewSession}
          title="New session"
        >
          +
        </button>
      </div>
    </header>
  );
}
