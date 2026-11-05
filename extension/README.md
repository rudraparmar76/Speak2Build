# Speak2Build for Visual Studio Code

Voice-first AI pair programmer for Python projects. Speak or type a request,
review the generated patch, validate it, and approve changes from inside VS
Code.

## Features

- Push-to-talk and hands-free voice input.
- Local transcription with Whisper and Silero VAD.
- Project-aware workspace context.
- Configurable Gemini, Groq, Ollama, NVIDIA NIM, OpenAI, and custom providers.
- Unified diff review with voice or button-based apply and reject actions.
- Pytest validation and AI-assisted repair.

## Screenshots

![Speak2Build home screen](media/screenshots/home_screen.png)

![LLM provider configuration](media/screenshots/llm_config.png)

![Voice-driven execution](media/screenshots/voice_execution.png)

![Generated code diff](media/screenshots/code_generation.png)

![Test validation and auto-repair](media/screenshots/test_code.png)

![Auto-repair output](media/screenshots/auto_repair_output.png)

## Product walkthrough

[Click the thumbnail to watch the product walkthrough](https://www.youtube.com/watch?v=DnrfNbT5T9A)

[![Watch the Speak2Build product walkthrough](https://img.youtube.com/vi/DnrfNbT5T9A/maxresdefault.jpg)](https://www.youtube.com/watch?v=DnrfNbT5T9A)

## Installation

From the repository:

```powershell
npm install
npm run build
```

To package and install the VSIX:

```powershell
npx @vscode/vsce package
code --install-extension speak2build-0.1.0.vsix
```

The extension automatically starts the local backend sidecar. For development,
press **F5** from the repository root to launch an Extension Development Host.

## Settings

Configure these from **Settings > Extensions > Speak2Build** or the in-panel
gear button:

- `speak2build.backendUrl`: Backend URL, default `http://127.0.0.1:8000`.
- `speak2build.llmProvider`: Provider identifier.
- `speak2build.llmApiKey`: Provider API key; not needed for local Ollama.
- `speak2build.llmModel`: Optional model override.

## Keyboard shortcut

- `Ctrl+Alt+Space` (macOS: `Cmd+Alt+Space`): Toggle voice recording.
