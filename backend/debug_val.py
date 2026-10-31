import tempfile
from pathlib import Path
from app.services import code_generation as cg

with tempfile.TemporaryDirectory() as d:
    tmp = Path(d)
    (tmp / 'src').mkdir()
    
    diff = """--- a/src/bad.py
+++ b/src/bad.py
@@ -0,0 +1,3 @@
+def foo(
+    pass
"""
    errors = cg.validate_all_diffs([
        cg.FileDiff(path='src/bad.py', language='python', unified_diff=diff, is_new_file=True)
    ], tmp)
    print('Errors:', errors)