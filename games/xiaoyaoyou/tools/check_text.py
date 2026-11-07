"""Check only the lines implemented so far, without inventing future-beat text."""
import json
import re
import unicodedata
from pathlib import Path
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]


def check():
    lines = json.loads((ROOT / 'text.json').read_text())['lines']
    block = re.search(r'```passages\n(.*?)\n```', (ROOT / 'PLAN.md').read_text(), re.S).group(1)
    canonical = dict(line.split(' | ', 1) for line in block.splitlines())
    source = [line for line in lines if line['kind'] == 'source']
    missing = {}
    for lang, name in [('zh', 'wenkai'), ('en', 'garamond')]:
        paths = list((ROOT / 'fonts').glob(f'{name}.woff*'))
        if len(paths) != 1:
            raise ValueError(f'Expected one subset for {name}, found {len(paths)}')
        font = TTFont(paths[0])
        cmap = font.getBestCmap()
        missing[name] = sorted({c for line in lines for c in line[lang] if not c.isspace() and ord(c) not in cmap})
        font.close()
    return {
        'lines': len(lines),
        'sourceExact': all(unicodedata.normalize('NFC', line['zh']) == canonical.get(line['id']) for line in source),
        'allDraft': all(line.get('draft') is True for line in lines),
        'sourceVerify': all(line.get('verify') is True for line in source),
        'missingGlyphs': missing,
    }


if __name__ == '__main__':
    result = check()
    print(json.dumps(result, ensure_ascii=False))
    if not all(result[key] for key in ('sourceExact', 'allDraft', 'sourceVerify')) or any(result['missingGlyphs'].values()):
        raise SystemExit(1)
