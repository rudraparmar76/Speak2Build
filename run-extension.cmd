@echo off
rem Launches the Speak2Build extension in a dedicated Extension Development
rem Host window WITHOUT attaching the debugger.
rem (For debugging with breakpoints, use F5 inside the repository in VS Code.)
setlocal
set ROOT=%~dp0

cd /d "%ROOT%extension" || exit /b 1
call npm run build || exit /b 1

start "" code --extensionDevelopmentPath "%ROOT%extension"
endlocal
