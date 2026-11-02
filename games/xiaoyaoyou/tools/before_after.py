"""Before and after sheets against the key art, for the morning report.

Usage: python3 tools/before_after.py
Each sheet is the key art, last night's frame and the current frame, at one height.
Writes _dev/evidence/compare/<shot>.png and prints the value range of every frame.
"""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / '_dev/evidence/compare'
SHOTS = {'opening': 'north-start', 'full-growth': 'north-full', 'gameplay': 'north-play'}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for shot, checkpoint in SHOTS.items():
        print(shot)
        subprocess.run([sys.executable, 'tools/compare_key.py', str(OUT / f'{shot}.png'), f'_dev/evidence/before/{shot}.png',
                        f'_dev/evidence/M5/{checkpoint}-desktop.png'], cwd=ROOT, check=True)


if __name__ == '__main__':
    main()
