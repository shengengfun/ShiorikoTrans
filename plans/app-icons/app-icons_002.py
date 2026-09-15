# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "pillow>=12.3.0",
# ]
# ///
r"""Regenerate the branded icons with RinaDown's rounded (squircle) look.

`logo.jpg` at the repo root is the master artwork, but it is a plain square.
Every app-facing icon is produced from a *rounded* master instead, so the
Windows taskbar / macOS dock / Linux launcher artwork matches the app icons used
by the other projects in this workspace (see `assets/logo/logo.png` in
`D:\Project\RinaDown`: a rounded square inset by ~5.8% with ~19% corner radius).

Pipeline:

    python plans/app-icons/app-icons_002.py          # rounded master + legacy assets
    cd desktop
    .\\node_modules\\.bin\\tauri.cmd icon ..\\design\\logo_rounded.png   # canonical tauri set

The second step is required because Tauri generates the .ico / .icns containers
and the Windows / Android store logos. It is byte-stable when the master has not
changed, so a dirty git tree is a cheap way to spot stale icons.
"""

from __future__ import annotations

import base64
import io
from pathlib import Path

from PIL import Image, ImageDraw

REPO_ROOT = Path(__file__).resolve().parents[2]
SOURCE = REPO_ROOT / "logo.jpg"

# Geometry copied from the reference icon (600px canvas, shape spans 35..564).
INSET_RATIO = 0.0583
RADIUS_RATIO = 0.19
SUPERSAMPLE = 4

# Rounded master handed to `tauri icon` (must stay square and >= 1024).
ROUNDED_MASTER = "design/logo_rounded.png"

# Sizes `tauri icon` does not emit anymore, or that live outside its icon dir.
RASTER_ASSETS = {
    "design/logo.png": 512,
    "desktop/src-tauri/icons/256x256.png": 256,
    "desktop/src-tauri/icons/512x512.png": 512,
}

# Vector files that used to carry the old microphone mark; they embed the
# rounded raster so every existing reference keeps working.
EMBEDDED_SVG = {
    "design/logo.svg": 256,
    "desktop/public/shiorikotrans.svg": 192,
}

SVG_TEMPLATE = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" width="{size}" height="{size}" '
    'role="img" aria-label="ShiorikoTrans logo">\n'
    '  <image width="{size}" height="{size}" href="data:image/png;base64,{payload}" />\n'
    "</svg>\n"
)


def square(image: Image.Image) -> Image.Image:
    """Center-crop to a square."""
    width, height = image.size
    edge = min(width, height)
    left = (width - edge) // 2
    top = (height - edge) // 2
    return image.crop((left, top, left + edge, top + edge))


def rounded_square(image: Image.Image, size: int) -> Image.Image:
    """Square image inside a rounded, transparent-cornered canvas of `size`."""
    inset = round(size * INSET_RATIO)
    shape_size = size - inset * 2
    radius = round(shape_size * RADIUS_RATIO)

    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    content = square(image).convert("RGBA").resize((shape_size, shape_size), Image.Resampling.LANCZOS)

    mask = Image.new("L", (shape_size * SUPERSAMPLE, shape_size * SUPERSAMPLE), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, shape_size * SUPERSAMPLE - 1, shape_size * SUPERSAMPLE - 1),
        radius=radius * SUPERSAMPLE,
        fill=255,
    )
    mask = mask.resize((shape_size, shape_size), Image.Resampling.LANCZOS)

    canvas.paste(content, (inset, inset), mask)
    return canvas


def png_bytes(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    return buffer.getvalue()


def write(path: str, data: bytes) -> None:
    target = REPO_ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    print(f"{path} ({len(data) // 1024} KB)")


def main() -> None:
    source = Image.open(SOURCE)
    master = rounded_square(source, 1024)
    write(ROUNDED_MASTER, png_bytes(master))

    for path, size in RASTER_ASSETS.items():
        write(path, png_bytes(rounded_square(source, size)))

    for path, size in EMBEDDED_SVG.items():
        payload = base64.b64encode(png_bytes(rounded_square(source, size))).decode("ascii")
        write(path, SVG_TEMPLATE.format(size=size, payload=payload).encode("utf-8"))

    print("\nnow run: cd desktop && .\\node_modules\\.bin\\tauri.cmd icon ..\\design\\logo_rounded.png")


if __name__ == "__main__":
    main()
