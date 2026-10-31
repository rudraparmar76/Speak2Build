import tempfile
import subprocess
from pathlib import Path

# Test the full git diff format
diff = """diff --git a/src/email_validator.py b/src/email_validator.py
new file mode 100644
index 0000000..2521db1
--- /dev/null
+++ b/src/email_validator.py
@@ -0,0 +1,10 @@
+import re
+from typing import Optional
+
+EMAIL_RE = re.compile(r'^[^@]+@[^@]+\\.[^@]+$')
+
+def validate_email(email: str) -> bool:
+    \"\"\"Validate email format.\"\"\"
+    if not email:
+        return False
+    return bool(EMAIL_RE.match(email))
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
    print('Full git diff format: returncode=', result.returncode, 'stderr=', result.stderr.strip())
    
    import os
    try:
        os.unlink(patch_path)
    except:
        pass