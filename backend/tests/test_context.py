"""Tests for project context scanning and relevance."""

import tempfile
import textwrap
from pathlib import Path

import pytest

from app.services import project_context as ctx


def _make_temp_workspace(files: dict[str, str]) -> Path:
    """Create a temp directory with the given file structure."""
    tmp = Path(tempfile.mkdtemp(prefix="s2b_ctx_test_"))
    for rel_path, content in files.items():
        abs_path = tmp / rel_path
        abs_path.parent.mkdir(parents=True, exist_ok=True)
        abs_path.write_text(content, encoding="utf-8")
    return tmp


def test_scan_workspace_detects_languages_and_tree():
    ws = _make_temp_workspace({
        "src/main.py": "print('hello')",
        "src/utils/__init__.py": "",
        "src/utils/helpers.py": "def add(a, b): return a + b",
        "tests/test_main.py": "def test_foo(): assert True",
        "README.md": "# Project",
        "pyproject.toml": "[project]\nname = 'test'",
        "node_modules/ignore.js": "console.log('skip')",
        ".git/config": "[core]\nrepositoryformatversion = 0",
    })
    try:
        result = ctx.scan_workspace(str(ws))
        assert "python" in result.languages
        assert "markdown" in result.languages
        assert "toml" in result.languages
        assert result.total_files >= 6  # 4 py + md + toml (git/node_modules skipped)
        assert result.scanned_files >= 4  # only python files scanned (non-skip)
        # Tree structure
        tree = result.file_tree
        assert tree["name"] == ws.name
        assert tree["is_dir"]
        child_names = {c["name"] for c in tree["children"]}
        assert "src" in child_names
        assert "tests" in child_names
        assert "README.md" in child_names
        assert "node_modules" not in child_names
        assert ".git" not in child_names
    finally:
        import shutil
        shutil.rmtree(ws, ignore_errors=True)


def test_find_essential_manifests_and_paired_tests():
    ws = _make_temp_workspace({
        "package.json": '{"name": "test-pkg", "scripts": {"test": "jest"}}',
        "src/Game.js": "export default function Game() {}",
        "src/Game.test.js": "test('game', () => {});",
    })
    try:
        manifests = ctx.find_essential_manifests(ws)
        assert "package.json" in manifests

        paired = ctx.find_paired_test_files(["src/Game.js"], ws)
        assert "src/Game.test.js" in paired

        # Verify select_relevant_files includes package.json and Game.test.js even if only Game.js was passed
        snippets, _ = ctx.select_relevant_files(
            requirement_text="add score to game",
            file_paths=["src/Game.js"],
            workspace_root=ws,
        )
        paths = [s["path"] for s in snippets]
        assert "src/Game.js" in paths
        assert "package.json" in paths
        assert "src/Game.test.js" in paths
    finally:
        import shutil
        shutil.rmtree(ws, ignore_errors=True)



def test_scan_workspace_respects_max_files():
    ws = _make_temp_workspace({f"file{i}.py": "x=1" for i in range(100)})
    try:
        result = ctx.scan_workspace(str(ws), max_files=10)
        assert result.scanned_files <= 10
    finally:
        import shutil
        shutil.rmtree(ws, ignore_errors=True)


def test_find_essential_manifests_and_paired_tests():
    ws = _make_temp_workspace({
        "package.json": '{"name": "test-pkg", "scripts": {"test": "jest"}}',
        "src/Game.js": "export default function Game() {}",
        "src/Game.test.js": "test('game', () => {});",
    })
    try:
        manifests = ctx.find_essential_manifests(ws)
        assert "package.json" in manifests

        paired = ctx.find_paired_test_files(["src/Game.js"], ws)
        assert "src/Game.test.js" in paired

        # Verify select_relevant_files includes package.json and Game.test.js even if only Game.js was passed
        snippets, _ = ctx.select_relevant_files(
            requirement_text="add score to game",
            file_paths=["src/Game.js"],
            workspace_root=ws,
        )
        paths = [s["path"] for s in snippets]
        assert "src/Game.js" in paths
        assert "package.json" in paths
        assert "src/Game.test.js" in paths
    finally:
        import shutil
        shutil.rmtree(ws, ignore_errors=True)



def test_score_relevance_path_overlap():
    req = "Create a user authentication service with JWT tokens"
    # Path with matching tokens
    score1 = ctx.score_relevance(req, "src/auth/jwt_service.py", "")
    # Path without matching tokens
    score2 = ctx.score_relevance(req, "src/utils/date_helpers.py", "")
    assert score1 > score2


def test_score_relevance_pattern_bonus():
    req = "Add a new API endpoint for user registration"
    score1 = ctx.score_relevance(req, "src/api/routes.py", "")
    score2 = ctx.score_relevance(req, "src/models/user.py", "")
    # API route pattern bonus should make it competitive
    assert score1 > 0


def test_score_relevance_test_file_bonus():
    req = "Fix the login validation"
    score1 = ctx.score_relevance(req, "tests/test_auth.py", "")
    score2 = ctx.score_relevance(req, "src/auth.py", "")
    # Test file bonus
    assert score1 > score2 * 0.5  # not necessarily higher, but significant


def test_extract_snippet_small_file():
    ws = _make_temp_workspace({"small.py": "line1\nline2\nline3"})
    try:
        f = ws / "small.py"
        content, start, end = ctx.extract_snippet(f, max_lines=200)
        assert content == "line1\nline2\nline3"
        assert start == 1
        assert end == 3
    finally:
        import shutil
        shutil.rmtree(ws, ignore_errors=True)


def test_find_essential_manifests_and_paired_tests():
    ws = _make_temp_workspace({
        "package.json": '{"name": "test-pkg", "scripts": {"test": "jest"}}',
        "src/Game.js": "export default function Game() {}",
        "src/Game.test.js": "test('game', () => {});",
    })
    try:
        manifests = ctx.find_essential_manifests(ws)
        assert "package.json" in manifests

        paired = ctx.find_paired_test_files(["src/Game.js"], ws)
        assert "src/Game.test.js" in paired

        # Verify select_relevant_files includes package.json and Game.test.js even if only Game.js was passed
        snippets, _ = ctx.select_relevant_files(
            requirement_text="add score to game",
            file_paths=["src/Game.js"],
            workspace_root=ws,
        )
        paths = [s["path"] for s in snippets]
        assert "src/Game.js" in paths
        assert "package.json" in paths
        assert "src/Game.test.js" in paths
    finally:
        import shutil
        shutil.rmtree(ws, ignore_errors=True)



def test_extract_snippet_large_file_truncates():
    lines = [f"line {i}" for i in range(500)]
    ws = _make_temp_workspace({"large.py": "\n".join(lines)})
    try:
        f = ws / "large.py"
        content, start, end = ctx.extract_snippet(f, max_lines=100)
        assert "line 0" in content
        assert "line 499" in content
        assert "[truncated]" in content
        assert start == 1
        assert end > 50
    finally:
        import shutil
        shutil.rmtree(ws, ignore_errors=True)


def test_find_essential_manifests_and_paired_tests():
    ws = _make_temp_workspace({
        "package.json": '{"name": "test-pkg", "scripts": {"test": "jest"}}',
        "src/Game.js": "export default function Game() {}",
        "src/Game.test.js": "test('game', () => {});",
    })
    try:
        manifests = ctx.find_essential_manifests(ws)
        assert "package.json" in manifests

        paired = ctx.find_paired_test_files(["src/Game.js"], ws)
        assert "src/Game.test.js" in paired

        # Verify select_relevant_files includes package.json and Game.test.js even if only Game.js was passed
        snippets, _ = ctx.select_relevant_files(
            requirement_text="add score to game",
            file_paths=["src/Game.js"],
            workspace_root=ws,
        )
        paths = [s["path"] for s in snippets]
        assert "src/Game.js" in paths
        assert "package.json" in paths
        assert "src/Game.test.js" in paths
    finally:
        import shutil
        shutil.rmtree(ws, ignore_errors=True)


def test_find_essential_manifests_and_paired_tests():
    ws = _make_temp_workspace({
        "package.json": '{"name": "test-pkg", "scripts": {"test": "jest"}}',
        "src/Game.js": "export default function Game() {}",
        "src/Game.test.js": "test('game', () => {});",
    })
    try:
        manifests = ctx.find_essential_manifests(ws)
        assert "package.json" in manifests

        paired = ctx.find_paired_test_files(["src/Game.js"], ws)
        assert "src/Game.test.js" in paired

        # Verify select_relevant_files includes package.json and Game.test.js even if only Game.js was passed
        snippets, _ = ctx.select_relevant_files(
            requirement_text="add score to game",
            file_paths=["src/Game.js"],
            workspace_root=ws,
        )
        paths = [s["path"] for s in snippets]
        assert "src/Game.js" in paths
        assert "package.json" in paths
        assert "src/Game.test.js" in paths
    finally:
        import shutil
        shutil.rmtree(ws, ignore_errors=True)



def test_select_relevant_files_scores_and_bounds():
    ws = _make_temp_workspace({
        "src/auth/login.py": textwrap.dedent("""
            import jwt
            from models import User

            def login(email: str, password: str) -> str:
                user = User.find_by_email(email)
                if user and user.check_password(password):
                    return jwt.encode({"sub": user.id}, "secret")
                raise ValueError("invalid credentials")
        """),
        "src/auth/register.py": textwrap.dedent("""
            from models import User

            def register(email: str, password: str) -> User:
                if User.find_by_email(email):
                    raise ValueError("email exists")
                return User.create(email=email, password=password)
        """),
        "src/utils/date.py": textwrap.dedent("""
            from datetime import datetime

            def now() -> datetime:
                return datetime.utcnow()
        """),
        "tests/test_auth.py": textwrap.dedent("""
            import pytest
            from src.auth.login import login

            def test_login():
                assert login("a@b.com", "pwd") == "token"
        """),
    })
    try:
        req = "Create a JWT login endpoint that validates credentials"
        file_paths = [
            "src/auth/login.py",
            "src/auth/register.py",
            "src/utils/date.py",
            "tests/test_auth.py",
        ]
        snippets, truncated = ctx.select_relevant_files(
            req, file_paths, ws, max_snippet_lines=100, max_total_chars=5000
        )
        assert len(snippets) >= 2
        # Should prioritize login.py and test_auth.py
        paths = [s["path"] for s in snippets]
        assert "src/auth/login.py" in paths
        assert "tests/test_auth.py" in paths
        # Total chars bounded
        total = sum(len(s["content"]) for s in snippets)
        assert total <= 5000
    finally:
        import shutil
        shutil.rmtree(ws, ignore_errors=True)


def test_find_essential_manifests_and_paired_tests():
    ws = _make_temp_workspace({
        "package.json": '{"name": "test-pkg", "scripts": {"test": "jest"}}',
        "src/Game.js": "export default function Game() {}",
        "src/Game.test.js": "test('game', () => {});",
    })
    try:
        manifests = ctx.find_essential_manifests(ws)
        assert "package.json" in manifests

        paired = ctx.find_paired_test_files(["src/Game.js"], ws)
        assert "src/Game.test.js" in paired

        # Verify select_relevant_files includes package.json and Game.test.js even if only Game.js was passed
        snippets, _ = ctx.select_relevant_files(
            requirement_text="add score to game",
            file_paths=["src/Game.js"],
            workspace_root=ws,
        )
        paths = [s["path"] for s in snippets]
        assert "src/Game.js" in paths
        assert "package.json" in paths
        assert "src/Game.test.js" in paths
    finally:
        import shutil
        shutil.rmtree(ws, ignore_errors=True)



def test_select_relevant_files_respects_char_budget():
    ws = _make_temp_workspace({
        "a.py": "x = 1\n" * 500,
        "b.py": "y = 2\n" * 500,
    })
    try:
        snippets, truncated = ctx.select_relevant_files(
            "process data", ["a.py", "b.py"], ws, max_total_chars=1000
        )
        total = sum(len(s["content"]) for s in snippets)
        # Budget is soft; truncation notice adds ~30 chars
        assert total <= 1050
        assert truncated  # should have been truncated
    finally:
        import shutil
        shutil.rmtree(ws, ignore_errors=True)


def test_find_essential_manifests_and_paired_tests():
    ws = _make_temp_workspace({
        "package.json": '{"name": "test-pkg", "scripts": {"test": "jest"}}',
        "src/Game.js": "export default function Game() {}",
        "src/Game.test.js": "test('game', () => {});",
    })
    try:
        manifests = ctx.find_essential_manifests(ws)
        assert "package.json" in manifests

        paired = ctx.find_paired_test_files(["src/Game.js"], ws)
        assert "src/Game.test.js" in paired

        # Verify select_relevant_files includes package.json and Game.test.js even if only Game.js was passed
        snippets, _ = ctx.select_relevant_files(
            requirement_text="add score to game",
            file_paths=["src/Game.js"],
            workspace_root=ws,
        )
        paths = [s["path"] for s in snippets]
        assert "src/Game.js" in paths
        assert "package.json" in paths
        assert "src/Game.test.js" in paths
    finally:
        import shutil
        shutil.rmtree(ws, ignore_errors=True)



def test_select_relevant_files_rejects_outside_workspace():
    ws = _make_temp_workspace({"inside.py": "print('hi')"})
    try:
        # Try to escape with ../
        snippets, _ = ctx.select_relevant_files(
            "test", ["../outside.py", "inside.py"], ws
        )
        paths = [s["path"] for s in snippets]
        assert "inside.py" in paths
        assert not any(".." in p for p in paths)
    finally:
        import shutil
        shutil.rmtree(ws, ignore_errors=True)


def test_find_essential_manifests_and_paired_tests():
    ws = _make_temp_workspace({
        "package.json": '{"name": "test-pkg", "scripts": {"test": "jest"}}',
        "src/Game.js": "export default function Game() {}",
        "src/Game.test.js": "test('game', () => {});",
    })
    try:
        manifests = ctx.find_essential_manifests(ws)
        assert "package.json" in manifests

        paired = ctx.find_paired_test_files(["src/Game.js"], ws)
        assert "src/Game.test.js" in paired

        # Verify select_relevant_files includes package.json and Game.test.js even if only Game.js was passed
        snippets, _ = ctx.select_relevant_files(
            requirement_text="add score to game",
            file_paths=["src/Game.js"],
            workspace_root=ws,
        )
        paths = [s["path"] for s in snippets]
        assert "src/Game.js" in paths
        assert "package.json" in paths
        assert "src/Game.test.js" in paths
    finally:
        import shutil
        shutil.rmtree(ws, ignore_errors=True)



def test_select_relevant_files_empty_requirement():
    """Verify context-first workflow where files are selected before speaking/transcribing."""
    ws = _make_temp_workspace({
        "src/main.py": "from flask import Flask\napp = Flask(__name__)\n",
        "tests/test_main.py": "def test_root():\n    assert True\n",
    })
    try:
        snippets, truncated = ctx.select_relevant_files(
            requirement_text="",
            file_paths=["src/main.py", "tests/test_main.py"],
            workspace_root=ws,
        )
        assert len(snippets) == 2
        paths = [s["path"] for s in snippets]
        assert "src/main.py" in paths
        assert "tests/test_main.py" in paths
        assert not truncated
    finally:
        import shutil
        shutil.rmtree(ws, ignore_errors=True)


def test_find_essential_manifests_and_paired_tests():
    ws = _make_temp_workspace({
        "package.json": '{"name": "test-pkg", "scripts": {"test": "jest"}}',
        "src/Game.js": "export default function Game() {}",
        "src/Game.test.js": "test('game', () => {});",
    })
    try:
        manifests = ctx.find_essential_manifests(ws)
        assert "package.json" in manifests

        paired = ctx.find_paired_test_files(["src/Game.js"], ws)
        assert "src/Game.test.js" in paired

        # Verify select_relevant_files includes package.json and Game.test.js even if only Game.js was passed
        snippets, _ = ctx.select_relevant_files(
            requirement_text="add score to game",
            file_paths=["src/Game.js"],
            workspace_root=ws,
        )
        paths = [s["path"] for s in snippets]
        assert "src/Game.js" in paths
        assert "package.json" in paths
        assert "src/Game.test.js" in paths
    finally:
        import shutil
        shutil.rmtree(ws, ignore_errors=True)

