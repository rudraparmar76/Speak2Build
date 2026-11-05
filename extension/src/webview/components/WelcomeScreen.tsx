import { LOGO_BASE64 } from "../logoBase64";
import type { ReactNode } from "react";

/**
 * Empty-state welcome screen displayed when the chat has no messages.
 * Shows a greeting, clickable suggestion chips that pre-fill the input,
 * and a quick walkthrough guide trigger.
 */

const SUGGESTIONS = [
  "Create a REST API for todos",
  "Add unit tests for the auth module",
  "Fix the failing tests",
  "Explain this codebase",
] as const;

interface WelcomeScreenProps {
  onSuggestionClick: (text: string) => void;
  onStartTour?: () => void;
}

export function WelcomeScreen({
  onSuggestionClick,
  onStartTour,
}: WelcomeScreenProps): ReactNode {
  return (
    <div className="welcome-screen">
      <div className="welcome-screen__emblem">
        <img
          src={LOGO_BASE64}
          alt="Speak2Build"
          className="welcome-screen__logo"
          width={54}
          height={54}
        />
      </div>
      <h2 className="welcome-screen__title">Welcome to Speak2Build</h2>
      <p className="welcome-screen__subtitle">
        Voice-first AI pair programmer for Python. Press the mic button or type below.
      </p>

      {onStartTour && (
        <div className="welcome-screen__tour-banner">
          <button
            type="button"
            className="welcome-screen__tour-btn"
            onClick={onStartTour}
          >
            <span className="welcome-screen__tour-icon">💡</span>
            <span>New here? Take a 1-minute visual tour</span>
            <span className="welcome-screen__tour-arrow">→</span>
          </button>
        </div>
      )}

      <div className="welcome-screen__suggestions">
        {SUGGESTIONS.map((text) => (
          <button
            key={text}
            className="welcome-screen__chip"
            onClick={() => onSuggestionClick(text)}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
