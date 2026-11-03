import type { ReactNode } from "react";

/**
 * Compact header bar for the chat panel. Shows the title, voice/settings/
 * session controls, and a speaking indicator. Pure rendering; App owns all
 * toggle state and dispatches actions via callbacks.
 */

interface HeaderBarProps {
  voiceOn: boolean;
  speaking: boolean;
  showSettings: boolean;
  sessionCount: number;
  onToggleVoice: () => void;
  onStopSpeaking: () => void;
  onToggleSettings: () => void;
  onNewSession: () => void;
  onToggleHistory: () => void;
}

export function HeaderBar({
  voiceOn,
  speaking,
  showSettings,
  sessionCount,
  onToggleVoice,
  onStopSpeaking,
  onToggleSettings,
  onNewSession,
  onToggleHistory,
}: HeaderBarProps): ReactNode {
  return (
    <header className="header-bar">
      <span className="header-bar__title">Speak2Build</span>

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
