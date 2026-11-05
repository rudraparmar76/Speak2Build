# Speak2Build

**Speech-to-verified-code for VS Code.**

Speak2Build is a voice-first AI pair programmer for Python projects. It
transcribes spoken instructions, inspects the workspace, generates a reviewable
patch, validates the result, and waits for developer approval before applying
changes.

## Features

- Local speech-to-text with faster-whisper.
- Editable voice and text input, including hands-free mode.
- Project-aware context selection.
- Configurable OpenAI-compatible LLM providers.
- Unified diff review with explicit apply and reject actions.
- Python syntax checks, pytest validation, and AI-assisted repair.
- Optional local text-to-speech responses.

## Screenshots

![Speak2Build home screen](snapshots/home_screen.png)

![LLM provider configuration](snapshots/llm_config.png)

![Voice-driven execution](snapshots/voice_execution.png)

![Generated code diff](snapshots/code_generation.png)

![Test validation and auto-repair](snapshots/test_code.png)

![Auto-repair output](snapshots/auto_repair_output.png)

## Requirements

- VS Code 1.96 or later
- Node.js 20 or later
- Python 3.12 or later

## Setup

### Backend

```powershell
cd backend
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
.venv\Scripts\uvicorn app.main:app --port 8000
```

The backend runs at `http://127.0.0.1:8000`.

### Extension

For development, open the repository in VS Code and press **F5** to launch the
Extension Development Host. Alternatively:

```powershell
cd extension
npm install
npm run build
code --extensionDevelopmentPath=D:\Speak2Build\extension
```

To package the extension:

```powershell
cd extension
npx @vscode/vsce package
code --install-extension speak2build-0.1.0.vsix
```

Open Speak2Build from the Activity Bar, configure an LLM provider, and use the
microphone or text input to submit a request. Review generated diffs before
applying them.

## Configuration

Set these environment variables for the backend:

| Variable | Purpose |
|---|---|
| `SPEAK2BUILD_LLM_BASE_URL` | OpenAI-compatible API URL |
| `SPEAK2BUILD_LLM_MODEL` | Model name |
| `SPEAK2BUILD_LLM_API_KEY` | API key, when required |
| `SPEAK2BUILD_WHISPER_MODEL` | Whisper model size |
| `SPEAK2BUILD_WHISPER_DEVICE` | `cpu` or `cuda` |

The extension backend URL defaults to `http://127.0.0.1:8000` and can be
changed with the `speak2build.backendUrl` setting.

## Validation

```powershell
cd backend
.venv\Scripts\python -m pytest tests\ -v

cd ..\extension
npm run typecheck
npm run build
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for technical design and
[DEVELOPMENT_LOG.md](DEVELOPMENT_LOG.md) for implementation history.
