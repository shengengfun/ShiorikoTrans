# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "pillow>=12.3.0",
# ]
# ///
"""Regenerate every branding asset in the repo from the master `logo.jpg`.

`tauri icon` already produces the canonical Tauri icon set (and the .ico/.icns
containers), but it does not emit the legacy PNG sizes nor the design assets.
This script fills those gaps so *no* app-facing file still carries the previous
microphone logo.

The `website/` folder is intentionally left untouched: it still ships the
upstream (Audire) brand and is not part of the rebrand.

Usage (from the repo root):

    python plans/app-icons/app-icons_001.py
"""

from __future__ import annotations

import base64
import io
from pathlib import Path

from PIL import Image

REPO_ROOT = Path(__file__).resolve().parents[2]
SOURCE = REPO_ROOT / "logo.jpg"

# Legacy Tauri icon sizes that `tauri icon` does not generate anymore.
TAURI_ICON_SIZES = {
    "desktop/src-tauri/icons/256x256.png": 256,
    "desktop/src-tauri/icons/512x512.png": 512,
}

# Raster brand assets (path -> square size).
RASTER_ASSETS = {
    "design/logo.png": 512,
}

# Files that used to hold the old vector microphone mark. They are replaced by
# an SVG wrapper embedding the raster logo so every existing reference keeps
# working without touching application code.
EMBEDDED_SVG = {
    "design/logo.svg": 192,
    "desktop/public/shiorikotrans.svg": 192,
}

SVG_TEMPLATE = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" width="{size}" height="{size}" '
    'role="img" aria-label="ShiorikoTrans logo">\n'
    "  <defs>\n"
    '    <clipPath id="squircle">\n'
    '      <path d="M {half} 0 A {half} {half} 0 0 1 {size} {half} A {half} {half} 0 0 1 {half} {size} '
    'A {half} {half} 0 0 1 0 {half} A {half} {half} 0 0 1 {half} 0 Z" />\n'
    "    </clipPath>\n"
    "  </defs>\n"
    '  <image width="{size}" height="{size}" clip-path="url(#squircle)" '
    'preserveAspectRatio="xMidYMid slice" href="data:image/jpeg;base64,{payload}" />\n'
    "</svg>\n"
)


def square(image: Image.Image, size: int) -> Image.Image:
    """Center-crop to a square and resize with a high quality filter."""
    width, height = image.size
    edge = min(width, height)
    left = (width - edge) // 2
    top = (height - edge) // 2
    cropped = image.crop((left, top, left + edge, top + edge))
    resample = Image.Resampling.LANCZOS
    return cropped.resize((size, size), resample)


def png_bytes(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    return buffer.getvalue()


def jpeg_bytes(image: Image.Image, quality: int = 88) -> bytes:
    buffer = io.BytesIO()
    image.convert("RGB").save(buffer, format="JPEG", quality=quality, optimize=True)
    return buffer.getvalue()


def main() -> None:
    source = Image.open(SOURCE).convert("RGB")
    print(f"source: {SOURCE.relative_to(REPO_ROOT)} {source.size[0]}x{source.size[1]}")

    for relative, size in {**TAURI_ICON_SIZES, **RASTER_ASSETS}.items():
        target = REPO_ROOT / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        icon = square(source, size)
        icon.save(target, format="PNG", optimize=True)
        print(f"  png  {relative} ({size}x{size}, {target.stat().st_size} bytes)")

    payload = base64.b64encode(jpeg_bytes(square(source, 192))).decode("ascii")
    for relative, size in EMBEDDED_SVG.items():
        target = REPO_ROOT / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(SVG_TEMPLATE.format(size=size, half=size // 2, payload=payload), encoding="utf-8")
        print(f"  svg  {relative} ({target.stat().st_size} bytes)")

    print("done")


if __name__ == "__main__":
    main()
