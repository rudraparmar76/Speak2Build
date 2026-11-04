import { useState, useEffect, type ReactNode } from "react";

interface TourModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface TourStep {
  badge: string;
  title: string;
  subtitle: string;
  icon: string;
  description: string;
  tips: string[];
}

const TOUR_STEPS: TourStep[] = [
  {
    badge: "Step 1 of 5",
    icon: "🚀",
    title: "Welcome to Speak2Build",
    subtitle: "Hands-free, voice-first AI pair programmer in VS Code",
    description:
      "Speak2Build lets you write code, add tests, inspect workspace architecture, and repair bugs using natural voice or text commands — designed from the ground up for hands-free productivity.",
    tips: [
      "No wizard menus or multi-step clicking: just ask and build.",
      "Works seamlessly alongside your editor and terminal.",
    ],
  },
  {
    badge: "Step 2 of 5",
    icon: "🎤",
    title: "Editable Voice & Text Input",
    subtitle: "Voice speech is transcribed directly into the input for easy editing",
    description:
      "Click the 🎤 microphone button or press Ctrl+Alt+Space to speak. Your words are transcribed directly into the chat input, so you can review and correct any typos or misheard words before submitting.",
    tips: [
      "Press Enter to send, or Shift+Enter for a new line.",
      "You can freely mix voice and keyboard typing at any time.",
    ],
  },
  {
    badge: "Step 3 of 5",
    icon: "🧠",
    title: "Smart Workspace Context",
    subtitle: "Autonomous context crawling without unnecessary clarification questions",
    description:
      "Speak2Build automatically crawls your workspace files, discovers frameworks (Flask, FastAPI, React, Node, etc.), and deduces parameter types and test conventions without bombarding you with questions.",
    tips: [
      "No need to paste code or answer implementation details.",
      "Relevant context snippets are automatically attached to requests.",
    ],
  },
  {
    badge: "Step 4 of 5",
    icon: "⚡",
    title: "Inline Diff Review & Voice Actions",
    subtitle: "Review changes directly in chat and control them hands-free",
    description:
      "Generated code appears as unified, syntax-highlighted diffs right inside the chat feed. You can review them line by line, view full file previews, or apply changes with single-click or voice commands.",
    tips: [
      "Say 'apply it' or 'accept all' to apply diffs hands-free.",
      "Say 'reject' or 'undo' to revert changes.",
    ],
  },
  {
    badge: "Step 5 of 5",
    icon: "🧪",
    title: "Testing & AI Auto-Repair",
    subtitle: "Run workspace tests and repair failures automatically",
    description:
      "Validate your project anytime by saying 'run tests' or clicking the test button. If tests fail, click 'Auto-Repair with AI' or say 'fix it' to have Speak2Build automatically analyze error logs and generate code fixes.",
    tips: [
      "Repairs appear chronologically below the failed test report.",
      "Say 'fix it' or 'repair tests' to repair hands-free.",
    ],
  },
];

export function TourModal({ isOpen, onClose }: TourModalProps): ReactNode {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setStepIndex(0);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowRight") {
        if (stepIndex < TOUR_STEPS.length - 1) {
          setStepIndex((prev) => prev + 1);
        } else {
          onClose();
        }
      } else if (e.key === "ArrowLeft") {
        if (stepIndex > 0) {
          setStepIndex((prev) => prev - 1);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, stepIndex, onClose]);

  if (!isOpen) return null;

  const currentStep = TOUR_STEPS[stepIndex];
  const isLast = stepIndex === TOUR_STEPS.length - 1;

  return (
    <div className="tour-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Speak2Build Tour">
      <div className="tour-modal" onClick={(e) => e.stopPropagation()}>
        <button className="tour-modal__close" onClick={onClose} title="Close Tour (Esc)">
          ✕
        </button>

        <div className="tour-modal__header">
          <span className="tour-modal__badge">{currentStep.badge}</span>
          <div className="tour-modal__icon-wrap">
            <span className="tour-modal__icon">{currentStep.icon}</span>
          </div>
          <h3 className="tour-modal__title">{currentStep.title}</h3>
          <p className="tour-modal__subtitle">{currentStep.subtitle}</p>
        </div>

        <div className="tour-modal__body">
          <p className="tour-modal__desc">{currentStep.description}</p>
          <div className="tour-modal__tips">
            {currentStep.tips.map((tip, i) => (
              <div key={i} className="tour-modal__tip">
                <span className="tour-modal__tip-bullet">💡</span>
                <span>{tip}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="tour-modal__footer">
          <div className="tour-modal__dots">
            {TOUR_STEPS.map((_, i) => (
              <button
                key={i}
                type="button"
                className={`tour-modal__dot${i === stepIndex ? " active" : ""}`}
                onClick={() => setStepIndex(i)}
                title={`Go to step ${i + 1}`}
              />
            ))}
          </div>

          <div className="tour-modal__actions">
            {stepIndex > 0 && (
              <button
                type="button"
                className="tour-btn tour-btn--secondary"
                onClick={() => setStepIndex((prev) => prev - 1)}
              >
                Back
              </button>
            )}
            <button
              type="button"
              className="tour-btn tour-btn--primary"
              onClick={() => {
                if (isLast) {
                  onClose();
                } else {
                  setStepIndex((prev) => prev + 1);
                }
              }}
            >
              {isLast ? "Get Started 🚀" : "Next →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

