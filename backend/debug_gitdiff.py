import tempfile
import subprocess
from pathlib import Path

with tempfile.TemporaryDirectory() as d:
    tmp = Path(d)
    (tmp / 'src').mkdir()
    
    # Create a file
    (tmp / 'src' / 'newfile.py').write_text("def hello():\n    return 'world'\n")
    
    # Get git diff for new file
    result = subprocess.run(
        ['git', 'diff', '--no-index', '/dev/null', 'src/newfile.py'],
        capture_output=True, text=True, timeout=10, cwd=tmp
    )
    print('Git diff output:')
    print(result.stdout)
    print('stderr:', result.stderr)
    print('returncode:', result.returncode)