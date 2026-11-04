import {
  useCallback,
  useRef,
  useEffect,
  type KeyboardEvent,
  type ReactNode,
} from "react";

interface ChatInputProps {
  value: string;
  recorderState: "idle" | "starting" | "recording" | "stopping";
  elapsedMs: number;
  disabled: boolean;
  speaking: boolean;
  autoListen?: boolean;
  autoListenState?: string;
  contextFiles: string[];
  recorderError: string | null;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onToggleRecording: () => void;
  onCancelRecording: () => void;
  onRemoveContextFile: (path: string) => void;
}

export function ChatInput({
  value,
  recorderState,
  elapsedMs,
  disabled,
  speaking,
  autoListen = false,
  autoListenState = "disabled",
  contextFiles,
  recorderError,
  onChange,
  onSubmit,
  onToggleRecording,
  onCancelRecording,
  onRemoveContextFile,
}: ChatInputProps): ReactNode {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isPushRecording = recorderState === "recording";
  const isAutoRecording = autoListen && autoListenState === "recording";
  const isRecording = isPushRecording || isAutoRecording;
  const isBusy = recorderState === "starting" || recorderState === "stopping";

  // Auto-resize textarea height as content changes and focus on STT populate
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const newHeight = Math.min(el.scrollHeight, 120);
    el.style.height = `${Math.max(newHeight, 36)}px`;

    // If input was populated via speech-to-text, focus and place cursor at end for instant editing
    if (value && document.activeElement !== el) {
      el.focus();
      el.setSelectionRange(value.length, value.length);
    }
  }, [value]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (value.trim().length > 0 && !disabled) {
          onSubmit();
        }
      }
    },
    [value, disabled, onSubmit],
  );

  const getPlaceholder = () => {
    if (speaking) {
      return autoListen
        ? "AI speaking… (barge in with voice anytime or type)"
        : "AI speaking… press mic to barge in or type here";
    }
    if (autoListen) {
      return autoListenState === "listening"
        ? "Always listening 🎧… just speak or type here"
        : "Ask Speak2Build or type here…";
    }
    return "Ask Speak2Build or press mic…";
  };

  return (
    <div className="chat-input-bar">
      {/* Attached context file chips */}
      {contextFiles.length > 0 && (
        <div className="chat-input-context">
          <span className="context-chip-label">Context:</span>
          {contextFiles.map((file) => {
            const fileName = file.split(/[\\/]/).pop() || file;
            return (
              <span key={file} className="context-chip" title={file}>
                📄 {fileName}
                <button
                  type="button"
                  className="context-chip__remove"
                  onClick={() => onRemoveContextFile(file)}
                  title="Remove from context"
                >
                  ✕
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* Hands-free listening banner when in listening mode */}
      {autoListen && !isRecording && (
        <div className="chat-input-vad-banner">
          <span className="chat-input-vad-dot" />
          <span className="chat-input-vad-text">
            {autoListenState === "paused"
              ? "Paused while assistant speaks"
              : "Listening for your voice (Silero VAD active)"}
          </span>
        </div>
      )}

      <div className="chat-input-row">
        {isRecording ? (
          <div className="chat-input-recording">
            <span className="chat-input-recording__dot" />
            {isPushRecording && (
              <span className="chat-input-recording__time">
                {(elapsedMs / 1000).toFixed(1)}s
              </span>
            )}
            <span className="chat-input-recording__label">
              {isAutoRecording
                ? "Hearing you speak… (pause 1.2s when done)"
                : "Listening to your voice…"}
            </span>
            <button
              type="button"
              className="chat-input-recording__cancel"
              onClick={onCancelRecording}
            >
              Cancel
            </button>
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            className="chat-textarea"
            rows={1}
            value={value}
            disabled={disabled}
            placeholder={getPlaceholder()}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        )}

        {/* Mic button */}
        <button
          type="button"
          className={`chat-input-btn chat-input-btn--mic${isRecording ? " recording" : ""}${autoListen ? " autolisten" : ""}`}
          onClick={onToggleRecording}
          disabled={disabled || isBusy}
          title={
            isRecording
              ? "Stop recording (Enter)"
              : autoListen
                ? "Always-Listening active (🎧) — click to manually push-to-talk"
                : "Start voice recording (🎤)"
          }
        >
          {isRecording ? "■" : autoListen ? "🎧" : "🎤"}
        </button>

        {/* Send button */}
        <button
          type="button"
          className="chat-input-btn chat-input-btn--send"
          onClick={onSubmit}
          disabled={disabled || isRecording || value.trim().length === 0}
          title="Send message (Enter)"
        >
          ➤
        </button>
      </div>

      {recorderError && <div className="chat-input-error">{recorderError}</div>}

      <div className="chat-input-footer">
        <span>Enter to send · Shift+Enter for newline</span>
        <span>{autoListen ? "Hands-free voice active" : "Speak or type"}</span>
      </div>
    </div>
  );
}
