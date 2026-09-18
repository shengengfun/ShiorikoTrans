"""Bump the app version in the three manifests that carry it (line-level).

Rewriting the JSON files wholesale reformats every line, so the version line is
replaced in place instead.

Run: python plans/local-translation/bump_version.py
"""

from __future__ import annotations

import io
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OLD = "1.0.10"
NEW = "1.0.11"


def bump(path: Path, pattern: str) -> None:
    text = io.open(path, encoding="utf-8", newline="").read()
    replaced, count = re.subn(pattern, lambda match: match.group(0).replace(OLD, NEW), text, count=1)
    if count == 0:
        raise SystemExit(f"no version line found in {path}")
    io.open(path, "w", encoding="utf-8", newline="").write(replaced)
    print(f"{path.name}: {OLD} -> {NEW}")


def main() -> None:
    # `desktop/package.json` also lists dependency versions, so anchor on a
    # top-level `"version"` key.
    bump(ROOT / "desktop" / "package.json", r'(?m)^(\s*)"version": "1\.0\.10"')
    bump(ROOT / "desktop" / "src-tauri" / "tauri.conf.json", r'(?m)^(\s*)"version": "1\.0\.10"')
    # Cargo.toml: the crate's own version, never a dependency's.
    bump(ROOT / "desktop" / "src-tauri" / "Cargo.toml", r'(?m)^version = "1\.0\.10"')


if __name__ == "__main__":
    main()
