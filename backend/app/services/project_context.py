"""Project context: workspace scanning, language detection, and relevance scoring.

Design principles:
- No external deps: pure stdlib + pathspec (for .gitignore support)
- Scan is metadata-only (fast, no file contents read)
- Relevance is heuristic: keyword overlap + file-type weighting
- Snippets are bounded (head/tail/imports region, max lines/chars)
- All paths are workspace-relative; absolute paths never leave this module
"""

import fnmatch
import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

# Language detection by extension (common, not exhaustive)
EXT_TO_LANG = {
    ".py": "python",
    ".js": "javascript",
    ".jsx": "javascript",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".rs": "rust",
    ".go": "go",
    ".java": "java",
    ".kt": "kotlin",
    ".cpp": "cpp",
    ".cc": "cpp",
    ".cxx": "cpp",
    ".c": "c",
    ".h": "c",
    ".hpp": "cpp",
    ".cs": "csharp",
    ".rb": "ruby",
    ".php": "php",
    ".swift": "swift",
    ".scala": "scala",
    ".clj": "clojure",
    ".hs": "haskell",
    ".ml": "ocaml",
    ".fs": "fsharp",
    ".vue": "vue",
    ".svelte": "svelte",
    ".json": "json",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".toml": "toml",
    ".md": "markdown",
    ".sh": "bash",
    ".ps1": "powershell",
    ".sql": "sql",
    ".html": "html",
    ".css": "css",
    ".scss": "scss",
    ".less": "less",
    ".dockerfile": "dockerfile",
    ".tf": "terraform",
}

# Files/dirs to skip entirely (common build/cache/vendor)
SKIP_DIRS = {
    ".git", ".hg", ".svn",
    "node_modules", "vendor", "target", "dist", "build",
    "__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache",
    "venv", ".venv", "env", ".env",
    ".idea", ".vscode", ".vs",
    "coverage", ".coverage", "htmlcov",
    ".next", ".nuxt", ".svelte-kit",
    "site-packages", "bower_components",
}
SKIP_FILES = {
    ".gitignore", ".gitattributes", ".gitmodules",
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
    "Cargo.lock", "go.sum", "poetry.lock", "Pipfile.lock",
    "*.pyc", "*.pyo", "*.pyd", "*.so", "*.dll", "*.exe",
    "*.min.js", "*.min.css", "*.map",
    "*.log", "*.tmp", "*.temp", "*.swp", "*.swo",
    ".DS_Store", "Thumbs.db",
}


def detect_language(path: Path) -> Optional[str]:
    """Return language from file extension, or None."""
    return EXT_TO_LANG.get(path.suffix.lower())


def should_skip(path: Path, root: Path) -> bool:
    """Check if a path should be skipped (build artifacts, VCS, etc.)."""
    rel = path.relative_to(root)
    parts = set(rel.parts)
    if parts & SKIP_DIRS:
        return True
    name = path.name
    if name in SKIP_FILES:
        return True
    # Glob patterns for skip files
    for pat in SKIP_FILES:
        if "*" in pat and fnmatch.fnmatch(name, pat):
            return True
    return False


@dataclass
class ScanResult:
    root: Path
    languages: set[str] = field(default_factory=set)
    file_tree: dict = field(default_factory=dict)
    total_files: int = 0
    scanned_files: int = 0


def _build_tree_node(path: Path, root: Path, max_files: int, result: ScanResult) -> Optional[dict]:
    """Recursively build a file tree node, respecting max_files."""
    if result.scanned_files >= max_files:
        return None
    if should_skip(path, root):
        return None

    rel = path.relative_to(root)
    is_dir = path.is_dir()
    lang = None
    size = 0

    if not is_dir:
        lang = detect_language(path)
        if lang:
            result.languages.add(lang)
        try:
            size = path.stat().st_size
        except OSError:
            size = 0
        result.scanned_files += 1

    result.total_files += 1

    node = {
        "name": path.name,
        "path": str(rel),
        "is_dir": is_dir,
        "language": lang,
        "size_bytes": size,
        "children": [],
    }

    if is_dir:
        try:
            children = sorted(path.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower()))
        except (OSError, PermissionError):
            children = []
        for child in children:
            if result.scanned_files >= max_files and not child.is_dir():
                break
            child_node = _build_tree_node(child, root, max_files, result)
            if child_node:
                node["children"].append(child_node)

    return node


def scan_workspace(workspace_root: str, max_files: int = 5000) -> ScanResult:
    """Scan a workspace and return languages + file tree (metadata only)."""
    root = Path(workspace_root).resolve()
    if not root.exists() or not root.is_dir():
        raise ValueError(f"Workspace root does not exist or is not a directory: {root}")

    result = ScanResult(root=root)
    tree = _build_tree_node(root, root, max_files, result)
    result.file_tree = tree or {}
    return result


# ---------- Relevance Scoring ----------

# Keywords that indicate a file is likely relevant to a requirement
RELEVANCE_PATTERNS = [
    # Direct mentions
    (r"\b(model|schema|entity|table|database|db|orm|sql)\b", 3.0),
    (r"\b(api|endpoint|route|handler|controller|view)\b", 2.5),
    (r"\b(test|spec|fixture|mock)\b", 2.0),
    (r"\b(config|settings|env|configuration)\b", 1.5),
    (r"\b(util|helper|common|shared|core|base)\b", 1.0),
    # File types
    (r"test_.*\.py$|_test\.py$|\.spec\.(js|ts)$|_test\.(js|ts)$", 2.5),
    (r"conftest\.py$", 2.0),
    (r"__init__\.py$", 1.0),
]


def _tokenize(text: str) -> set[str]:
    """Extract alphanumeric tokens (lowercase, length >= 3)."""
    return {t.lower() for t in re.findall(r"[a-zA-Z0-9_]{3,}", text)}


def _path_tokens(path: str) -> set[str]:
    """Tokens from a file path (names, parent dirs)."""
    parts = re.split(r"[/\\._-]+", path)
    return {p.lower() for p in parts if len(p) >= 3}


def score_relevance(requirement_text: str, file_path: str, file_content: str = "") -> float:
    """
    Heuristic relevance score (higher = more relevant).
    Combines: requirement token overlap with path, path patterns, content overlap.
    """
    req_tokens = _tokenize(requirement_text)
    path_toks = _path_tokens(file_path)

    # 1. Direct token overlap between requirement and path
    overlap = req_tokens & path_toks
    score = len(overlap) * 2.0

    # 2. Path pattern bonuses
    for pattern, weight in RELEVANCE_PATTERNS:
        if re.search(pattern, file_path, re.IGNORECASE):
            score += weight

    # 3. Content overlap (if provided) - sample first/last 50 lines
    if file_content:
        content_tokens = _tokenize(file_content[:5000])  # cap sampling
        content_overlap = req_tokens & content_tokens
        score += len(content_overlap) * 0.5

    return score


# ---------- Snippet Extraction ----------

def extract_snippet(
    file_path: Path,
    max_lines: int = 200,
) -> tuple[str, int, int]:
    """
    Extract a bounded snippet from a file:
    - First 50 lines (imports, exports, class/function defs)
    - Last 50 lines (often tests or main logic)
    - Total capped at max_lines
    Returns (content, start_line, end_line) 1-indexed.
    """
    try:
        text = file_path.read_text(encoding="utf-8", errors="ignore")
    except (OSError, UnicodeDecodeError):
        return "", 0, 0

    lines = text.splitlines()
    total = len(lines)
    if total == 0:
        return "", 0, 0

    if total <= max_lines:
        return text, 1, total

    # Take head (imports/defs) and tail
    head_lines = min(80, max_lines // 2)
    tail_lines = max_lines - head_lines

    head = lines[:head_lines]
    tail = lines[-tail_lines:] if tail_lines > 0 else []

    # Find a good split point in head (last import or class/def)
    head_content = "\n".join(head)
    tail_content = "\n".join(tail)
    combined = head_content + ("\n\n... [truncated] ...\n\n" if tail else "") + tail_content

    start = 1
    end = head_lines + (tail_lines if tail else 0)
    return combined, start, end


def select_relevant_files(
    requirement_text: str,
    file_paths: list[str],
    workspace_root: Path,
    max_snippet_lines: int = 200,
    max_total_chars: int = 8000,
) -> tuple[list[dict], bool]:
    """
    Score and select relevant files, extract bounded snippets.
    Returns (snippets_list, was_truncated).
    """
    scored = []
    for rel_path in file_paths:
        abs_path = (workspace_root / rel_path).resolve()
        # Security: ensure path is inside workspace
        try:
            abs_path.relative_to(workspace_root)
        except ValueError:
            continue
        if not abs_path.is_file():
            continue

        lang = detect_language(abs_path)
        # Read content for scoring (sampled)
        try:
            content_sample = abs_path.read_text(encoding="utf-8", errors="ignore")[:5000]
        except (OSError, UnicodeDecodeError):
            content_sample = ""

        score = score_relevance(requirement_text, rel_path, content_sample)
        scored.append((score, rel_path, lang, abs_path))

    # Sort by score descending
    scored.sort(key=lambda x: x[0], reverse=True)

    snippets = []
    total_chars = 0
    truncated = False

    for score, rel_path, lang, abs_path in scored:
        if total_chars >= max_total_chars:
            truncated = True
            break

        content, start_line, end_line = extract_snippet(abs_path, max_snippet_lines)
        if not content:
            continue

        snippet_chars = len(content)
        if total_chars + snippet_chars > max_total_chars:
            # Try to fit a truncated version
            remaining = max_total_chars - total_chars
            if remaining > 200:  # only if meaningful
                content = content[:remaining] + "\n... [truncated by budget] ..."
                snippet_chars = len(content)
            else:
                truncated = True
                break

        snippets.append({
            "path": rel_path,
            "language": lang,
            "content": content,
            "start_line": start_line,
            "end_line": end_line,
        })
        total_chars += snippet_chars

    return snippets, truncated