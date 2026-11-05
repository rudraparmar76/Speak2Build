# Speak2Build for Visual Studio Code

Voice-first AI pair programmer for Python projects. Turn spoken ideas into production-ready code with local voice activity detection (Silero VAD), local speech transcription (Whisper), and multi-LLM orchestration.

## Features

- **Zero Configuration**: The extension automatically starts and manages the local backend sidecar process in the background on launch.
- **Hands-Free Voice Coding**: Always-Listening mode with Silero VAD (< 200ms latency) and push-to-talk.
- **Project-Aware Context Crawling**: Automatically indexes relevant project files, imports, and symbols.
- **Self-Healing Code Verification**: Runs pytest automatically on generated code and repairs syntax or test failures.
- **Unified Diff Review**: Side-by-side and inline unified diff viewer with single-click or voice-driven Accept / Reject actions.
- **Multi-LLM Support**: Supports Google AI Studio (Gemini), Groq Cloud, local Ollama, NVIDIA NIM, OpenAI, or custom endpoints.

## Extension Settings

Configure via **Settings > Extensions > Speak2Build** or the in-extension ⚙ gear button:

- `speak2build.backendUrl`: URL of the local backend service (default: `http://127.0.0.1:8000`).
- `speak2build.llmProvider`: Chosen LLM provider (`google-ai-studio`, `groq`, `ollama`, `nvidia-nim`, `openai`, `custom`).
- `speak2build.llmApiKey`: API key for the chosen provider (not needed for local Ollama).
- `speak2build.llmModel`: Model name override (optional).

## Keyboard Shortcuts

- `Ctrl+Alt+Space` (macOS: `Cmd+Alt+Space`): Toggle voice recording.
