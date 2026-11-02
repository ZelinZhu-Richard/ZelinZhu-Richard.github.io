"""Before and after sheets against the key art, for the morning report.

Usage: python3 tools/before_after.py
Each sheet is the key art, the fin fallback build (ec40098) and the current frame, at one height.
Writes _dev/evidence/compare-fins/<shot>.png and prints the value range of every frame.
"""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / '_dev/evidence/compare-fins'
SHOTS = {'gameplay-desktop': 'north-play-desktop', 'gameplay-narrow': 'north-play-narrow', 'full-growth-desktop': 'north-full-desktop',
         'full-growth-narrow': 'north-full-narrow', 'title-desktop': 'title-desktop', 'title-narrow': 'title-narrow'}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for shot, checkpoint in SHOTS.items():
        print(shot)
        subprocess.run([sys.executable, 'tools/compare_key.py', str(OUT / f'{shot}.png'), f'_dev/evidence/ec40098/{checkpoint}.png',
                        f'_dev/evidence/M5/{checkpoint}.png'], cwd=ROOT, check=True)


if __name__ == '__main__':
    main()
