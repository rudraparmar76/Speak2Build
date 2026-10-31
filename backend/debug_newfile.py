import tempfile
import subprocess
from pathlib import Path

with tempfile.TemporaryDirectory() as d:
    tmp = Path(d)
    (tmp / 'src').mkdir()
    
    # Test various new file diff formats
    formats = [
        # Format 1: /dev/null
        """--- /dev/null
+++ b/src/email_validator.py
@@ -0,0 +1,3 @@
+import re
+def validate_email(email: str) -> bool:
+    return True
""",
        # Format 2: a/ with 0,0
        """--- a/src/email_validator.py
+++ b/src/email_validator.py
@@ -0,0 +1,3 @@
+import re
+def validate_email(email: str) -> bool:
+    return True
""",
        # Format 3: just +++ b/
        """+++ b/src/email_validator.py
@@ -0,0 +1,3 @@
+import re
+def validate_email(email: str) -> bool:
+    return True
""",
    ]
    
    for i, diff in enumerate(formats):
        with tempfile.NamedTemporaryFile(mode='w', suffix='.patch', delete=False) as f:
            f.write(diff)
            patch_path = f.name
        
        result = subprocess.run(
            ['git', 'apply', '--check', patch_path],
            capture_output=True, text=True, timeout=10, cwd=tmp
        )
        print(f'Format {i+1}: returncode={result.returncode}, stderr={result.stderr.strip()}')
        
        import os
        try:
            os.unlink(patch_path)
        except:
            pass