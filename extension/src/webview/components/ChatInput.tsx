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
  contextFiles,
  recorderError,
  onChange,
  onSubmit,
  onToggleRecording,
  onCancelRecording,
  onRemoveContextFile,
}: ChatInputProps): ReactNode {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isRecording = recorderState === "recording";
  const isBusy = recorderState === "starting" || recorderState === "stopping";

  // Auto-resize textarea height as content changes
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const newHeight = Math.min(el.scrollHeight, 120);
    el.style.height = `${Math.max(newHeight, 36)}px`;
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

      <div className="chat-input-row">
        {isRecording ? (
          <div className="chat-input-recording">
            <span className="chat-input-recording__dot" />
            <span className="chat-input-recording__time">
              {(elapsedMs / 1000).toFixed(1)}s
            </span>
            <span className="chat-input-recording__label">
              Listening to your voice…
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
            placeholder={
              speaking
                ? "AI speaking… press mic to barge in or type here"
                : "Ask Speak2Build or press mic…"
            }
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        )}

        {/* Mic button */}
        <button
          type="button"
          className={`chat-input-btn chat-input-btn--mic${isRecording ? " recording" : ""}`}
          onClick={onToggleRecording}
          disabled={disabled || isBusy}
          title={isRecording ? "Stop recording (Enter)" : "Start voice recording"}
        >
          {isRecording ? "■" : "🎤"}
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
        <span>Speak or type</span>
      </div>
    </div>
  );
}

