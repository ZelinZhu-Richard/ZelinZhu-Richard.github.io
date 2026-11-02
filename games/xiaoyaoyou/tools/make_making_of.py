"""Builds making-of/img/ and making-of/numbers.json from the final build.

Run from games/xiaoyaoyou with the local server up, after the final capture.
Frames come from the real game through tools/frames.mjs and are only resized.
"""
import json
import re
import subprocess
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
IMG = ROOT / 'making-of/img'
FRAMES = ROOT / '_dev/tmp/frames'
LAYERS = [
    {'look': 0, 'shafts': 0, 'mist': 0, 'cards': 0, 'bloom': 0},
    {'look': 1, 'shafts': 0, 'mist': 0, 'cards': 0, 'bloom': 0},
    {'look': 1, 'shafts': 1, 'mist': 0, 'cards': 0, 'bloom': 0},
    {'look': 1, 'shafts': 1, 'mist': 1, 'cards': 1, 'bloom': 0},
    {'look': 1, 'shafts': 1, 'mist': 1, 'cards': 1, 'bloom': 1},
]


def shot(prefix, *arguments):
    subprocess.run(['node', 'tools/frames.mjs', prefix, *arguments], cwd=ROOT, check=True, capture_output=True)


def save(source, name, width=None, quality=82):
    image = Image.open(source).convert('RGB')
    if width and image.width > width:
        image = image.resize((width, round(image.height * width / image.width)), Image.LANCZOS)
    image.save(IMG / name, quality=quality, optimize=True, progressive=True)


def before(sheet, name):
    # The morning sheets hold the key art on the left and the old frame on the right.
    image = Image.open(sheet).convert('RGB')
    image.crop((image.width - 1440, 0, image.width, 900)).resize((1000, 625), Image.LANCZOS).save(IMG / name, quality=80, optimize=True)


def main():
    IMG.mkdir(exist_ok=True)
    save(ROOT / 'ref/key-north-sea.png', 'concept.jpg', quality=84)
    save(ROOT / 'ref/kun-sheet.png', 'sheet-kun.jpg', 1600)
    save(ROOT / '_dev/silhouette/kun-side.png', 'overlay-side.jpg', 1536, 84)
    save(ROOT / '_dev/silhouette/kun-top.png', 'overlay-top.jpg', 1536, 84)
    save(FRAMES / 'title-wide-north-full.png', 'frame-full.jpg', 2200, 82)
    shot('making', '--size', '1600x1000', '--clean', 'north-start', 't40')
    save(FRAMES / 'making-north-start.png', 'frame-opening.jpg')
    save(FRAMES / 'making-t40.png', 'frame-play.jpg')
    before(ROOT / '_dev/evidence/before/key-vs-opening.png', 'before-opening.jpg')
    before(ROOT / '_dev/evidence/before/key-vs-gameplay.png', 'before-play.jpg')
    for index, layers in enumerate(LAYERS, 1):
        shot(f'layer{index}', '--size', '1600x1000', '--clean', '--layers', json.dumps(layers), 'north-full')
        save(FRAMES / f'layer{index}-north-full.png', f'layer-{index}.jpg', quality=80)

    metrics = json.loads((ROOT / '_dev/evidence/M5/metrics.json').read_text())
    silhouette = json.loads((ROOT / '_dev/silhouette/kun.json').read_text())
    points = [view for checkpoint in metrics['checkpoints'].values() for view in checkpoint.values()]
    triangles = max(view['triangles'] for view in points)
    calls = max(view['drawCalls'] for view in points)
    world = (ROOT / 'src/world.js').read_text()
    pillars = int(re.search(r'hero\.length < (\d+)', world)[1]) + int(re.search(r'field\.length < (\d+)', world)[1])
    code = sum(len(path.read_text().splitlines()) for folder in ('src', 'blender') for path in (ROOT / folder).iterdir() if path.suffix in ('.js', '.py'))
    verdicts = len(list((ROOT / '_dev/review').glob('*/verdict.json')))
    side, top = silhouette['views']['side']['iou'], silhouette['views']['top']['iou']
    numbers = {
        'iou': f'{side:.2f} from the side and {top:.2f} from above, where 1 would be a perfect match',
        'rows': [
            ['Triangles in the heaviest frame (limit 300,000)', f'{triangles:,}'],
            ['Draw calls in the heaviest frame (limit 150)', f'{calls}'],
            ['Download, full journey (limit 20 MB)', f"{metrics['runtimeBytes'] / 1e6:.1f} MB"],
            ['Frame rate, Apple M4 Pro, headless Chromium', '60 fps'],
            ['Stone pillars in the sea', f'{pillars}'],
            ['Length of the journey', f"{metrics['autoplay']['runs'][0]['totalGameMs'] / 1000:.0f} s"],
            ['Lines of game and model code', f'{code:,}'],
            ['Independent reviews run by Codex', f'{verdicts}'],
        ],
    }
    (ROOT / 'making-of/numbers.json').write_text(json.dumps(numbers, indent=2, ensure_ascii=False) + '\n')
    size = sum(path.stat().st_size for path in IMG.iterdir())
    print(f'{size / 1e6:.2f} MB in making-of/img, limit 8 MB')


if __name__ == '__main__':
    main()
