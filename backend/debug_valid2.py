import tempfile
import subprocess
from pathlib import Path

with tempfile.TemporaryDirectory() as d:
    tmp = Path(d)
    (tmp / 'src').mkdir()
    (tmp / 'tests').mkdir()
    
    diff1 = """--- /dev/null
+++ b/src/email_validator.py
@@ -0,0 +1,25 @@
+import re
+from typing import Optional

+EMAIL_RE = re.compile(r'^[^@]+@[^@]+\\.[^@]+$')

+def validate_email(email: str) -> bool:
+    \"\"\"Validate email format.\"\"\"
+    if not email:
+        return False
+    return bool(EMAIL_RE.match(email))
"""
    
    with tempfile.NamedTemporaryFile(mode='w', suffix='.patch', delete=False) as f:
        f.write(diff1)
        patch_path = f.name
    
    result = subprocess.run(
        ['git', 'apply', '--check', patch_path],
        capture_output=True, text=True, timeout=10, cwd=tmp
    )
    print('Diff1: returncode=', result.returncode, 'stderr=', result.stderr.strip())
    
    import os
    try:
        os.unlink(patch_path)
    except:
        pass

# Now with actual line count
with tempfile.TemporaryDirectory() as d:
    tmp = Path(d)
    (tmp / 'src').mkdir()
    (tmp / 'tests').mkdir()
    
    # Count actual lines in the content
    content = """import re
from typing import Optional

EMAIL_RE = re.compile(r'^[^@]+@[^@]+\\.[^@]+$')

def validate_email(email: str) -> bool:
    \"\"\"Validate email format.\"\"\"
    if not email:
        return False
    return bool(EMAIL_RE.match(email))"""
    lines = content.count('\n') + 1
    print(f'Actual lines: {lines}')
    
    diff2 = f"""--- /dev/null
+++ b/src/email_validator.py
@@ -0,0 +1,{lines} @@
{content}
"""
    
    with tempfile.NamedTemporaryFile(mode='w', suffix='.patch', delete=False) as f:
        f.write(diff2)
        patch_path = f.name
    
    result = subprocess.run(
        ['git', 'apply', '--check', patch_path],
        capture_output=True, text=True, timeout=10, cwd=tmp
    )
    print('Diff2 (correct line count): returncode=', result.returncode, 'stderr=', result.stderr.strip())
    
    try:
        os.unlink(patch_path)
    except:
        pass