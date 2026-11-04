"""Voice command recognition service for hands-free workflow actions."""

import re
from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class CommandMatch:
    is_command: bool
    action: str  # "apply", "revert", "reject", "run_tests", "repair", "new_session", "stop_listening", "start_listening", "cancel", "none"
    confidence: float
    feedback_speech: str


# Spoken feedback messages for acknowledged commands
FEEDBACK_MESSAGES = {
    "apply": "Applying diffs now.",
    "revert": "Reverting changes.",
    "reject": "Rejecting proposed changes.",
    "run_tests": "Running workspace tests.",
    "repair": "Starting test auto-repair.",
    "new_session": "Starting a new session.",
    "stop_listening": "Stopping hands-free listening.",
    "start_listening": "Hands-free listening is on.",
    "auto_apply_on": "Auto-apply is on. Changes will be applied automatically.",
    "auto_apply_off": "Auto-apply is off.",
    "cancel": "Cancelled.",
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
    # Matches: "apply", "apply it", "apply all", "apply all changes", "apply all diffs",
    #          "accept", "accept all", "accept all changes", "accept all diffs", "accept them all",
    #          "looks good apply it", "looks good accept all", "yes apply", "confirm", "except all"
    apply_patterns = [
        r"^(?:please\s+|yes\s+|yeah\s+|yep\s+|sure\s+|can\s+you\s+|go\s+ahead\s+and\s+)?(?:looks?\s+good\s+(?:to\s+me\s+)?|looks?\s+great\s+)?(?:apply|accept|except)(?:\s+(?:it|all|everything|both|them|them\s+all|all\s+of\s+them|(?:all\s+)?(?:of\s+)?(?:the\s+)?(?:changes?|diffs?|code)))?(?:\s+please|\s+now|\s+thanks)?$",
        r"^(?:looks?\s+good(?:\s+to\s+me)?|looks?\s+great|confirmed?|accept\s+(?:all\s+)?changes?)$",
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
    # Matches: "revert", "revert it", "revert all", "revert changes", "undo", "undo changes", "rollback"
    revert_patterns = [
        r"^(?:please\s+|can\s+you\s+)?(?:revert|undo|rollback|discard)(?:\s+(?:it|all|everything|both|them|them\s+all|all\s+of\s+them|(?:all\s+)?(?:of\s+)?(?:the\s+)?(?:changes?|diffs?|code)))?(?:\s+please|\s+now|\s+thanks)?$",
    ]
    for pat in revert_patterns:
        if re.match(pat, clean):
            return CommandMatch(
                is_command=True,
                action="revert",
                confidence=0.95,
                feedback_speech=FEEDBACK_MESSAGES["revert"],
            )

    # 2b. REJECT DIFF COMMANDS
    # Matches: "reject", "reject it", "reject all", "reject changes", "reject all changes",
    #          "reject all diffs", "reject them all", "dismiss", "dismiss all", "dismiss all changes",
    #          "discard", "discard all", "don't apply", "don't apply it", "don't accept", "no"
    reject_patterns = [
        r"^(?:please\s+|can\s+you\s+|no\s+|nah\s+|nope\s+)?(?:reject|dismiss)(?:\s+(?:it|all|everything|both|them|them\s+all|all\s+of\s+them|(?:all\s+)?(?:of\s+)?(?:the\s+)?(?:changes?|diffs?|code)))?(?:\s+please|\s+now|\s+thanks)?$",
        r"^(?:no\s+)?(?:don't|do\s+not)\s+(?:apply|accept)(?:\s+(?:it|all|everything|both|them|them\s+all|(?:all\s+)?(?:of\s+)?(?:the\s+)?(?:changes?|diffs?|code)))?$",
        r"^(?:no|nope|nah)(?:\s+reject(?:\s+all)?)?$",
    ]
    for pat in reject_patterns:
        if re.match(pat, clean):
            return CommandMatch(
                is_command=True,
                action="reject",
                confidence=0.95,
                feedback_speech=FEEDBACK_MESSAGES["reject"],
            )

    # 3. RUN TESTS COMMANDS
    # Matches: "run tests", "run workspace tests", "test it", "check tests", "run the tests"
    test_patterns = [
        r"^(?:please\s+|can\s+you\s+)?(?:run|execute|check)\s+(?:the\s+)?(?:workspace\s+)?tests?(?:\s+please|\s+now)?$",
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
        r"^(?:please\s+|can\s+you\s+|yes\s+)?(?:auto[- ]?)?(?:fix|repair)(?:\s+(?:it|the\s+tests?|errors?|code|them))?(?:\s+please|\s+now)?$",
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

    # 6. STOP LISTENING COMMANDS
    # Matches: "stop listening", "pause listening", "stop hands free", "pause hands free", "disable hands free"
    stop_patterns = [
        r"^(?:please\s+|can\s+you\s+)?(?:stop\s+listening|pause\s+listening|stop\s+recording|pause\s+hands[- ]?free|disable\s+hands[- ]?free)$",
    ]
    for pat in stop_patterns:
        if re.match(pat, clean):
            return CommandMatch(
                is_command=True,
                action="stop_listening",
                confidence=0.95,
                feedback_speech=FEEDBACK_MESSAGES["stop_listening"],
            )

    # 7. START LISTENING COMMANDS
    # Matches: "start listening", "go hands free", "enable hands free", "hands free mode"
    start_patterns = [
        r"^(?:please\s+|can\s+you\s+)?(?:start\s+listening|go\s+hands[- ]?free|enable\s+hands[- ]?free|listen\s+to\s+me|hands[- ]?free\s+mode)$",
    ]
    for pat in start_patterns:
        if re.match(pat, clean):
            return CommandMatch(
                is_command=True,
                action="start_listening",
                confidence=0.95,
                feedback_speech=FEEDBACK_MESSAGES["start_listening"],
            )

    # 8. AUTO APPLY COMMANDS
    # Matches: "enable auto apply", "auto apply on", "turn on auto apply", "auto apply mode"
    auto_apply_on_patterns = [
        r"^(?:please\s+|can\s+you\s+)?(?:enable|turn\s+on|activate)\s+auto[- ]?apply$",
        r"^(?:auto[- ]?apply\s+(?:on|mode|please)|auto[- ]?apply)$",
    ]
    for pat in auto_apply_on_patterns:
        if re.match(pat, clean):
            return CommandMatch(
                is_command=True,
                action="auto_apply_on",
                confidence=0.95,
                feedback_speech=FEEDBACK_MESSAGES["auto_apply_on"],
            )

    auto_apply_off_patterns = [
        r"^(?:please\s+|can\s+you\s+)?(?:disable|turn\s+off|deactivate)\s+auto[- ]?apply$",
        r"^auto[- ]?apply\s+off$",
    ]
    for pat in auto_apply_off_patterns:
        if re.match(pat, clean):
            return CommandMatch(
                is_command=True,
                action="auto_apply_off",
                confidence=0.95,
                feedback_speech=FEEDBACK_MESSAGES["auto_apply_off"],
            )

    # 9. CANCEL COMMANDS
    # Matches: "cancel", "cancel that", "never mind", "abort"
    cancel_patterns = [
        r"^(?:please\s+)?(?:cancel(?:\s+that)?|never\s+mind|abort)$",
    ]
    for pat in cancel_patterns:
        if re.match(pat, clean):
            return CommandMatch(
                is_command=True,
                action="cancel",
                confidence=0.95,
                feedback_speech=FEEDBACK_MESSAGES["cancel"],
            )

    return CommandMatch(is_command=False, action="none", confidence=0.0, feedback_speech="")
