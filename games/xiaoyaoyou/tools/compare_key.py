"""Side-by-side sheets against the key art, plus the value range of each frame.

Usage: python3 tools/compare_key.py <out.png> <frame.png> [<frame.png> ...]
The sheet is the key art on the left and the frames beside it, all at one height.
Printed: luma percentiles for the key art and each frame, and how warm the brightest pixels are.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
KEY = ROOT / 'ref/key-north-sea.png'
PERCENTILES = (1, 5, 25, 50, 75, 95, 99, 99.9)
HEIGHT = 720


def stats(path):
    a = np.asarray(Image.open(path).convert('RGB')).astype(float)
    luma = .2126 * a[..., 0] + .7152 * a[..., 1] + .0722 * a[..., 2]
    top = luma >= np.percentile(luma, 97)
    warmth = float((a[..., 0][top] - a[..., 2][top]).mean())
    dark = float((a[..., 0][luma < 60] - a[..., 2][luma < 60]).mean()) if (luma < 60).any() else 0
    return [round(float(np.percentile(luma, p)), 1) for p in PERCENTILES], round(float(luma.mean()), 1), round(warmth, 1), round(dark, 1)


def row(path):
    image = Image.open(path).convert('RGB')
    return image.resize((round(image.width * HEIGHT / image.height), HEIGHT), Image.LANCZOS)


def main():
    out, frames = sys.argv[1], sys.argv[2:]
    panels = [row(KEY)] + [row(frame) for frame in frames]
    sheet = Image.new('RGB', (sum(p.width for p in panels) + 12 * (len(panels) - 1), HEIGHT), (0, 0, 0))
    x = 0
    for panel in panels:
        sheet.paste(panel, (x, 0))
        x += panel.width + 12
    sheet.save(out)
    print(f"{'':26}p{'  p'.join(str(p) for p in PERCENTILES)}  mean  warmTop  warmDark")
    for name, path in [('key art', KEY)] + [(Path(f).stem[-26:], f) for f in frames]:
        p, mean, warm, dark = stats(path)
        print(f"{name:26}{' '.join(f'{v:5.1f}' for v in p)}  {mean:5.1f}  {warm:6.1f}  {dark:6.1f}")


if __name__ == '__main__':
    main()
