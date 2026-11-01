"""Validation service for running workspace tests safely."""

from dataclasses import dataclass
import os
from pathlib import Path
import re
import subprocess
import sys
import time
from typing import Optional


@dataclass(frozen=True)
class TestRunOutcome:
    __test__ = False
    success: bool
    passed: int = 0
    failed: int = 0
    errors: int = 0
    skipped: int = 0
    total: int = 0
    duration_seconds: float = 0.0
    summary: str = ""
    output: str = ""


MAX_OUTPUT_CHARS = 10000


def find_workspace_python(workspace_root: Path) -> Path:
    """Locate the Python executable in the workspace virtualenv, or fallback to current runtime."""
    candidates = [
        workspace_root / ".venv" / "Scripts" / "python.exe",
        workspace_root / ".venv" / "bin" / "python",
        workspace_root / "venv" / "Scripts" / "python.exe",
        workspace_root / "venv" / "bin" / "python",
        workspace_root / "env" / "Scripts" / "python.exe",
        workspace_root / "env" / "bin" / "python",
    ]
    for c in candidates:
        if c.is_file() and os.access(c, os.X_OK):
            return c
        if c.is_file() and sys.platform == "win32":
            return c

    return Path(sys.executable)


def parse_pytest_output(stdout: str, stderr: str, returncode: int) -> tuple[int, int, int, int, int, float, str]:
    """Extract passed, failed, errors, skipped, total, duration, and summary from pytest output."""
    combined = (stdout + "\n" + stderr).strip()

    passed = 0
    failed = 0
    errors = 0
    skipped = 0
    duration = 0.0

    m_pass = re.search(r"(\d+)\s+passed", combined)
    if m_pass:
        passed = int(m_pass.group(1))

    m_fail = re.search(r"(\d+)\s+failed", combined)
    if m_fail:
        failed = int(m_fail.group(1))

    m_err = re.search(r"(\d+)\s+error(?:s)?", combined)
    if m_err:
        errors = int(m_err.group(1))

    m_skip = re.search(r"(\d+)\s+skipped", combined)
    if m_skip:
        skipped = int(m_skip.group(1))

    m_dur = re.search(r"in\s+([0-9.]+)\s*s", combined)
    if m_dur:
        duration = float(m_dur.group(1))

    total = passed + failed + errors + skipped

    parts = []
    if passed:
        parts.append(f"{passed} passed")
    if failed:
        parts.append(f"{failed} failed")
    if errors:
        parts.append(f"{errors} error(s)")
    if skipped:
        parts.append(f"{skipped} skipped")

    if parts:
        summary = ", ".join(parts)
        if duration:
            summary += f" in {duration:.2f}s"
    elif returncode == 5:
        summary = "No tests collected"
    elif returncode == 0:
        summary = "Tests passed"
    else:
        summary = f"Test run failed (exit code {returncode})"

    return passed, failed, errors, skipped, total, duration, summary


def truncate_output(text: str, max_chars: int = MAX_OUTPUT_CHARS) -> str:
    """Keep output bounded to avoid payload inflation."""
    if len(text) <= max_chars:
        return text
    marker = "\n... [output truncated for display] ...\n"
    if max_chars <= len(marker):
        return text[:max_chars]
    available = max_chars - len(marker)
    half = available // 2
    return text[:half] + marker + text[-(available - half):]


def run_pytest(
    workspace_root: Path,
    test_path: Optional[str] = None,
    timeout_seconds: int = 30,
) -> TestRunOutcome:
    """Execute pytest within the target workspace in a bounded, safe subprocess."""
    workspace_root = workspace_root.resolve()
    if not workspace_root.is_dir():
        return TestRunOutcome(
            success=False,
            summary=f"Workspace root does not exist: {workspace_root}",
            output="",
        )

    cmd = [str(find_workspace_python(workspace_root)), "-m", "pytest", "-v", "--no-header"]

    if test_path:
        target = (workspace_root / test_path).resolve()
        try:
            target.relative_to(workspace_root)
        except ValueError:
            return TestRunOutcome(
                success=False,
                summary="Invalid test path: outside workspace root",
                output="Security error: Path traversal detected",
            )
        cmd.append(test_path)

    start_time = time.monotonic()
    try:
        proc = subprocess.run(
            cmd,
            cwd=str(workspace_root),
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            encoding="utf-8",
            errors="replace",
        )
        elapsed = time.monotonic() - start_time
        combined_output = proc.stdout
        if proc.stderr:
            combined_output += "\n" + proc.stderr

        passed, failed, errors, skipped, total, duration, summary = parse_pytest_output(
            proc.stdout, proc.stderr, proc.returncode
        )
        if duration == 0.0:
            duration = elapsed

        success = proc.returncode == 0
        return TestRunOutcome(
            success=success,
            passed=passed,
            failed=failed,
            errors=errors,
            skipped=skipped,
            total=total,
            duration_seconds=duration,
            summary=summary,
            output=truncate_output(combined_output),
        )
    except subprocess.TimeoutExpired as exc:
        raw_out = (exc.stdout or "") + "\n" + (exc.stderr or "")
        return TestRunOutcome(
            success=False,
            duration_seconds=float(timeout_seconds),
            summary=f"Test run timed out after {timeout_seconds}s",
            output=truncate_output(f"Timed out after {timeout_seconds} seconds:\n" + raw_out),
        )
    except FileNotFoundError as exc:
        return TestRunOutcome(
            success=False,
            summary="Python executable or pytest not found",
            output=str(exc),
        )
    except Exception as exc:
        return TestRunOutcome(
            success=False,
            summary=f"Execution error: {exc}",
            output=str(exc),
        )
