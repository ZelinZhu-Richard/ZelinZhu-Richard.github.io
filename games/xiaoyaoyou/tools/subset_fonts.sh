#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
PYTHON=/Users/richardzhu/game-assets/.venv/bin/python
SUBSET=/Users/richardzhu/game-assets/.venv/bin/pyftsubset
"$PYTHON" - <<'PY'
import json
from pathlib import Path
lines = json.loads(Path('text.json').read_text())['lines']
Path('_dev/tmp').mkdir(parents=True, exist_ok=True)
for lang in ('zh', 'en'):
    Path(f'_dev/tmp/{lang}.txt').write_text(''.join(line[lang] for line in lines))
PY
if "$PYTHON" -c 'import brotli' 2>/dev/null; then
  FLAVOR=woff2
else
  FLAVOR=woff
fi
"$SUBSET" /Users/richardzhu/game-assets/fonts/lxgw-wenkai/LXGWWenKai-Regular.ttf --text-file=_dev/tmp/zh.txt --flavor="$FLAVOR" --output-file="fonts/wenkai.$FLAVOR" --layout-features='*' --no-recalc-timestamp
"$SUBSET" /Users/richardzhu/game-assets/fonts/eb-garamond/EBGaramond-wght.ttf --text-file=_dev/tmp/en.txt --flavor="$FLAVOR" --output-file="fonts/garamond.$FLAVOR" --layout-features='*' --no-recalc-timestamp
"$PYTHON" - "$FLAVOR" <<'PY'
import sys
from pathlib import Path
flavor = sys.argv[1]
css = Path('styles.css')
css.write_text(css.read_text().replace('.woff2', '.' + flavor).replace('format("woff2")', f'format("{flavor}")'))
print(f'Font subsets: {flavor}')
PY
