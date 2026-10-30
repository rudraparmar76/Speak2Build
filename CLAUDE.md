## 1. Project Overview

**Project Name:** Speak2Build  
**Product:** Speech-to-Verified-Code VS Code Extension

Speak2Build is an AI-powered VS Code extension that converts spoken programming instructions into structured requirements, project-aware code changes, and validated patches while keeping the developer in control.

The goal is not to build another basic voice-to-code application.

The goal is to build a reliable voice-driven development workflow:

**Speak → Transcribe → Understand → Clarify → Inspect Project → Generate Code → Validate → Review → Approve**

The application should help developers express programming tasks naturally without manually writing lengthy prompts.

## 2. Problem Statement

Existing voice coding tools primarily focus on speech recognition, voice dictation, and AI-assisted code generation.

However, converting spoken instructions into reliable changes in an existing codebase introduces several challenges:

- Speech recognition can misunderstand technical vocabulary and identifiers.
- Natural-language instructions can be incomplete or ambiguous.
- Generated code may not follow the existing project's architecture.
- AI-generated changes may introduce bugs or break existing functionality.
- Developers need control over modifications to their codebase.

Speak2Build addresses these challenges through structured requirement extraction, clarification, project-aware code generation, validation, and human approval.

## 3. Product Vision

Build a VS Code extension that behaves like a voice-driven coding assistant.

Example:

A developer says:

"Create a POST endpoint for registering users. Validate the email and prevent duplicate registrations."

Speak2Build should:

1. Record the developer's voice.
2. Transcribe the audio.
3. Extract the programming requirements.
4. Identify missing information.
5. Ask clarification questions when necessary.
6. Inspect relevant project files.
7. Generate a proposed code patch.
8. Run permitted validation checks.
9. Display the changes and test results.
10. Let the developer approve or reject the patch.

The developer must remain in control.

## 4. MVP Scope

The MVP must support Python projects and run inside VS Code.

### Mandatory Features

1. Voice recording inside the extension.
2. Speech-to-text using faster-whisper.
3. Editable transcription.
4. Structured requirement extraction using an LLM.
5. Requirement validation using Pydantic.
6. Ambiguity detection and clarification questions.
7. Basic project structure inspection.
8. Relevant Python file selection.
9. Context-aware code generation.
10. Structured code patch generation.
11. Diff preview.
12. Developer approval and rejection.
13. Basic Python syntax and test validation.
14. Clear validation results and error reporting.

### Explicitly Out of Scope for MVP

Do not implement these unless explicitly requested:

- Standalone desktop application.
- Support for multiple IDEs.
- Support for every programming language.
- Custom-trained speech recognition models.
- Custom-trained LLMs.
- Vector databases or complex RAG pipelines.
- Multi-agent orchestration.
- Autonomous unrestricted code modification.
- Automatic execution of arbitrary shell commands.
- Cloud accounts and user authentication.
- Cross-device synchronization.
- Real-time voice conversations.
- Voice-controlled operating system navigation.

Do not expand the scope without discussing the trade-offs first.

## 5. Technology Stack

### Frontend / IDE Integration

- Visual Studio Code Extension API
- TypeScript
- React
- HTML and CSS
- VS Code Webview API

### Backend

- Python
- FastAPI
- Pydantic

### Speech Recognition

- faster-whisper
- Start with a small pretrained model.
- Keep the transcription implementation replaceable.

### LLM Integration

Use a code-capable LLM API for:

- Structured requirement extraction.
- Ambiguity detection.
- Clarification generation.
- Code generation.

Keep the model provider configurable through environment variables.

Never hardcode API keys.

### Code Processing

- Python pathlib
- Unified diffs or Python difflib
- Pydantic response validation
- Pytest
- Restricted subprocess execution for validation

Do not introduce unnecessary dependencies.

## 6. High-Level Architecture

VS Code Extension
    |
    | Audio / JSON / HTTP
    v
FastAPI Backend
    |
    +---- Speech Service
    |       |
    |       +---- faster-whisper
    |
    +---- Requirement Service
    |       |
    |       +---- LLM
    |       +---- Pydantic Validation
    |
    +---- Context Service
    |       |
    |       +---- Workspace Inspection
    |       +---- Relevant File Selection
    |
    +---- Code Generation Service
    |       |
    |       +---- LLM
    |       +---- Structured Patch Generation
    |
    +---- Validation Service
            |
            +---- Python Syntax Checks
            +---- Pytest

VS Code receives the proposed changes, displays a diff, and waits for developer approval.

## 7. Suggested Repository Structure

speak2build/
|
+-- extension/
|   +-- src/
|   |   +-- extension.ts
|   |   +-- webview/
|   |   |   +-- App.tsx
|   |   |   +-- components/
|   |   |   +-- hooks/
|   |   +-- services/
|   |   +-- types/
|   +-- package.json
|
+-- backend/
|   +-- app/
|   |   +-- main.py
|   |   +-- api/
|   |   +-- services/
|   |   +-- schemas/
|   +-- tests/
|   +-- requirements.txt
|
+-- demo-project/
|
+-- evaluation/
|
+-- README.md
+-- .gitignore
+-- CLAUDE.md

This structure is a starting point. Do not create every directory or file before it is needed.

## 8. Engineering Principles

### A. Simplicity First

- Prefer understandable code over clever abstractions.
- Build the smallest working implementation.
- Avoid premature optimization.
- Avoid unnecessary design patterns.
- Do not introduce dependencies without explaining why they are needed.

### B. Separation of Concerns

Keep these responsibilities separate:

- Extension UI.
- Extension-to-backend communication.
- Speech transcription.
- Requirement extraction.
- Project context selection.
- Code generation.
- Patch validation.
- Test execution.

### C. Type Safety

- Use TypeScript types for extension messages and UI state.
- Use Pydantic models for backend request and response schemas.
- Avoid unnecessary use of `any`.
- Validate all external model responses.

### D. Error Handling

Handle:

- Microphone permission errors.
- Unsupported audio formats.
- Transcription failures.
- LLM API failures.
- Invalid structured responses.
- Missing project files.
- Invalid patches.
- Test execution failures.
- Backend connection failures.

Never silently ignore errors.

### E. Maintainability

- Use meaningful names.
- Keep functions focused.
- Avoid huge files.
- Add comments where reasoning is non-obvious.
- Keep configuration separate from implementation.
- Write tests for important logic.

## 9. Security Rules

Security is a core requirement, not an optional enhancement.

1. Never expose API keys in frontend code.
2. Never read `.env`, credentials, private keys, or other sensitive files.
3. Exclude `.git`, virtual environments, build directories, and dependency directories.
4. Restrict file access to the active workspace.
5. Reject path traversal attempts.
6. Validate every generated file path.
7. Never apply generated patches without explicit approval.
8. Never execute arbitrary LLM-generated shell commands.
9. Apply process timeouts to validation commands.
10. Keep test execution restricted and isolated where practical.
11. Do not send entire project directories to an LLM.
12. Send only relevant, necessary project context.

The workflow must always be:

LLM proposes → Backend validates → Developer reviews → Developer approves → Extension applies.

## 10. Product Differentiators

The following capabilities define Speak2Build's intended differentiation:

### 1. Speech-to-Structured-Requirements

Convert speech into structured programming requirements instead of merely returning a transcript.

### 2. Ambiguity Detection

Identify missing information and ask useful clarification questions before implementation.

### 3. Project-Aware Code Generation

Inspect the existing project and generate changes that fit its structure and conventions.

### 4. Speech-to-Verified-Code

Connect spoken requirements with generated patches and actual validation results.

### 5. Requirement-to-Test Traceability

Eventually connect each requirement to the implementation and the test that validates it.

Do not claim these capabilities are entirely novel. Existing voice coding and AI coding products already cover overlapping functionality. Our differentiation is the integrated, focused workflow and its measurable reliability.

## 11. Development Workflow

Development must happen incrementally.

For every feature:

1. Explain the problem being solved.
2. Explain the relevant technical concepts.
3. Describe the proposed design.
4. Break implementation into small tasks.
5. Wait for the developer to implement each meaningful step.
6. Review the developer's code.
7. Explain bugs and improvements.
8. Run relevant tests.
9. Confirm the feature works.
10. Move to the next milestone.

Do not implement several unrelated features simultaneously.

Do not skip foundational explanations.

Do not replace the developer's learning process with autonomous implementation.

## 12. Documentation

Maintain:

- README.md
- Architecture documentation.
- API endpoint documentation.
- Setup instructions.
- Environment variable examples.
- Testing instructions.
- Known limitations.

Update documentation as features become functional. Never claim an unfinished feature is implemented.

## 13. Definition of Done

A feature is complete only when:

- Its purpose is understood.
- Its implementation works.
- Relevant tests pass.
- Errors are handled.
- Security considerations are addressed.
- The developer understands how it works.
- Documentation is updated when necessary.

## 14. Final Product Goal

A developer opens a Python project in VS Code, speaks a programming instruction, reviews the extracted requirements, receives project-aware code changes, sees validation results, and approves the final patch.

Build this product incrementally, safely, and with a strong emphasis on understanding how every component works.