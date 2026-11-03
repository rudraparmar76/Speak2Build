import type { ReactNode } from "react";

/**
 * Empty-state welcome screen displayed when the chat has no messages.
 * Shows a greeting and clickable suggestion chips that pre-fill the input.
 */

const SUGGESTIONS = [
  "Create a REST API for todos",
  "Add unit tests for the auth module",
  "Fix the failing tests",
  "Explain this codebase",
] as const;

interface WelcomeScreenProps {
  onSuggestionClick: (text: string) => void;
}

export function WelcomeScreen({
  onSuggestionClick,
}: WelcomeScreenProps): ReactNode {
  return (
    <div className="welcome-screen">
      <h2 className="welcome-screen__title">👋 Welcome to Speak2Build</h2>
      <p className="welcome-screen__subtitle">
        Press the mic button or type below to start coding by voice.
      </p>

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
