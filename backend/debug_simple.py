import tempfile
import subprocess
from pathlib import Path

# Test with simpler content that we know works
simple = """import re
def validate_email(email: str) -> bool:
    return True"""

print(f'Simple lines: {simple.count(chr(10)) + 1}')

diff = f"""--- /dev/null
+++ b/src/simple.py
@@ -0,0 +1,{simple.count(chr(10)) + 1} @@
{simple}
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
    print('Simple: returncode=', result.returncode, 'stderr=', result.stderr.strip())

# Now test with the exact content that works from git diff
with tempfile.TemporaryDirectory() as d:
    tmp = Path(d)
    (tmp / 'src').mkdir()
    (tmp / 'src' / 'simple.py').write_text(simple)
    
    result = subprocess.run(
        ['git', 'diff', '--no-index', '/dev/null', 'src/simple.py'],
        capture_output=True, text=True, timeout=10, cwd=tmp
    )
    print('Git diff output:')
    print(result.stdout)