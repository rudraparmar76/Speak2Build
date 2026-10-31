import re

with open("D:\\Speak2Build\\backend\\app\\services\\code_generation.py", "r", encoding="utf-8") as f:
    content = f.read()

old_func = '''def _apply_diff_in_memory(old_content: str, unified_diff: str) -> str:
    """Apply a unified diff to content in memory (for validation)."""
    lines = old_content.splitlines(keepends=True)
    # Simple unified diff parser - handles additions/deletions
    # For validation we just need approximate result; real apply uses git
    return old_content  # Placeholder - real validation uses git apply --check'''

new_func = '''def _apply_diff_in_memory(old_content: str, unified_diff: str) -> str:
    """Apply a unified diff to content in memory (for validation).
    
    Parses a simplified unified diff format and applies additions/deletions.
    """
    old_lines = old_content.splitlines(keepends=True)
    new_lines = list(old_lines)
    
    # Parse unified diff
    diff_lines = unified_diff.splitlines()
    i = 0
    while i < len(diff_lines):
        line = diff_lines[i]
        # Find hunk header: @@ -old_start,old_count +new_start,new_count @@
        if line.startswith("@@"):
            # Parse hunk header
            import re
            match = re.match(r"@@\s*-(\d+),?(\d*)\s*\+(\d+),?(\d*)\s*@@", line)
            if not match:
                i += 1
                continue
            old_start = int(match.group(1)) - 1  # 0-indexed
            old_count = int(match.group(2)) if match.group(2) else 1
            new_start = int(match.group(3)) - 1  # 0-indexed
            new_count = int(match.group(4)) if match.group(4) else 1
            
            i += 1
            # Process hunk lines
            hunk_lines = []
            while i < len(diff_lines) and not diff_lines[i].startswith("@@"):
                hunk_lines.append(diff_lines[i])
                i += 1
            
            # Apply hunk: delete old_count lines at old_start, insert new lines
            # Lines starting with '+' are additions, '-' are deletions, ' ' are context
            insert_lines = []
            delete_count = 0
            for hunk_line in hunk_lines:
                if hunk_line.startswith("+"):
                    insert_lines.append(hunk_line[1:] + "\\n")
                elif hunk_line.startswith("-"):
                    delete_count += 1
                elif hunk_line.startswith(" "):
                    # Context line - part of both old and new
                    pass
            
            # Apply: delete old_count lines, insert new lines
            # Clamp to valid range
            if old_start < 0:
                old_start = 0
            if old_start + old_count > len(new_lines):
                old_count = max(0, len(new_lines) - old_start)
            
            del new_lines[old_start:old_start + old_count]
            for j, ins_line in enumerate(insert_lines):
                new_lines.insert(old_start + j, ins_line)
        else:
            i += 1
    
    return "".join(new_lines)'''

if old_func in content:
    content = content.replace(old_func, new_func)
    with open("D:\\Speak2Build\\backend\\app\\services\\code_generation.py", "w", encoding="utf-8") as f:
        f.write(content)
    print("Replaced successfully")
else:
    print("Old func not found")
    # Debug: show what we're looking for
    idx = content.find("def _apply_diff_in_memory")
    if idx >= 0:
        print("Found at:", idx)
        print(content[idx:idx+500])
    else:
        print("Function not found at all")