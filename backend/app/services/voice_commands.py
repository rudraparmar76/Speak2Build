"""Voice command recognition service for hands-free workflow actions."""

import re
from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class CommandMatch:
    is_command: bool
    action: str  # "apply", "revert", "run_tests", "repair", "new_session", "none"
    confidence: float
    feedback_speech: str


# Spoken feedback messages for acknowledged commands
FEEDBACK_MESSAGES = {
    "apply": "Applying diffs now.",
    "revert": "Reverting changes.",
    "run_tests": "Running workspace tests.",
    "repair": "Starting test auto-repair.",
    "new_session": "Starting a new session.",
}

# Verbs / nouns that strongly indicate a coding task rather than a meta-command
CODING_INDICATORS = {
    "create", "add", "make", "build", "write", "implement", "update",
    "modify", "remove", "delete", "component", "function", "class", "endpoint",
    "route", "page", "button", "input", "form", "screen", "style", "css", "html",
    "import", "module", "variable", "database", "api", "table", "color"
}


def normalize_transcript(text: str) -> str:
    """Normalize spoken text: lowercased, stripped, punctuation cleaned."""
    text = text.lower().strip()
    # Remove trailing punctuation (periods, commas, exclamation/question marks)
    text = re.sub(r"[.,?!:;]+", " ", text)
    # Collapse multiple spaces
    text = re.sub(r"\s+", " ", text).strip()
    return text


def classify_voice_command(transcript: str) -> CommandMatch:
    """Classify a spoken transcript into an actionable command or regular task.

    Returns CommandMatch with is_command=True if confident, False otherwise.
    """
    clean = normalize_transcript(transcript)
    if not clean:
        return CommandMatch(is_command=False, action="none", confidence=0.0, feedback_speech="")

    words = clean.split()

    # Heuristic 1: Commands are concise (typically 1 to 5 words).
    # If longer than 6 words and contains coding indicators, it's a coding instruction.
    if len(words) > 6 and any(w in CODING_INDICATORS for w in words):
        return CommandMatch(is_command=False, action="none", confidence=0.0, feedback_speech="")

    # 1. APPLY DIFF COMMANDS
    # Matches: "apply", "apply it", "apply changes", "looks good apply it", "accept changes", "yes apply"
    apply_patterns = [
        r"^(?:please\s+)?(?:yes\s+)?(?:looks?\s+good\s+)?(?:apply|accept)(?:\s+(?:it|all|(?:the\s+)?diffs?|(?:the\s+)?changes?|them))?$",
        r"^(?:looks?\s+good|confirmed?|accept\s+changes?)$",
    ]
    for pat in apply_patterns:
        if re.match(pat, clean):
            # Guard against "apply a blue background" or "apply color"
            if not any(w in clean for w in ["background", "color", "style", "to", "in"]):
                return CommandMatch(
                    is_command=True,
                    action="apply",
                    confidence=0.95,
                    feedback_speech=FEEDBACK_MESSAGES["apply"],
                )

    # 2. REVERT DIFF COMMANDS
    # Matches: "revert", "revert it", "revert changes", "undo", "undo changes", "rollback", "discard"
    revert_patterns = [
        r"^(?:please\s+)?(?:revert|undo|rollback|discard)(?:\s+(?:it|all|(?:the\s+)?diffs?|(?:the\s+)?changes?|them))?$",
    ]
    for pat in revert_patterns:
        if re.match(pat, clean):
            return CommandMatch(
                is_command=True,
                action="revert",
                confidence=0.95,
                feedback_speech=FEEDBACK_MESSAGES["revert"],
            )

    # 3. RUN TESTS COMMANDS
    # Matches: "run tests", "run workspace tests", "test it", "check tests", "run the tests"
    test_patterns = [
        r"^(?:please\s+)?(?:run|execute|check)\s+(?:the\s+)?(?:workspace\s+)?tests?$",
        r"^(?:test\s+it|run\s+tests?|check\s+the\s+tests?)$",
    ]
    for pat in test_patterns:
        if re.match(pat, clean):
            return CommandMatch(
                is_command=True,
                action="run_tests",
                confidence=0.95,
                feedback_speech=FEEDBACK_MESSAGES["run_tests"],
            )

    # 4. AUTO REPAIR COMMANDS
    # Matches: "fix it", "auto repair", "repair tests", "fix the tests", "yes fix it", "repair code"
    repair_patterns = [
        r"^(?:please\s+)?(?:yes\s+)?(?:auto[- ]?)?(?:fix|repair)(?:\s+(?:it|the\s+tests?|errors?|code|them))?$",
        r"^(?:yes\s+please|yes\s+fix|auto\s+repair\s+tests?)$",
    ]
    for pat in repair_patterns:
        if re.match(pat, clean):
            # Guard against "fix the bug in login.py" (specific code repair instruction)
            if not any(w in clean for w in ["in", "at", "file", ".py", ".js", ".ts"]):
                return CommandMatch(
                    is_command=True,
                    action="repair",
                    confidence=0.92,
                    feedback_speech=FEEDBACK_MESSAGES["repair"],
                )

    # 5. NEW SESSION COMMANDS
    # Matches: "new session", "start new session", "start over", "clear session", "reset session"
    session_patterns = [
        r"^(?:please\s+)?(?:start\s+a?\s*)?(?:new|fresh)\s+session$",
        r"^(?:start\s+over|reset\s+(?:session|all)|clear\s+session)$",
    ]
    for pat in session_patterns:
        if re.match(pat, clean):
            return CommandMatch(
                is_command=True,
                action="new_session",
                confidence=0.95,
                feedback_speech=FEEDBACK_MESSAGES["new_session"],
            )

    return CommandMatch(is_command=False, action="none", confidence=0.0, feedback_speech="")
