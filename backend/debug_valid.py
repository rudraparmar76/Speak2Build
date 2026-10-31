import json
from app.services import code_generation as cg
import tempfile
from pathlib import Path

VALID = {
    "diffs": [
        {
            "path": "src/email_validator.py",
            "language": "python",
            "unified_diff": "--- a/src/email_validator.py\n+++ b/src/email_validator.py\n@@ -0,0 +1,25 @@\n+import re\n+from typing import Optional\n+\n+EMAIL_RE = re.compile(r'^[^@]+@[^@]+\\.[^@]+$')\n+\n+\ndef validate_email(email: str) -> bool:\n+    \"\"\"Validate email format.\"\"\"\n+    if not email:\n+        return False\n+    return bool(EMAIL_RE.match(email))\n",
            "is_new_file": True
        },
        {
            "path": "tests/test_email_validator.py",
            "language": "python",
            "unified_diff": "--- a/tests/test_email_validator.py\n+++ b/tests/test_email_validator.py\n@@ -0,0 +1,20 @@\n+import pytest\n+from src.email_validator import validate_email\n+\n+\n+def test_valid_email():\n+    assert validate_email('user@example.com')\n+\n+\n+def test_invalid_email():\n+    assert not validate_email('not-an-email')\n",
            "is_new_file": True
        }
    ],
    "summary": "Created email validator with regex and tests"
}

with tempfile.TemporaryDirectory() as d:
    tmp = Path(d)
    (tmp / 'src').mkdir()
    (tmp / 'tests').mkdir()
    
    diffs = [cg.FileDiff.model_validate(d) for d in VALID["diffs"]]
    errors = cg.validate_all_diffs(diffs, tmp)
    print('Validation errors for VALID diffs:', errors)