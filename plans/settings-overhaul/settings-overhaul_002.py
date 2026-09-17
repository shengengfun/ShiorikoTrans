"""Trim the settings registry descriptions.

The settings rewrite shipped a one-line description for nearly every row, which
made the panels noisy (the control plus its label is usually enough). This keeps
descriptions only where they carry information the label cannot: what the option
actually changes, or what happens if it is set wrong.

Run:  python plans/settings-overhaul/settings-overhaul_002.py
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REGISTRY = ROOT / "desktop" / "src" / "pages" / "settings" / "registry.ts"

# Entries whose description genuinely prevents a mistake or explains a trade-off.
KEEP = {
    "diarization",  # what "speaker separation" means for the transcript
    "speakerLabels",  # why the [Speaker n] prefix is optional
    "stableTimestamps",  # explains the slower run
    "ffmpeg",  # the pipeline cannot run without it
    "recordingPath",  # where recordings land by default
    "unloadTimeout",  # "0 = keep loaded" is not guessable
    "resetApp",  # destructive-action warning
    "forceCpu",  # slower but works when the driver misbehaves
    "recentFiles",  # why an entry can point at a file that is gone
    "modelCatalog",  # curated vs. manual download
}

ID_RE = re.compile(r"^\s*id: '([^']+)',\s*$")
DESC_RE = re.compile(r"^\t\tdescription: \(\) => m\.\w+\(\),\s*$")


def main() -> None:
    lines = REGISTRY.read_text(encoding="utf-8").splitlines(keepends=True)
    out: list[str] = []
    current_id: str | None = None
    removed: list[str] = []
    kept: list[str] = []

    for line in lines:
        id_match = ID_RE.match(line)
        if id_match:
            current_id = id_match.group(1)
        if DESC_RE.match(line):
            if current_id in KEEP:
                kept.append(current_id)
                out.append(line)
            else:
                removed.append(current_id or "?")
            continue
        out.append(line)

    REGISTRY.write_text("".join(out), encoding="utf-8")
    print(f"kept {len(kept)}: {', '.join(sorted(set(kept)))}")
    print(f"removed {len(removed)} descriptions")


if __name__ == "__main__":
    main()
