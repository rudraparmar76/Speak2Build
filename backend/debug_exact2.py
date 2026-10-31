import tempfile
import subprocess
from pathlib import Path

# Exact content from VALID_DIFFS_JSON first diff
content = """import re
from typing import Optional

EMAIL_RE = re.compile(r'^[^@]+@[^@]+\\.[^@]+$')

def validate_email(email: str) -> bool:
    \"\"\"Validate email format.\"\"\"
    if not email:
        return False
    return bool(EMAIL_RE.match(email))"""

print(f'Content lines: {content.count(chr(10)) + 1}')

# Test with /dev/null format
diff = f"""--- /dev/null
+++ b/src/email_validator.py
@@ -0,0 +1,{content.count(chr(10)) + 1} @@
{content}
"""

with tempfile.TemporaryDirectory() as d:
    tmp = Path(d)
    (tmp / 'src').mkdir()
    with tempfile.NamedTemporaryFile(mode='w', suffix='.patch', delete=False) as f:
        f.write(diff)
        patch_path = f.name
    
    result = subprocess.run(
        ['git', 'apply', '--check', patch_path],
        capture_output=True, text=True, timeout=10, cwd=tmp
    )
    print('Test exact content: returncode=', result.returncode, 'stderr=', result.stderr.strip())
    
    import os
    try:
        os.unlink(patch_path)
    except:
        pass

# Also test with the full git diff header
diff2 = f"""diff --git a/src/email_validator.py b/src/email_validator.py
new file mode 100644
index 0000000..2521db1
--- /dev/null
+++ b/src/email_validator.py
@@ -0,0 +1,{content.count(chr(10)) + 1} @@
{content}
"""

with tempfile.TemporaryDirectory() as d:
    tmp = Path(d)
    (tmp / 'src').mkdir()
    with tempfile.NamedTemporaryFile(mode='w', suffix='.patch', delete=False) as f:
        f.write(diff2)
        patch_path = f.name
    
    result = subprocess.run(
        ['git', 'apply', '--check', patch_path],
        capture_output=True, text=True, timeout=10, cwd=tmp
    )
    print('Full git diff: returncode=', result.returncode, 'stderr=', result.stderr.strip())
    
    try:
        os.unlink(patch_path)
    except:
        pass