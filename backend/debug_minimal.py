import tempfile
import subprocess
from pathlib import Path

# Test minimal working diff
with tempfile.TemporaryDirectory() as d:
    tmp = Path(d)
    (tmp / 'src').mkdir()
    
    diff = """--- /dev/null
+++ b/src/email_validator.py
@@ -0,0 +1,3 @@
+import re
+def validate_email(email: str) -> bool:
+    return True
"""
    with tempfile.NamedTemporaryFile(mode='w', suffix='.patch', delete=False) as f:
        f.write(diff)
        patch_path = f.name
    
    result = subprocess.run(
        ['git', 'apply', '--check', patch_path],
        capture_output=True, text=True, timeout=10, cwd=tmp
    )
    print('Minimal: returncode=', result.returncode, 'stderr=', result.stderr.strip())
    
    import os
    try:
        os.unlink(patch_path)
    except:
        pass

# Try with blank line after header
diff2 = """--- /dev/null
+++ b/src/email_validator.py
@@ -0,0 +1,3 @@

+import re
+def validate_email(email: str) -> bool:
+    return True
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
    print('With blank line: returncode=', result.returncode, 'stderr=', result.stderr.strip())
    
    try:
        os.unlink(patch_path)
    except:
        pass