"""Regenerates ibarra-real-nova-italic.woff2, the hero-name font.

Source: Ibarra Real Nova Italic (SIL OFL 1.1, no Reserved Font Name) from
https://github.com/google/fonts/blob/89ade4fa7b7663aec69d3202d2eefd928e78c467/ofl/ibarrarealnova/IbarraRealNova-Italic%5Bwght%5D.ttf
sha256 2ead710644460a0433998baccda6070207ad819c027cec442489578b580e1f6e

The variable source is pinned to weight 400 and cut down to Latin-1 plus common
punctuation. Needs fontTools and brotli:
    python3 subset.py <path to IbarraRealNova-Italic[wght].ttf>
"""
import sys
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools import subset

font = instantiateVariableFont(TTFont(sys.argv[1]), {'wght': 400})
options = subset.Options()
options.flavor = 'woff2'
options.layout_features = ['kern', 'liga', 'calt', 'ccmp', 'locl', 'mark', 'mkmk']
options.name_IDs = ['*']  # keep the copyright and license records
sub = subset.Subsetter(options)
sub.populate(unicodes=[*range(0x20, 0x7F), *range(0xA0, 0x100), 0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2026])
sub.subset(font)
out = Path(__file__).with_name('ibarra-real-nova-italic.woff2')
font.flavor = 'woff2'
font.save(out)
print(out, out.stat().st_size)
