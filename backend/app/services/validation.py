"""Validation service for running workspace tests safely across frameworks."""

from dataclasses import dataclass
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
from typing import Optional


@dataclass(frozen=True)
class TestRunOutcome:
    __test__ = False
    success: bool
    framework: str = "pytest"
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



def strip_ansi(text: str) -> str:
    """Remove ANSI escape sequences from terminal output."""
    # Match standard ANSI escape codes like \x1b[36m, \x1b[0m, etc.
    text = re.sub(r'\x1b\[[0-9;]*[a-zA-Z]', '', text)
    # Also catch bare bracket codes that appear in some outputs: [36m, [39m, [0m
    text = re.sub(r'\[\d+(?:;\d+)*m', '', text)
    return text


def collapse_dom_dumps(text: str) -> str:
    """Collapse @testing-library DOM dumps that bloat test output."""
    lines = text.split('\n')
    cleaned = []
    in_dom_block = False

    for line in lines:
        stripped = line.strip()

        # Detect start of DOM dump from @testing-library
        if 'Ignored nodes:' in stripped:
            in_dom_block = True
            cleaned.append('    [DOM debug output collapsed]')
            continue

        if in_dom_block:
            # End of DOM block: closing tag or back to test code / stack trace
            if '</body>' in stripped or '</html>' in stripped:
                in_dom_block = False
                continue
            # Code frames with line numbers: "  81 |   fireEvent..." or "> 81 |"
            if re.match(r'^[>\s]*\d+\s*\|', stripped):
                in_dom_block = False
                cleaned.append(line)
                continue
            # Test runner summary / error lines
            if stripped.startswith(('at ', '>', 'Expected', 'Received', 'FAIL', 'PASS',
                                     'Tests:', 'Test Suites:', 'Time:', '●')):
                in_dom_block = False
                cleaned.append(line)
                continue
            # Still inside DOM dump: skip line
            continue

        cleaned.append(line)

    return '\n'.join(cleaned)


def clean_test_output(text: str) -> str:
    """Strip ANSI codes and collapse DOM dumps for cleaner test output display."""
    text = strip_ansi(text)
    text = collapse_dom_dumps(text)
    # Remove excessive blank lines (more than 2 in a row)
    text = re.sub(r'\n{4,}', '\n\n\n', text)
    return text.strip()


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
            framework="pytest",
            passed=passed,
            failed=failed,
            errors=errors,
            skipped=skipped,
            total=total,
            duration_seconds=duration,
            summary=summary,
            output=truncate_output(clean_test_output(combined_output)),
        )
    except subprocess.TimeoutExpired as exc:
        raw_out = (exc.stdout or "") + "\n" + (exc.stderr or "")
        return TestRunOutcome(
            success=False,
            framework="pytest",
            duration_seconds=float(timeout_seconds),
            summary=f"Test run timed out after {timeout_seconds}s",
            output=truncate_output(f"Timed out after {timeout_seconds} seconds:\n" + raw_out),
        )
    except FileNotFoundError as exc:
        return TestRunOutcome(
            success=False,
            framework="pytest",
            summary="Python executable or pytest not found",
            output=str(exc),
        )
    except Exception as exc:
        return TestRunOutcome(
            success=False,
            framework="pytest",
            summary=f"Execution error: {exc}",
            output=str(exc),
        )


def detect_test_framework(workspace_root: Path) -> tuple[str, str]:
    """Detect the testing framework based on workspace files.

    Returns (framework_id, display_name), e.g. ("npm", "npm test") or ("pytest", "pytest").
    """
    workspace_root = workspace_root.resolve()
    if not workspace_root.is_dir():
        return "pytest", "pytest"

    # 1. Node.js / JavaScript / TypeScript projects
    pkg_json = workspace_root / "package.json"
    if pkg_json.is_file():
        try:
            data = json.loads(pkg_json.read_text(encoding="utf-8"))
            scripts = data.get("scripts", {})
            test_script = scripts.get("test", "")
            if test_script and "no test specified" not in test_script.lower():
                return "npm", "npm test"
            deps = {**data.get("dependencies", {}), **data.get("devDependencies", {})}
            if "jest" in deps:
                return "jest", "jest"
            if "vitest" in deps:
                return "vitest", "vitest"
            if "mocha" in deps:
                return "mocha", "mocha"
        except Exception:
            pass
        return "npm", "npm test"

    # 2. Rust projects
    if (workspace_root / "Cargo.toml").is_file():
        return "cargo", "cargo test"

    # 3. Go projects
    if (workspace_root / "go.mod").is_file():
        return "go", "go test"

    # 4. Default: Python / pytest
    return "pytest", "pytest"


def parse_generic_test_output(
    stdout: str,
    stderr: str,
    returncode: int,
    framework: str = "test",
) -> tuple[int, int, int, int, int, float, str]:
    """Extract test counts and summary from npm/jest/node/cargo/go output."""
    combined = (stdout + "\n" + stderr).strip()

    passed = 0
    failed = 0
    errors = 0
    skipped = 0
    duration = 0.0

    # Jest / Vitest: "Tests:  3 passed, 1 failed, 4 total"
    m_jest_pass = re.search(r"Tests:\s+(\d+)\s+passed", combined, re.IGNORECASE)
    if m_jest_pass:
        passed = int(m_jest_pass.group(1))
    else:
        m_pass = re.search(r"(\d+)\s+passed", combined, re.IGNORECASE)
        if m_pass:
            passed = int(m_pass.group(1))

    m_jest_fail = re.search(r"Tests:\s+(\d+)\s+failed", combined, re.IGNORECASE)
    if m_jest_fail:
        failed = int(m_jest_fail.group(1))
    else:
        m_fail = re.search(r"(\d+)\s+failed", combined, re.IGNORECASE)
        if m_fail:
            failed = int(m_fail.group(1))

    # Mocha: "3 passing (120ms)", "1 failing"
    m_mocha_pass = re.search(r"(\d+)\s+passing", combined, re.IGNORECASE)
    if m_mocha_pass:
        passed = max(passed, int(m_mocha_pass.group(1)))
    m_mocha_fail = re.search(r"(\d+)\s+failing", combined, re.IGNORECASE)
    if m_mocha_fail:
        failed = max(failed, int(m_mocha_fail.group(1)))

    # Node test runner: "pass 3", "fail 1"
    m_node_pass = re.search(r"pass\s+(\d+)", combined)
    if m_node_pass:
        passed = max(passed, int(m_node_pass.group(1)))
    m_node_fail = re.search(r"fail\s+(\d+)", combined)
    if m_node_fail:
        failed = max(failed, int(m_node_fail.group(1)))

    # Cargo: "test result: ok. 3 passed; 0 failed"
    m_cargo = re.search(r"test result: (?:ok|FAILED)\.\s+(\d+)\s+passed;\s+(\d+)\s+failed", combined)
    if m_cargo:
        passed = int(m_cargo.group(1))
        failed = int(m_cargo.group(2))

    # Duration parsing
    m_dur = re.search(r"in\s+([0-9.]+)\s*s", combined)
    if m_dur:
        duration = float(m_dur.group(1))
    else:
        m_ms = re.search(r"\(([0-9.]+)\s*ms\)", combined)
        if m_ms:
            duration = float(m_ms.group(1)) / 1000.0

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
    elif returncode == 0:
        summary = f"{framework} passed"
    else:
        summary = f"{framework} failed (exit code {returncode})"

    return passed, failed, errors, skipped, total, duration, summary


def run_workspace_tests(
    workspace_root: Path,
    test_path: Optional[str] = None,
    timeout_seconds: int = 30,
    framework: Optional[str] = None,
) -> TestRunOutcome:
    """Execute workspace tests with auto-detected or specified framework."""
    workspace_root = workspace_root.resolve()
    if not workspace_root.is_dir():
        return TestRunOutcome(
            success=False,
            summary=f"Workspace root does not exist: {workspace_root}",
            output="",
        )

    # Normalize and detect test framework
    if not framework or framework == "auto":
        fw_id, fw_name = detect_test_framework(workspace_root)
    else:
        fw_lower = framework.lower().strip()
        if "npm" in fw_lower:
            fw_id, fw_name = "npm", "npm test"
        elif "jest" in fw_lower:
            fw_id, fw_name = "jest", "jest"
        elif "vitest" in fw_lower:
            fw_id, fw_name = "vitest", "vitest"
        elif "cargo" in fw_lower or "rust" in fw_lower:
            fw_id, fw_name = "cargo", "cargo test"
        elif "go" in fw_lower:
            fw_id, fw_name = "go", "go test"
        elif "node" in fw_lower:
            fw_id, fw_name = "node", "node --test"
        elif "pytest" in fw_lower or "python" in fw_lower:
            fw_id, fw_name = "pytest", "pytest"
        else:
            # Fallback: check workspace manifests before defaulting
            detected_id, detected_name = detect_test_framework(workspace_root)
            fw_id = detected_id
            fw_name = detected_name

    # If framework is pytest, delegate directly to run_pytest
    if fw_id == "pytest":
        return run_pytest(workspace_root, test_path, timeout_seconds)

    # Validate test_path against directory traversal
    if test_path:
        target = (workspace_root / test_path).resolve()
        try:
            target.relative_to(workspace_root)
        except ValueError:
            return TestRunOutcome(
                success=False,
                framework=fw_name,
                summary="Invalid test path: outside workspace root",
                output="Security error: Path traversal detected",
            )

    cmd = []
    run_env = {**os.environ, "CI": "true"}
    if fw_id == "npm":
        npm_bin = shutil.which("npm")
        if not npm_bin:
            return TestRunOutcome(
                success=False,
                framework="npm",
                summary="npm is not installed or not found on PATH",
                output="Please ensure Node.js and npm are installed.",
            )
        cmd = [npm_bin, "test", "--", "--watchAll=false"]
        if test_path:
            cmd.append(test_path)
    elif fw_id == "node":
        node_bin = shutil.which("node")
        if not node_bin:
            return TestRunOutcome(
                success=False,
                framework="node",
                summary="node is not installed or not found on PATH",
                output="Please ensure Node.js is installed.",
            )
        cmd = [node_bin, "--test"]
        if test_path:
            cmd.append(test_path)
    elif fw_id in ("jest", "vitest"):
        npx_bin = shutil.which("npx")
        if not npx_bin:
            return TestRunOutcome(
                success=False,
                framework=fw_id,
                summary=f"npx is not installed or not found on PATH",
                output="Please ensure Node.js is installed.",
            )
        cmd = [npx_bin, fw_id, "--watchAll=false"]
        if test_path:
            cmd.append(test_path)
    elif fw_id == "cargo":
        cargo_bin = shutil.which("cargo")
        if not cargo_bin:
            return TestRunOutcome(
                success=False,
                framework="cargo",
                summary="cargo is not installed or not found on PATH",
                output="Please ensure Rust and cargo are installed.",
            )
        cmd = [cargo_bin, "test"]
        if test_path:
            cmd.extend(["--", test_path])
    elif fw_id == "go":
        go_bin = shutil.which("go")
        if not go_bin:
            return TestRunOutcome(
                success=False,
                framework="go",
                summary="go is not installed or not found on PATH",
                output="Please ensure Go is installed.",
            )
        cmd = [go_bin, "test", test_path or "./..."]
    else:
        # Unknown framework: attempt auto-detect before pytest fallback
        detected_id, _ = detect_test_framework(workspace_root)
        if detected_id != "pytest":
            return run_workspace_tests(workspace_root, test_path, timeout_seconds, framework=detected_id)
        return run_pytest(workspace_root, test_path, timeout_seconds)

    # npm test / cargo test may need longer than the default 30s
    effective_timeout = max(timeout_seconds, 60) if fw_id in ("npm", "cargo") else timeout_seconds
    start_time = time.monotonic()
    try:
        proc = subprocess.run(
            cmd,
            cwd=str(workspace_root),
            capture_output=True,
            text=True,
            timeout=effective_timeout,
            encoding="utf-8",
            errors="replace",
            env=run_env,
        )
        elapsed = time.monotonic() - start_time
        combined_output = proc.stdout
        if proc.stderr:
            combined_output += "\n" + proc.stderr

        passed, failed, errors, skipped, total, duration, summary = parse_generic_test_output(
            proc.stdout, proc.stderr, proc.returncode, framework=fw_name
        )
        if duration == 0.0:
            duration = elapsed

        return TestRunOutcome(
            success=(proc.returncode == 0),
            framework=fw_name,
            passed=passed,
            failed=failed,
            errors=errors,
            skipped=skipped,
            total=total,
            duration_seconds=duration,
            summary=summary,
            output=truncate_output(clean_test_output(combined_output)),
        )
    except subprocess.TimeoutExpired as exc:
        raw_out = (exc.stdout or "") + "\n" + (exc.stderr or "")
        return TestRunOutcome(
            success=False,
            framework=fw_name,
            duration_seconds=float(timeout_seconds),
            summary=f"Test run timed out after {effective_timeout}s",
            output=truncate_output(f"Timed out after {timeout_seconds} seconds:\n" + raw_out),
        )
    except Exception as exc:
        return TestRunOutcome(
            success=False,
            framework=fw_name,
            summary=f"Execution error: {exc}",
            output=str(exc),
        )
