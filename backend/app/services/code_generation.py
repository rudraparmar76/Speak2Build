"""Code generation: LLM → full file contents → computed diffs → validation → repair loop."""

import ast
import difflib
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from app.schemas.generation import FileDiff, GenerateResponse
from app.services.llm_client import LLMError, LLMRequestError, LLMUnavailableError, OpenAICompatibleLLM
from app.services.requirements import RequirementsService

MAX_REPAIR_ATTEMPTS = 2
MAX_DIFFS = 5

SYSTEM_PROMPT = """\
You are a senior software engineer who writes clean, minimal, project-aware code.

You will receive:
1. A structured requirement (task, inputs, outputs, constraints, acceptance criteria, clarifications with answers)
2. Relevant context snippets from the user's workspace (file paths, language, content with line numbers)
3. Options (style guidance, test inclusion, max files)

Your job: produce a JSON object with a "files" array containing the COMPLETE file contents and a "summary".

RULES:
- Output ONLY valid JSON (no markdown fences, no commentary).
- Each file entry must contain the COMPLETE, FINAL content of the file.
- For modified files: include the ENTIRE file with your changes applied (not just the changed parts).
- For new files: include the complete new file content.
- Use context snippets to match: import style, naming conventions, async patterns, test framework.
- Do NOT hallucinate imports or modules — only use what exists in context or stdlib.
- New files: set is_new_file = true.
- Modified files: set is_new_file = false.
- Max 5 files. Prefer fewer, focused changes.
- Include tests if option.include_tests is true (default: true).
- Follow the project's existing patterns exactly.
- Use proper indentation (4 spaces for Python).

JSON SCHEMA:
{
  "files": [
    {
      "path": "relative/path/to/file.py",
      "language": "python",
      "content": "from fastapi import FastAPI\\n\\napp = FastAPI()\\n\\n@app.get('/great')\\ndef greet():\\n    return 'hello user XYZ'\\n",
      "is_new_file": true
    }
  ],
  "summary": "One-sentence summary of what was created/changed"
}
"""

_FENCE_RE = re.compile(r"^\s*```[a-zA-Z0-9]*\s*(.*?)\s*```\s*$", re.DOTALL)


@dataclass(frozen=True)
class GenerationOutcome:
    diffs: list[FileDiff]
    summary: str
    model: str
    processing_seconds: float
    validated: bool
    validation_errors: list[str]
    test_errors: list[str] = None  # Test failures from pytest
    tests_passed: bool = False     # Whether tests passed (if run)


class CodeGenerationError(Exception):
    """Generation failed after repair attempts."""


@dataclass(frozen=True)
class _GeneratedFile:
    """Internal representation of a file produced by the LLM."""
    path: str
    language: str
    content: str
    is_new_file: bool


def strip_code_fences(raw: str) -> str:
    match = _FENCE_RE.match(raw.strip())
    return match.group(1) if match else raw.strip()


def _parse_file_generation(raw: str) -> tuple[list[_GeneratedFile], str]:
    """Parse LLM output into generated file contents + summary.

    Raises ValueError on bad JSON/schema.
    """
    text = strip_code_fences(raw)
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end > start:
        text = text[start:end+1]
    data = json.loads(text)
    if not isinstance(data, dict):
        raise ValueError("Expected JSON object")

    files_raw = data.get("files", [])
    summary = data.get("summary", "")
    if not isinstance(summary, str):
        summary = str(summary)

    if not files_raw:
        raise ValueError("No files in response")

    files = []
    for f in files_raw:
        if not isinstance(f, dict):
            raise ValueError("Each file entry must be a dict")
        path = f.get("path", "")
        if not path:
            raise ValueError("File entry missing 'path'")
        language = f.get("language", "unknown")
        content = f.get("content", "")
        if not content:
            raise ValueError(f"File entry '{path}' has empty content")
        is_new_file = f.get("is_new_file", False)
        files.append(_GeneratedFile(
            path=path, language=language,
            content=content, is_new_file=is_new_file,
        ))

    if len(files) > MAX_DIFFS:
        raise ValueError(f"Too many files ({len(files)} > {MAX_DIFFS})")

    return files, summary


# Keep the old parser for backward compatibility if needed
def _parse_generation(raw: str) -> tuple[list[FileDiff], str]:
    """Parse LLM output into diffs + summary. Raises ValueError on bad JSON/schema."""
    text = strip_code_fences(raw)
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end > start:
        text = text[start:end+1]
    data = json.loads(text)
    if not isinstance(data, dict):
        raise ValueError("Expected JSON object")
    diffs_raw = data.get("diffs", [])
    summary = data.get("summary", "")
    if not isinstance(summary, str):
        summary = str(summary)
    diffs = [FileDiff.model_validate(d) for d in diffs_raw]
    if len(diffs) > MAX_DIFFS:
        raise ValueError(f"Too many diffs ({len(diffs)} > {MAX_DIFFS})")
    return diffs, summary


# ---------- Diff Computation ----------

def compute_unified_diff(
    old_content: str,
    new_content: str,
    file_path: str,
    is_new_file: bool,
) -> str:
    """Compute a proper unified diff from old and new file content.

    Uses Python's difflib to produce a correct unified diff that git apply
    will accept — no more reliance on the LLM to format diffs correctly.
    """
    old_lines = old_content.splitlines(keepends=True)
    new_lines = new_content.splitlines(keepends=True)

    # Ensure files end with newline for clean diffs
    if new_lines and not new_lines[-1].endswith("\n"):
        new_lines[-1] += "\n"
    if old_lines and not old_lines[-1].endswith("\n"):
        old_lines[-1] += "\n"

    from_file = "/dev/null" if is_new_file else f"a/{file_path}"
    to_file = f"b/{file_path}"

    diff_lines = list(difflib.unified_diff(
        old_lines, new_lines,
        fromfile=from_file,
        tofile=to_file,
    ))

    if not diff_lines:
        return ""

    return "".join(diff_lines)


# ---------- Validation ----------

def validate_python_syntax(content: str, file_path: str) -> list[str]:
    """Return list of syntax errors (empty if valid)."""
    try:
        ast.parse(content, filename=file_path)
        return []
    except SyntaxError as e:
        return [f"{file_path}:{e.lineno}: {e.msg}"]


def validate_python_imports(content: str, file_path: str, workspace_root: Path) -> list[str]:
    """Basic import validation: check that local imports resolve to existing files."""
    errors = []
    try:
        tree = ast.parse(content, filename=file_path)
    except SyntaxError:
        return ["Syntax error prevents import analysis"]

    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.level > 0:
            # Relative import: from .module import X
            base = Path(file_path).parent
            for _ in range(node.level - 1):
                base = base.parent
            if node.module:
                mod_path = base / node.module.replace(".", "/")
            else:
                mod_path = base
            # Check if module file or package exists
            candidates = [
                mod_path.with_suffix(".py"),
                mod_path / "__init__.py",
            ]
            if not any(c.exists() for c in candidates):
                errors.append(f"{file_path}: Relative import '{node.module or ''}' not found at {mod_path}")
        elif isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name.startswith("."):
                    continue
                # Check if it's a local package (has __init__.py in workspace)
                parts = alias.name.split(".")
                local_path = workspace_root
                for part in parts:
                    local_path = local_path / part
                candidates = [local_path.with_suffix(".py"), local_path / "__init__.py"]
                # Only error if it looks like a local import (no dot in first part? heuristic)
                if not any(c.exists() for c in candidates) and "." not in alias.name:
                    # Could be stdlib/third-party; skip error for now
                    pass
    return errors


def _safe_directory(path: Path) -> Path:
    """Ensure path is a valid existing directory, fallback to parent or cwd."""
    try:
        p = Path(path).resolve()
        if p.is_dir():
            return p
        if p.is_file():
            return p.parent
    except Exception:
        pass
    return Path.cwd()


def read_file_safe(file_path: Path) -> str:
    """Read a text file safely handling UTF-8, UTF-16 with BOM, and fallback encodings."""
    try:
        raw_bytes = file_path.read_bytes()
    except Exception:
        return ""

    if not raw_bytes:
        return ""

    # Check for UTF-16 BOM (\xff\xfe or \xfe\xff)
    text = ""
    if raw_bytes.startswith((b"\xff\xfe", b"\xfe\xff")):
        try:
            text = raw_bytes.decode("utf-16", errors="replace")
        except Exception:
            pass

    # Check for UTF-8 BOM
    if not text and raw_bytes.startswith(b"\xef\xbb\xbf"):
        try:
            text = raw_bytes.decode("utf-8-sig", errors="replace")
        except Exception:
            pass

    # Standard UTF-8
    if not text:
        try:
            text = raw_bytes.decode("utf-8")
        except UnicodeDecodeError:
            pass

    # Check for UTF-16 without BOM (common when null bytes appear in ascii text)
    if not text and b"\x00" in raw_bytes[:100]:
        try:
            text = raw_bytes.decode("utf-16", errors="replace")
        except Exception:
            pass

    # Final fallback: UTF-8 with character replacement
    if not text:
        text = raw_bytes.decode("utf-8", errors="replace")

    return text.replace("\r\n", "\n")


def _is_utf8_on_disk(file_path: Path) -> bool:
    """Check whether a file on disk is valid UTF-8 (compatible with git apply)."""
    try:
        raw = file_path.read_bytes()
    except Exception:
        return True  # Non-existent files are fine (new file diffs)
    if not raw:
        return True
    # UTF-16 BOM
    if raw.startswith((b"\xff\xfe", b"\xfe\xff")):
        return False
    try:
        raw.decode("utf-8")
        return True
    except UnicodeDecodeError:
        return False



def validate_typescript_syntax(content: str, file_path: str, workspace_root: Path) -> list[str]:
    """Run tsc --noEmit on the file (requires tsconfig)."""
    workspace_root = _safe_directory(workspace_root)
    # Write to temp file and run tsc
    with tempfile.NamedTemporaryFile(mode="w", suffix=".ts", delete=False) as f:
        f.write(content)
        temp_path = f.name
    try:
        # Run tsc on just this file with project's tsconfig if available
        tsconfig = workspace_root / "tsconfig.json"
        cmd = ["npx", "tsc", "--noEmit", "--skipLibCheck"]
        if tsconfig.exists():
            cmd.extend(["-p", str(workspace_root)])
        else:
            cmd.append(temp_path)
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30, cwd=workspace_root)
        if result.returncode != 0:
            return [line for line in result.stdout.splitlines() if file_path in line or temp_path in line]
        return []
    except (subprocess.TimeoutExpired, FileNotFoundError) as e:
        return [f"TypeScript validation unavailable: {e}"]
    finally:
        try:
            os.unlink(temp_path)
        except OSError:
            pass


def run_pytest_on_files(
    generated_files: list[_GeneratedFile],
    workspace_root: Path,
    options: dict,
) -> list[str]:
    """Run pytest on the generated code to verify it works.

    Writes generated files to a temporary directory, runs pytest,
    and returns any test failures as validation errors.
    """
    if not options.get("include_tests", True):
        return []
    
    workspace_root = _safe_directory(workspace_root)

    # Locate Python executable: check workspace virtualenvs first, then current runtime
    python_bin = sys.executable
    for venv_path in [
        workspace_root / ".venv" / "Scripts" / "python.exe",
        workspace_root / ".venv" / "bin" / "python",
        workspace_root / "venv" / "Scripts" / "python.exe",
        workspace_root / "venv" / "bin" / "python",
    ]:
        if venv_path.is_file():
            python_bin = str(venv_path)
            break

    # Check if pytest is available
    try:
        subprocess.run(
            [python_bin, "-m", "pytest", "--version"],
            capture_output=True, timeout=5
        )
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return ["pytest not available in environment"]

    # Create a temporary workspace with the generated files
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_path = Path(tmpdir)

        # Copy existing project files (for imports to work)
        # Only copy Python files to keep it fast
        for py_file in workspace_root.rglob("*.py"):
            try:
                rel = py_file.relative_to(workspace_root)
                # Skip test files, cache, and generated files
                if any(part.startswith(".") for part in rel.parts):
                    continue
                if rel.parts[0] in ("__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache"):
                    continue
                dst = tmp_path / rel
                dst.parent.mkdir(parents=True, exist_ok=True)
                dst.write_text(read_file_safe(py_file), encoding="utf-8")
            except (OSError, ValueError):
                continue

        # Write generated files
        for gf in generated_files:
            if gf.language != "python":
                continue
            dst = tmp_path / gf.path
            dst.parent.mkdir(parents=True, exist_ok=True)
            dst.write_text(gf.content, encoding="utf-8")

        # Run pytest on test files only
        test_files = [str(tmp_path / gf.path) for gf in generated_files
                      if gf.language == "python" and "test" in gf.path]

        if not test_files:
            # No test files generated, look for existing test files that might be affected
            test_files = list(tmp_path.rglob("test_*.py")) + list(tmp_path.rglob("*_test.py"))
            test_files = [str(f) for f in test_files[:5]]  # Limit to first 5

        if not test_files:
            return []  # No tests to run

        try:
            # Run pytest with short timeout
            result = subprocess.run(
                [python_bin, "-m", "pytest", "-x", "-q", "--tb=short"] + test_files,
                capture_output=True, text=True, timeout=30, cwd=tmp_path
            )
            if result.returncode != 0:
                output = result.stdout + "\n" + result.stderr
                # Check for missing third-party modules (environment issue, not a generation defect)
                if "ModuleNotFoundError: No module named" in output:
                    m = re.search(r"ModuleNotFoundError: No module named ['\"]([^'\"]+)['\"]", output)
                    pkg = m.group(1) if m else "dependency"
                    return [f"Test run skipped: '{pkg}' is not installed in the Python environment."]

                # Extract relevant failure lines
                failure_lines = []
                for line in output.splitlines():
                    if any(keyword in line.lower() for keyword in ["failed", "error", "assert", "traceback", "test_"]):
                        failure_lines.append(line)
                if failure_lines:
                    return ["Test failures:\n" + "\n".join(failure_lines[:20])]
                return [f"Tests failed (exit code {result.returncode}):\n{output[:2000]}"]
            return []
        except subprocess.TimeoutExpired:
            return ["pytest timed out after 30 seconds"]
        except Exception as e:
            return [f"pytest execution error: {e}"]


def ensure_diff_headers(diff_text: str, file_path: str, is_new_file: bool) -> str:
    """Ensure the unified diff has proper --- / +++ headers for git apply.

    Many LLMs omit the file header lines and only produce @@ hunk lines.
    git apply rejects those with 'patch fragment without header'.
    """
    lines = diff_text.lstrip().splitlines()
    if not lines:
        return diff_text

    # Already has proper headers — return as-is
    if lines[0].startswith("--- "):
        return diff_text

    # Prepend the missing headers
    if is_new_file:
        header = f"--- /dev/null\n+++ b/{file_path}\n"
    else:
        header = f"--- a/{file_path}\n+++ b/{file_path}\n"

    return header + diff_text


def validate_diff_applies(diff: str, workspace_root: Path) -> list[str]:
    """Dry-run git apply --check."""
    workspace_root = _safe_directory(workspace_root)
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".patch", delete=False, newline="\n", encoding="utf-8"
    ) as f:
        f.write(diff)
        if not diff.endswith("\n"):
            f.write("\n")
        patch_path = f.name
    try:
        result = subprocess.run(
            ["git", "apply", "--check", "--whitespace=nowarn", patch_path],
            capture_output=True, text=True, timeout=10, cwd=workspace_root
        )
        if result.returncode != 0:
            return [result.stderr.strip() or result.stdout.strip()]
        return []
    except (subprocess.TimeoutExpired, FileNotFoundError) as e:
        return [f"Git apply check unavailable: {e}"]
    finally:
        try:
            os.unlink(patch_path)
        except OSError:
            pass


def apply_diff(diff: str, workspace_root: Path) -> tuple[bool, str, list[str]]:
    """Actually apply the diff with git apply, falling back to direct write."""
    workspace_root = _safe_directory(workspace_root)
    affected = re.findall(r"^\+\+\+\s+b/(.+)$", diff, re.MULTILINE)

    # Try git apply first
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".patch", delete=False, newline="\n", encoding="utf-8"
    ) as f:
        f.write(diff)
        if not diff.endswith("\n"):
            f.write("\n")
        patch_path = f.name
    try:
        result = subprocess.run(
            ["git", "apply", "--whitespace=nowarn", patch_path],
            capture_output=True, text=True, timeout=10, cwd=workspace_root
        )
        if result.returncode == 0:
            return True, "Applied successfully", affected
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass
    finally:
        try:
            os.unlink(patch_path)
        except OSError:
            pass

    # Fallback: apply diff in-memory and write directly.
    # This handles non-UTF-8 files (e.g. UTF-16) where git apply can't
    # match the context lines against the raw bytes on disk.
    try:
        for file_path in affected:
            full_path = workspace_root / file_path
            # Detect if this is a new-file diff (--- /dev/null)
            is_new = f"--- /dev/null" in diff
            if is_new and not full_path.exists():
                old_content = ""
            else:
                old_content = read_file_safe(full_path)
            new_content = _apply_diff_in_memory(old_content, diff)
            full_path.parent.mkdir(parents=True, exist_ok=True)
            full_path.write_text(new_content, encoding="utf-8")
        return True, "Applied successfully (direct write)", affected
    except Exception as e:
        return False, f"Fallback apply failed: {e}", []


def invert_unified_diff(diff: str) -> str:
    """Invert a unified diff so applying it reverses the changes."""
    lines = diff.splitlines()
    inverted_lines = []
    for line in lines:
        if line.startswith("--- ") or line.startswith("+++ "):
            inverted_lines.append(line)
        elif line.startswith("@@"):
            m = re.match(r"^@@\s*-(\d+(?:,\d+)?)\s*\+(\d+(?:,\d+)?)\s*@@(.*)$", line)
            if m:
                inverted_lines.append(f"@@ -{m.group(2)} +{m.group(1)} @@{m.group(3)}")
            else:
                inverted_lines.append(line)
        elif line.startswith("+"):
            inverted_lines.append("-" + line[1:])
        elif line.startswith("-"):
            inverted_lines.append("+" + line[1:])
        else:
            inverted_lines.append(line)
    return "\n".join(inverted_lines) + ("\n" if diff.endswith("\n") else "")


def revert_diff(diff: str, workspace_root: Path) -> tuple[bool, str, list[str]]:
    """Revert an applied unified diff using git apply --reverse, falling back to direct write."""
    workspace_root = _safe_directory(workspace_root)
    affected = re.findall(r"^\+\+\+\s+b/(.+)$", diff, re.MULTILINE)

    # Try git apply --reverse first
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".patch", delete=False, newline="\n", encoding="utf-8"
    ) as f:
        f.write(diff)
        if not diff.endswith("\n"):
            f.write("\n")
        patch_path = f.name
    try:
        result = subprocess.run(
            ["git", "apply", "--reverse", "--whitespace=nowarn", patch_path],
            capture_output=True, text=True, timeout=10, cwd=workspace_root
        )
        if result.returncode == 0:
            return True, "Reverted successfully", affected
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass
    finally:
        try:
            os.unlink(patch_path)
        except OSError:
            pass

    # Fallback: in-memory reversal and direct write/unlink
    try:
        is_new = "--- /dev/null" in diff
        for file_path in affected:
            full_path = workspace_root / file_path
            if is_new:
                if full_path.exists():
                    full_path.unlink()
            else:
                if full_path.exists():
                    current_content = read_file_safe(full_path)
                    inverted = invert_unified_diff(diff)
                    reverted_content = _apply_diff_in_memory(current_content, inverted)
                    full_path.write_text(reverted_content, encoding="utf-8")
        return True, "Reverted successfully (direct write)", affected
    except Exception as e:
        return False, f"Fallback revert failed: {e}", []


def validate_file_content(
    content: str,
    file_path: str,
    language: str,
    workspace_root: Path,
) -> list[str]:
    """Validate the full content of a generated file."""
    errors = []
    if language == "python":
        errors.extend(validate_python_syntax(content, file_path))
        if not errors:  # Only check imports if syntax is valid
            errors.extend(validate_python_imports(content, file_path, workspace_root))
    elif language in ("typescript", "javascript"):
        errors.extend(validate_typescript_syntax(content, file_path, workspace_root))
    return errors


def validate_all_diffs(
    diffs: list[FileDiff],
    workspace_root: Path,
) -> list[str]:
    """Run all validations on all diffs. Returns list of errors (empty = all good)."""
    errors = []
    for diff in diffs:
        full_path = workspace_root / diff.path
        full_path.parent.mkdir(parents=True, exist_ok=True)

        # Compute new content by applying diff to existing (or empty)
        if diff.is_new_file:
            old_content = ""
        else:
            old_content = read_file_safe(full_path)

        # Apply diff in memory to get new content
        new_content = _apply_diff_in_memory(old_content, diff.unified_diff)

        # Syntax validation
        errors.extend(validate_file_content(
            new_content, diff.path, diff.language, workspace_root,
        ))

        # Ensure headers exist, then dry-run apply
        full_diff = ensure_diff_headers(diff.unified_diff, diff.path, diff.is_new_file)
        errors.extend(validate_diff_applies(full_diff, workspace_root))

    return errors


def _apply_diff_in_memory(old_content: str, unified_diff: str) -> str:
    """Apply a unified diff to content in memory (for validation).

    Parses a simplified unified diff format and applies additions/deletions.
    """
    old_lines = old_content.splitlines(keepends=True)
    new_lines = list(old_lines)

    # Parse unified diff
    diff_lines = unified_diff.splitlines()
    i = 0
    while i < len(diff_lines):
        line = diff_lines[i]
        # Find hunk header: @@ -old_start,old_count +new_start,new_count @@
        if line.startswith("@@"):
            # Parse hunk header
            import re
            match = re.match(r"@@\s*-(\d+),?(\d*)\s*\+(\d+),?(\d*)\s*@@", line)
            if not match:
                i += 1
                continue
            old_start = int(match.group(1)) - 1  # 0-indexed
            old_count = int(match.group(2)) if match.group(2) else 1
            new_start = int(match.group(3)) - 1  # 0-indexed
            new_count = int(match.group(4)) if match.group(4) else 1

            i += 1
            # Process hunk lines
            hunk_lines = []
            while i < len(diff_lines) and not diff_lines[i].startswith("@@"):
                hunk_lines.append(diff_lines[i])
                i += 1

            # Apply hunk: delete old_count lines at old_start, insert new lines
            # Lines starting with '+' are additions, '-' are deletions, ' ' are context
            insert_lines = []
            delete_count = 0
            for hunk_line in hunk_lines:
                if hunk_line.startswith("+"):
                    insert_lines.append(hunk_line[1:] + "\n")
                elif hunk_line.startswith("-"):
                    delete_count += 1
                elif hunk_line.startswith(" "):
                    # Context line - part of both old and new
                    pass

            # Apply: delete old_count lines, insert new lines
            # Clamp to valid range
            if old_start < 0:
                old_start = 0
            if old_start + old_count > len(new_lines):
                old_count = max(0, len(new_lines) - old_start)

            del new_lines[old_start:old_start + old_count]
            for j, ins_line in enumerate(insert_lines):
                new_lines.insert(old_start + j, ins_line)
        else:
            i += 1

    return "".join(new_lines)


class CodeGenerationService:
    def __init__(self, llm, model_name: str, max_attempts: int = MAX_REPAIR_ATTEMPTS) -> None:
        self._llm = llm
        self._model_name = model_name
        self._max_attempts = max_attempts

    def generate(
        self,
        requirement_text: str,
        context_snippets: list[dict],
        options: dict,
        workspace_root: Path,
    ) -> GenerationOutcome:
        started = time.monotonic()
        workspace_root = _safe_directory(workspace_root)

        # Build context summary for prompt
        context_summary = self._build_context_summary(context_snippets)

        user_prompt = f"""REQUIREMENT:
{requirement_text}

CONTEXT SNIPPETS:
{context_summary}

OPTIONS:
{json.dumps(options, indent=2)}

Return ONLY the JSON object with files and summary. Do NOT use markdown fences.
"""

        feedback: Optional[str] = None
        for attempt in range(1, self._max_attempts + 1):
            attempt_prompt = user_prompt
            if feedback:
                attempt_prompt = (
                    f"{user_prompt}\n\nPREVIOUS ATTEMPT FAILED VALIDATION:\n"
                    f"{feedback}\n\nFix the issues and return ONLY corrected JSON."
                )

            raw = self._llm.complete(SYSTEM_PROMPT, attempt_prompt)
            try:
                generated_files, summary = _parse_file_generation(raw)

                # Validate each file and compute diffs
                all_errors: list[str] = []
                diffs: list[FileDiff] = []

                for gf in generated_files:
                    # 1. Validate the full file content (syntax, imports)
                    content_errors = validate_file_content(
                        gf.content, gf.path, gf.language, workspace_root,
                    )
                    all_errors.extend(content_errors)

                    # 2. Determine old content
                    full_path = workspace_root / gf.path
                    if gf.is_new_file or not full_path.exists():
                        old_content = ""
                        is_new = True
                    else:
                        old_content = read_file_safe(full_path)
                        is_new = False

                    # 3. Compute unified diff programmatically
                    unified_diff = compute_unified_diff(
                        old_content, gf.content, gf.path, is_new,
                    )

                    if not unified_diff:
                        continue  # No actual changes for this file

                    diff_obj = FileDiff(
                        path=gf.path,
                        language=gf.language,
                        unified_diff=unified_diff,
                        is_new_file=is_new,
                    )
                    diffs.append(diff_obj)

                    # 4. Dry-run git apply on the computed diff
                    # Skip for non-UTF-8 files: git reads raw bytes from disk,
                    # so context lines won't match our UTF-8-decoded diff.
                    if is_new or _is_utf8_on_disk(full_path):
                        apply_errors = validate_diff_applies(unified_diff, workspace_root)
                        all_errors.extend(apply_errors)

                if not diffs:
                    all_errors.append("No file changes produced")

                if not all_errors:
                    # Run pytest on generated files
                    test_errors = run_pytest_on_files(generated_files, workspace_root, options)
                    # Check if tests failed due to environment issues (missing package), which should not block generation
                    is_env_error = any("not installed in the Python environment" in err or "pytest not available" in err for err in test_errors)
                    if test_errors and not is_env_error and attempt < self._max_attempts:
                        # Feed actual code/assertion failures back to the repair loop once
                        feedback = "\n".join(test_errors)
                        continue
                    else:
                        # Diffs are syntactically valid and cleanly applicable.
                        # Return GenerationOutcome with test_errors reported to the developer.
                        return GenerationOutcome(
                            diffs=diffs,
                            summary=summary,
                            model=self._model_name,
                            processing_seconds=time.monotonic() - started,
                            validated=True,
                            validation_errors=[],
                            test_errors=test_errors,
                            tests_passed=len(test_errors) == 0,
                        )

                if all_errors:
                    feedback = "\n".join(all_errors)
            except (json.JSONDecodeError, ValueError, Exception) as e:
                feedback = str(e)

        # All attempts failed
        raise CodeGenerationError(
            f"Failed to generate valid code after {self._max_attempts} attempts. "
            f"Last validation errors: {feedback}"
        )

    def _build_context_summary(self, snippets: list[dict]) -> str:
        if not snippets:
            return "(no context provided)"
        parts = []
        for s in snippets:
            parts.append(f"--- {s['path']} (lines {s.get('start_line', 1)}-{s.get('end_line', '?')}) ---\n{s['content']}")
        return "\n\n".join(parts)


# Module-level entry points

def generate_code(
    requirement_text: str,
    context_snippets: list[dict],
    options: dict,
    workspace_root: str,
) -> GenerationOutcome:
    from app.services.llm_client import load_config_from_env, OpenAICompatibleLLM

    config = load_config_from_env()
    if not config.model:
        raise LLMUnavailableError("No LLM model configured.")
    service = CodeGenerationService(OpenAICompatibleLLM(config), config.model)
    return service.generate(requirement_text, context_snippets, options, Path(workspace_root))


def is_configured() -> bool:
    from app.services.llm_client import load_config_from_env
    return bool(load_config_from_env().model)


__all__ = [
    "CodeGenerationError",
    "CodeGenerationService",
    "GenerationOutcome",
    "MAX_REPAIR_ATTEMPTS",
    "SYSTEM_PROMPT",
    "apply_diff",
    "compute_unified_diff",
    "ensure_diff_headers",
    "generate_code",
    "is_configured",
    "read_file_safe",
    "validate_all_diffs",
    "validate_file_content",
    "validate_python_syntax",
    "validate_python_imports",
    "validate_typescript_syntax",
    "validate_diff_applies",
]