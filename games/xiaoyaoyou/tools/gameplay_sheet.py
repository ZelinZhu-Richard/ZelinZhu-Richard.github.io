"""Contact sheets of the gameplay camera across the real journey, on the real GPU.

Usage: python3 tools/gameplay_sheet.py
Run from games/xiaoyaoyou with the local server up. One frame shows a moment, and the question
for this camera is how Kun reads most of the time, so a reviewer gets twelve moments per viewport.
Writes _dev/evidence/gameplay/gameplay-sheet-desktop.png and gameplay-sheet-narrow.png.
"""
import subprocess
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
FRAMES = ROOT / '_dev/tmp/frames'
OUT = ROOT / '_dev/evidence/gameplay'
MOMENTS = [14, 22, 30, 38, 46, 54, 62, 70, 78, 86, 94, 102]
VIEWS = {'desktop': ('1440x900', 480, 300, 4), 'narrow': ('390x844', 195, 422, 6)}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for view, (size, width, height, columns) in VIEWS.items():
        prefix = f'sheet-{view}'
        subprocess.run(['node', 'tools/frames.mjs', prefix, '--size', size, '--clean', *[f't{t}' for t in MOMENTS]], cwd=ROOT, check=True, capture_output=True)
        rows = (len(MOMENTS) + columns - 1) // columns
        sheet = Image.new('RGB', (width * columns, height * rows))
        for index, moment in enumerate(MOMENTS):
            frame = Image.open(FRAMES / f'{prefix}-t{moment}.png').convert('RGB').resize((width, height), Image.LANCZOS)
            sheet.paste(frame, (index % columns * width, index // columns * height))
        sheet.save(OUT / f'gameplay-sheet-{view}.png')


if __name__ == '__main__':
    main()
