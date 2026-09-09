# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "pillow>=12.3.0",
# ]
# ///
import os
from PIL import Image, ImageDraw

def create_icon(size, output_path):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    cx, cy = size // 2, size // 2
    radius = size // 3
    
    gradient = [(99, 102, 241), (139, 92, 246)]
    for i in range(radius):
        ratio = i / radius
        r = int(gradient[0][0] * (1 - ratio) + gradient[1][0] * ratio)
        g = int(gradient[0][1] * (1 - ratio) + gradient[1][1] * ratio)
        b = int(gradient[0][2] * (1 - ratio) + gradient[1][2] * ratio)
        draw.arc([cx - radius + i, cy - radius + i, cx + radius - i, cy + radius - i], 0, 360, fill=(r, g, b, 255), width=2)
    
    draw.ellipse([cx - 4, cy - 4, cx + 4, cy + 4], fill=(99, 102, 241))
    draw.ellipse([cx - 2, cy - 2, cx + 2, cy + 2], fill=(255, 255, 255))
    
    img.save(output_path)

icon_dir = r'd:\Project\ShiorikoTrans\desktop\src-tauri\icons'
os.makedirs(icon_dir, exist_ok=True)

sizes = [32, 64, 128, 256, 512]
for s in sizes:
    create_icon(s, os.path.join(icon_dir, f'{s}x{s}.png'))

create_icon(32, os.path.join(icon_dir, 'icon.png'))
print('Icons created successfully')
