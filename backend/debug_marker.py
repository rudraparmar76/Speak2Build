import tempfile
import subprocess
from pathlib import Path

# The key difference: \ No newline at end of file
content = """import re
def validate_email(email: str) -> bool:
    return True"""

diff = f"""--- /dev/null
+++ b/src/simple.py
@@ -0,0 +1,{content.count(chr(10)) + 1} @@
{content}
\\ No newline at end of file
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
    print('With marker: returncode=', result.returncode, 'stderr=', result.stderr.strip())

# Test without marker but with newline at end
content2 = """import re
def validate_email(email: str) -> bool:
    return True
"""  # Note the trailing newline

diff2 = f"""--- /dev/null
+++ b/src/simple2.py
@@ -0,0 +1,{content2.count(chr(10))} @@
{content2}
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
    print('With trailing newline: returncode=', result.returncode, 'stderr=', result.stderr.strip())