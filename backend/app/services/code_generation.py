"""Code generation: LLM → unified diffs → validation → repair loop → dry-run apply."""

import ast
import json
import os
import re
import subprocess
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
You are a senior software engineer who writes clean, minimal, project-aware code changes.

You will receive:
1. A structured requirement (task, inputs, outputs, constraints, acceptance criteria, clarifications with answers)
2. Relevant context snippets from the user's workspace (file paths, language, content with line numbers)
3. Options (style guidance, test inclusion, max files)

Your job: produce a JSON object with a "diffs" array of unified diffs and a "summary".

RULES:
- Output ONLY valid JSON (no markdown fences, no commentary).
- Each diff must be a valid unified diff (--- a/path +++ b/path @@ -l,c +l,c @@).
- Use context snippets to match: import style, naming conventions, async patterns, test framework.
- Do NOT hallucinate imports or modules — only use what exists in context or stdlib.
- New files: is_new_file = true, diff starts from empty (--- /dev/null).
- Modified files: is_new_file = false, diff shows exact changes.
- Max 5 diffs. Prefer fewer, focused changes.
- Include tests if option.include_tests is true (default: true).
- Follow the project's existing patterns exactly.

JSON SCHEMA:
{
  "diffs": [
    {
      "path": "relative/path/to/file.py",
      "language": "python",
      "unified_diff": "@@ -0,0 +1,45 @@\n+import re\n+...\n",
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


class CodeGenerationError(Exception):
    """Generation failed after repair attempts."""


def strip_code_fences(raw: str) -> str:
    match = _FENCE_RE.match(raw.strip())
    return match.group(1) if match else raw.strip()


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


def validate_typescript_syntax(content: str, file_path: str, workspace_root: Path) -> list[str]:
    """Run tsc --noEmit on the file (requires tsconfig)."""
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


def validate_diff_applies(diff: str, workspace_root: Path) -> list[str]:
    """Dry-run git apply --check."""
    with tempfile.NamedTemporaryFile(mode="w", suffix=".patch", delete=False) as f:
        f.write(diff)
        patch_path = f.name
    try:
        result = subprocess.run(
            ["git", "apply", "--check", patch_path],
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
    """Actually apply the diff with git apply."""
    with tempfile.NamedTemporaryFile(mode="w", suffix=".patch", delete=False) as f:
        f.write(diff)
        patch_path = f.name
    try:
        result = subprocess.run(
            ["git", "apply", patch_path],
            capture_output=True, text=True, timeout=10, cwd=workspace_root
        )
        if result.returncode == 0:
            # Get affected files from diff header
            affected = re.findall(r"^\+\+\+\s+b/(.+)$", diff, re.MULTILINE)
            return True, "Applied successfully", affected
        return False, result.stderr.strip() or result.stdout.strip(), []
    except (subprocess.TimeoutExpired, FileNotFoundError) as e:
        return False, f"Git apply unavailable: {e}", []
    finally:
        try:
            os.unlink(patch_path)
        except OSError:
            pass


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
            try:
                old_content = full_path.read_text(encoding="utf-8")
            except OSError:
                old_content = ""

        # Apply diff in memory to get new content
        new_content = _apply_diff_in_memory(old_content, diff.unified_diff)

        # Syntax validation
        if diff.language == "python":
            errors.extend(validate_python_syntax(new_content, diff.path))
            errors.extend(validate_python_imports(new_content, diff.path, workspace_root))
        elif diff.language in ("typescript", "javascript"):
            errors.extend(validate_typescript_syntax(new_content, diff.path, workspace_root))

        # Dry-run apply
        errors.extend(validate_diff_applies(diff.unified_diff, workspace_root))

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

        # Build context summary for prompt
        context_summary = self._build_context_summary(context_snippets)

        user_prompt = f"""REQUIREMENT:
{requirement_text}

CONTEXT SNIPPETS:
{context_summary}

OPTIONS:
{json.dumps(options, indent=2)}

Return ONLY the JSON object with diffs and summary.
"""

        feedback: Optional[str] = None
        for attempt in range(1, self._max_attempts + 1):
            attempt_prompt = user_prompt
            if feedback:
                attempt_prompt = f"{user_prompt}\n\nPREVIOUS ATTEMPT FAILED VALIDATION:\n{feedback}\n\nReturn ONLY corrected JSON."

            raw = self._llm.complete(SYSTEM_PROMPT, attempt_prompt)
            try:
                diffs, summary = _parse_generation(raw)
                # Validate
                val_errors = validate_all_diffs(diffs, workspace_root)
                if not val_errors:
                    return GenerationOutcome(
                        diffs=diffs,
                        summary=summary,
                        model=self._model_name,
                        processing_seconds=time.monotonic() - started,
                        validated=True,
                        validation_errors=[],
                    )
                feedback = "\n".join(val_errors)
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
    "generate_code",
    "is_configured",
    "validate_all_diffs",
    "validate_python_syntax",
    "validate_python_imports",
    "validate_typescript_syntax",
    "validate_diff_applies",
]