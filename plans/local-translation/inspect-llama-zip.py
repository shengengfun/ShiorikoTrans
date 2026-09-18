"""Inspect the layout of the llama.cpp Windows release archive.

Fetching a few KB from the end of the ZIP is enough to read the central
directory, which avoids downloading ~18 MB through a slow proxy.

Run: python plans/local-translation/inspect-llama-zip.py
"""

from __future__ import annotations

import io
import json
import re
import subprocess
import sys

PROXY = "http://127.0.0.1:7897"
API = "https://api.github.com/repos/ggml-org/llama.cpp/releases?per_page=10"


def gh_json(url: str) -> list[dict]:
    out = subprocess.run(["gh", "api", url], capture_output=True, check=True, env={**_env()})
    return json.loads(out.stdout.decode("utf-8"))


def _env() -> dict:
    import os

    return {**os.environ, "HTTPS_PROXY": PROXY}


def main() -> None:
    asset = None
    for release in gh_json(API):
        for candidate in release.get("assets", []):
            if candidate["name"].endswith("-bin-win-cpu-x64.zip"):
                asset = candidate
                break
        if asset:
            break
    if not asset:
        sys.exit("no win-cpu-x64 asset found")

    print(f"SELF: asset {asset['name']} ({asset['size'] / 1e6:.1f} MB)")
    url = asset["browser_download_url"]
    raw = subprocess.run(
        ["curl.exe", "-sSL", "-x", PROXY, "--ssl-no-revoke", "-r", "-65536", url],
        capture_output=True,
        check=True,
    ).stdout
    names = sorted(set(re.findall(rb"(?:build/)?bin/[A-Za-z0-9_.\-]+|llama-[A-Za-z0-9_.\-/]+", raw)))
    for name in names[:40]:
        print("SELF: entry", name.decode("utf-8", "replace"))


if __name__ == "__main__":
    main()
