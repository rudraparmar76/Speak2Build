from pathlib import Path
from app.services import project_context as ctx
ws = Path("D:/Speak2Build").resolve()
req = "Create a function that validates email format and prevents duplicate registrations using SQLite"
file_paths = ["backend/app/services/recorder.py", "backend/app/services/audio_store.py", "backend/app/api/routes.py", "backend/tests/test_recorder.py", "extension/src/webview/App.tsx"]
snippets, truncated = ctx.select_relevant_files(req, file_paths, ws, max_snippet_lines=200, max_total_chars=8000)
print("snippets:", len(snippets))
for s in snippets:
    print("  ", s["path"], ":", len(s["content"]), "chars")
print("truncated:", truncated)
