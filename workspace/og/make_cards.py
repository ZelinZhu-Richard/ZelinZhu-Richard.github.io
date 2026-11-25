#!/usr/bin/env python3
"""Draw the social share cards: the 1200x630 image a link to the site shows on LinkedIn, X, iMessage and Slack.

Usage (from the repo root):
    python3 workspace/og/make_cards.py     # writes workspace/og/cards/<name>.png for every card in cards.json

Local macOS tooling. Needs Python 3 with Pillow, and the system fonts Iowan Old Style (or Charter) and Menlo.
Headings use TT Neoris from public/_nuxt/. The PNGs are committed; the Node build only copies them.

The card is the site's panel with a hard shadow: night paper, one card, one orange offset shadow.
Every measurement below is in final 1200x630 pixels.
"""
import json
import sys
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent

W, H = 1200, 630
# Text is drawn at twice the size and scaled down, so its edges come out smooth.
# Boxes, rules and the photo sit on whole pixels and are drawn once at final size, so their edges stay hard.
SCALE = 2

# The night theme tokens from public/portfolio.css; SHADE is the colour in --shadow.
# tests/og.test.mjs compares these lines with that file, so the cards cannot drift from the site.
PAPER = '#100f15'
CARD = '#16151c'
INK = '#ece9e1'
MUTED = '#a8a398'
FAINT = '#8a867e'
LINE = '#2d2b34'
ACCENT = '#e8743b'
SHADE = '#3a3843'

HOST = 'zelinzhu-richard.github.io'
WORDMARK = 'Richard Zhu'

PANEL = (56, 52, 1132, 566)
PANEL_SHADOW = 12
PAD = 56
LEFT, TOP, RIGHT, BOTTOM = PANEL[0] + PAD, PANEL[1] + PAD, PANEL[2] - PAD, PANEL[3] - PAD

PHOTO = (248, 310)
# A centred crop leaves no room above the hair, so the crop sits a quarter of the way down instead.
PHOTO_CENTRE = (0.5, 0.25)
PHOTO_SHADOW = 8
PHOTO_GAP = 56

LABEL_SIZE, LABEL_SPACING = 24, 1.5
TITLE_SIZES = range(128, 71, -4)
TITLE_TRACKING = -0.045
TITLE_GAP = 36
TEXT_SIZE, TEXT_LEADING, TEXT_LINES, TEXT_MEASURE = 34, 1.42, 3, 800
TEXT_GAP = 30
WORDMARK_SIZE, WORDMARK_TRACKING = 28, -0.02
ADDRESS_SIZE = 22
# The least space between the name and the address in the bottom row.
ADDRESS_GAP = 32
RULE_GAP = 26
# The least air between the last line of text and the rule. A two-line title over three lines of text has less.
RULE_MARGIN = 16

FONTS = {
    'display': [REPO / 'public' / '_nuxt' / 'TTNeorisTrialRegular.CykOY4gR.ttf'],
    'body': [Path('/System/Library/Fonts/Supplemental/Iowan Old Style.ttc'), Path('/System/Library/Fonts/Supplemental/Charter.ttc')],
    'mono': [Path('/System/Library/Fonts/Menlo.ttc')],
}


@lru_cache(maxsize=None)
def face(role, size):
    for path in FONTS[role]:
        if path.exists():
            # Basic layout on every machine, so a Pillow built with Raqm measures and draws the same.
            return ImageFont.truetype(str(path), round(size * SCALE), layout_engine=ImageFont.Layout.BASIC)
    sys.exit(f'make_cards: font not found: {" or ".join(p.name for p in FONTS[role])}. This script needs the repo fonts and the macOS system fonts.')


@lru_cache(maxsize=None)
def stamp(font, ch):
    """One glyph drawn alone with its origin at (size, 2 * size): used to find its ink and to spot missing glyphs."""
    image = Image.new('L', (font.size * 4, font.size * 3), 0)
    ImageDraw.Draw(image).text((font.size, font.size * 2), ch, font=font, fill=255, anchor='ls')
    return image


@lru_cache(maxsize=None)
def ink(font, ch):
    """A glyph's ink box measured from its origin: left, top, right, bottom. Up is negative."""
    left, top, right, bottom = stamp(font, ch).getbbox()
    return (left - font.size) / SCALE, (top - font.size * 2) / SCALE, (right - font.size) / SCALE, (bottom - font.size * 2) / SCALE


def cap_height(font):
    return -ink(font, 'H')[1]


def descender(font):
    return ink(font, 'p')[3]


def check_glyphs(text, font):
    """Stop instead of drawing an empty box where the font has no glyph (a curly apostrophe, a dash)."""
    missing = stamp(font, chr(0xFFFF)).tobytes()
    for ch in sorted(set(text) - {' '}):
        glyph = stamp(font, ch)
        if glyph.getbbox() is None or glyph.tobytes() == missing:
            sys.exit(f'make_cards: {font.getname()[0]} has no glyph for {ch!r} (U+{ord(ch):04X}) in {text!r}')


def run(text, font, spacing=0.0):
    """Pen position for every glyph of one line, and the line's ink width.
    Pillow has no letter-spacing, so a line is set glyph by glyph. The first glyph's ink starts at 0:
    a capital R carries about 9px of blank side bearing at title size, which would read as an indent."""
    pens, pen = [], -ink(font, text[0])[0]
    for ch in text:
        pens.append(pen)
        pen += font.getlength(ch) / SCALE + spacing
    return pens, pens[-1] + ink(font, text[-1])[2]


def wrap(text, width, measure):
    """Greedy word wrap: each line takes as many words as fit in width. measure(line) is a line's drawn width."""
    lines = []
    for word in text.split():
        if lines and measure(f'{lines[-1]} {word}') <= width:
            lines[-1] = f'{lines[-1]} {word}'
        else:
            lines.append(word)
    return lines


def balance(text, width, measure):
    """Wrap into as few lines as width allows, then narrow the block until one more step would add a line.
    The lines come out near the same length, instead of two full lines and one stranded word."""
    lines = wrap(text, width, measure)
    for narrower in range(int(width) - 4, 0, -4):
        tighter = wrap(text, narrower, measure)
        if len(tighter) > len(lines):
            break
        lines = tighter
    return lines


def fit_title(title, width):
    """The largest title size that fits on one line; below the smallest size it wraps onto two lines."""
    measure = lambda size: lambda line: run(line, face('display', size), TITLE_TRACKING * size)[1]
    for size in TITLE_SIZES:
        if measure(size)(title) <= width:
            return size, [title]
    lines = balance(title, width, measure(size))
    if len(lines) > 2 or max(map(measure(size), lines)) > width:
        sys.exit(f'make_cards: title does not fit on two lines: {title!r}')
    return size, lines


def portrait():
    """public/richard.jpg cropped to 4:5 for the photo column."""
    photo = Image.open(REPO / 'public' / 'richard.jpg').convert('RGB')
    return ImageOps.fit(photo, PHOTO, Image.LANCZOS, centering=PHOTO_CENTRE)


def copy(card, field):
    """One piece of a card's copy with stray whitespace removed. A card without it stops the script."""
    value = ' '.join(str(card.get(field) or '').split())
    if not value:
        sys.exit(f'make_cards: the card {card.get("name")!r} has no {field}')
    return value


def address(card):
    """The page address in the bottom row: the card's first path, or its prefix. The site card is the bare host."""
    match = card.get('match') or {}
    path = (match.get('paths') or [match.get('prefix') or ''])[0]
    return HOST + (path if path != '/' else '')


def box(draw, x0, y0, x1, y1, fill):
    draw.rectangle((x0, y0, x1 - 1, y1 - 1), fill=fill)


def draw_card(card):
    image = Image.new('RGB', (W, H), PAPER)
    draw = ImageDraw.Draw(image)
    masks = {}

    def text(x, baseline, line, font, colour, room, spacing=0.0, align='left'):
        """Draws one line and returns its width. A line wider than its room would leave the panel or cover its neighbour."""
        check_glyphs(line, font)
        pens, width = run(line, font, spacing)
        if width > room:
            sys.exit(f'make_cards: {line!r} is {round(width)}px wide and has {round(room)}px on the card {card["name"]!r}. Shorten it.')
        start = x - width if align == 'right' else x
        mask = masks.setdefault(colour, Image.new('L', (W * SCALE, H * SCALE), 0))
        pen = ImageDraw.Draw(mask)
        for ch, dx in zip(line, pens):
            pen.text(((start + dx) * SCALE, baseline * SCALE), ch, font=font, fill=255, anchor='ls')
        return width

    x0, y0, x1, y1 = PANEL
    box(draw, x0 + PANEL_SHADOW, y0 + PANEL_SHADOW, x1 + PANEL_SHADOW, y1 + PANEL_SHADOW, ACCENT)
    box(draw, x0, y0, x1, y1, INK)
    box(draw, x0 + 2, y0 + 2, x1 - 2, y1 - 2, CARD)

    width = RIGHT - LEFT
    if card.get('photo'):
        px, py = RIGHT - PHOTO[0], TOP
        box(draw, px + PHOTO_SHADOW, py + PHOTO_SHADOW, RIGHT + PHOTO_SHADOW, py + PHOTO[1] + PHOTO_SHADOW, SHADE)
        image.paste(portrait(), (px, py))
        draw.rectangle((px, py, RIGHT - 1, py + PHOTO[1] - 1), outline=INK, width=2)
        width -= PHOTO[0] + PHOTO_GAP

    label = face('mono', LABEL_SIZE)
    y = TOP + cap_height(label)
    text(LEFT, y, copy(card, 'label').upper(), label, MUTED, width, LABEL_SPACING)

    size, lines = fit_title(copy(card, 'title'), width)
    title = face('display', size)
    y += TITLE_GAP + cap_height(title)
    for i, line in enumerate(lines):
        text(LEFT, y + i * size, line, title, INK, width, TITLE_TRACKING * size)
    y += (len(lines) - 1) * size

    body = face('body', TEXT_SIZE)
    measure = min(width, TEXT_MEASURE)
    lines = balance(copy(card, 'text'), measure, lambda line: run(line, body)[1])
    if len(lines) > TEXT_LINES:
        sys.exit(f'make_cards: text needs {len(lines)} lines, the card holds {TEXT_LINES}: {card["text"]!r}')
    # The gap starts where the title's descenders end, so "Projects" does not sit closer to the text than "Fun".
    y += descender(title) + TEXT_GAP + cap_height(body)
    for i, line in enumerate(lines):
        text(LEFT, y + i * TEXT_SIZE * TEXT_LEADING, line, body, MUTED, measure)
    y += (len(lines) - 1) * TEXT_SIZE * TEXT_LEADING + descender(body)

    wordmark = face('display', WORDMARK_SIZE)
    rule = round(BOTTOM - cap_height(wordmark) - RULE_GAP)
    if y > rule - RULE_MARGIN:
        sys.exit(f'make_cards: the title and text of {card["name"]!r} run into the bottom row. Shorten one of them.')
    box(draw, LEFT, rule, RIGHT, rule + 1, LINE)
    # The name signs every card, except the ones whose title is already the name.
    room = RIGHT - LEFT
    if copy(card, 'title') != WORDMARK:
        room -= text(LEFT, BOTTOM, WORDMARK, wordmark, INK, room, WORDMARK_TRACKING * WORDMARK_SIZE) + ADDRESS_GAP
    text(RIGHT, BOTTOM, address(card), face('mono', ADDRESS_SIZE), FAINT, room, align='right')

    for colour, mask in masks.items():
        image.paste(colour, (0, 0), mask.resize((W, H), Image.LANCZOS))
    return image


def main():
    cards = json.loads((HERE / 'cards.json').read_text(encoding='utf-8'))
    out = HERE / 'cards'
    out.mkdir(exist_ok=True)
    # Every card is drawn before any file is written: copy that does not fit must not leave half the set redrawn.
    for card, image in [(card, draw_card(card)) for card in cards]:
        path = out / f'{card["name"]}.png'
        image.save(path, optimize=True)
        print(f'{card["name"]}: {path.relative_to(REPO)} {path.stat().st_size} bytes')


if __name__ == '__main__':
    main()
