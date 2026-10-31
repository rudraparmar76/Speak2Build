import tempfile
import subprocess
from pathlib import Path

# The actual content from VALID_DIFFS_JSON first diff
content1 = """import re
from typing import Optional

EMAIL_RE = re.compile(r'^[^@]+@[^@]+\\.[^@]+$')

def validate_email(email: str) -> bool:
    \"\"\"Validate email format.\"\"\"
    if not email:
        return False
    return bool(EMAIL_RE.match(email))"""

lines1 = content1.count('\n') + 1
print(f'Content1 lines: {lines1}')

# Build diff with correct line count
diff1 = f"""--- /dev/null
+++ b/src/email_validator.py
@@ -0,0 +1,{lines1} @@
{content1}
"""

with tempfile.TemporaryDirectory() as d:
    tmp = Path(d)
    (tmp / 'src').mkdir()
    with tempfile.NamedTemporaryFile(mode='w', suffix='.patch', delete=False) as f:
        f.write(diff1)
        patch_path = f.name
    
    result = subprocess.run(
        ['git', 'apply', '--check', patch_path],
        capture_output=True, text=True, timeout=10, cwd=tmp
    )
    print(f'Diff1 (line count {lines1}): returncode=', result.returncode, 'stderr=', result.stderr.strip())
    
    import os
    try:
        os.unlink(patch_path)
    except:
        pass

# Second diff
content2 = """import pytest
from src.email_validator import validate_email


def test_valid_email():
    assert validate_email('user@example.com')


def test_invalid_email():
    assert not validate_email('not-an-email')"""

lines2 = content2.count('\n') + 1
print(f'Content2 lines: {lines2}')

diff2 = f"""--- /dev/null
+++ b/tests/test_email_validator.py
@@ -0,0 +1,{lines2} @@
{content2}
"""

with tempfile.TemporaryDirectory() as d:
    tmp = Path(d)
    (tmp / 'tests').mkdir()
    with tempfile.NamedTemporaryFile(mode='w', suffix='.patch', delete=False) as f:
        f.write(diff2)
        patch_path = f.name
    
    result = subprocess.run(
        ['git', 'apply', '--check', patch_path],
        capture_output=True, text=True, timeout=10, cwd=tmp
    )
    print(f'Diff2 (line count {lines2}): returncode=', result.returncode, 'stderr=', result.stderr.strip())
    
    try:
        os.unlink(patch_path)
    except:
        pass