"""Bump the four files that carry the app version (1.0.11 -> 1.0.12).

Line-level substitutions only: dumping the JSON back out would reformat whole
files and bury the real change (see the notes in AGENTS/memory).
"""

import re

TARGET = "1.0.11"
REPLACEMENT = "1.0.12"

FILES = [
    (r"d:\Project\ShiorikoTrans\desktop\package.json", r'^(\s*"version":\s*")' + re.escape(TARGET) + r'(")', 1),
    (r"d:\Project\ShiorikoTrans\desktop\src-tauri\Cargo.toml", r'^(version = ")' + re.escape(TARGET) + r'(")', 1),
    (r"d:\Project\ShiorikoTrans\desktop\src-tauri\tauri.conf.json", r'^(\s*"version":\s*")' + re.escape(TARGET) + r'(")', 1),
    (r"d:\Project\ShiorikoTrans\Cargo.lock", r'^(version = ")' + re.escape(TARGET) + r'(")', 1),
]

for path, pattern, expected in FILES:
    with open(path, encoding="utf-8", newline="") as handle:
        text = handle.read()
    updated, count = re.subn(pattern, lambda m: m.group(1) + REPLACEMENT + m.group(2), text, count=expected, flags=re.MULTILINE)
    if count != expected:
        raise SystemExit(f"{path}: expected {expected} match(es), found {count}")
    # Keep the original line endings (the Rust/JSON files are mixed CRLF/LF).
    newline = "\r\n" if "\r\n" in text else "\n"
    with open(path, "w", encoding="utf-8", newline="") as handle:
        handle.write(updated)
    print(f"{path}: {count} bumped (newline={newline!r})")
