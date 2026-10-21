#!/usr/bin/env python3
"""Write the billsplit practice history for lab-e into a new git repo.

Usage: python3 gen_history.py TARGET_DIR   (make_history.sh calls this)

This file contains the whole history, so reading it is the same as reading
`git log -p` of the generated repo. Do the lab on the generated repo first.
Fixed authors, dates and config make every run produce the same commit ids.
"""

import os
import subprocess
import sys
from pathlib import Path

ANA = ("Ana Pereira", "ana@billsplit.invalid", "+0000")
KOFI = ("Kofi Mensah", "kofi@billsplit.invalid", "+0000")
LIN = ("Lin Wei", "lin@billsplit.invalid", "+0800")
SAM = ("Sam Ortiz", "sam@billsplit.invalid", "-0500")

START = 1767604320  # 2026-01-05 09:12 UTC

STEPS = []


def step(author, message, *ops):
    STEPS.append((author, message, ops))


def W(path, text):
    return ("write", path, text.lstrip("\n"))


def A(path, text):
    return ("append", path, text)


def E(path, old, new, count=1):
    return ("edit", path, old, new, count)


def D(path):
    return ("delete", path)


def MV(src, dst):
    return ("move", src, dst)


def release(author, version, old_version, notes):
    entry = "## " + version + "\n\n" + "".join("- " + n + "\n" for n in notes) + "\n"
    step(
        author,
        "Release " + version,
        E("pyproject.toml", 'version = "' + old_version + '"', 'version = "' + version + '"'),
        E("billsplit/__init__.py", '__version__ = "' + old_version + '"', '__version__ = "' + version + '"'),
        E("CHANGELOG.md", "# Changelog\n\n", "# Changelog\n\n" + entry),
    )
    STEPS[-1] = STEPS[-1] + ("v" + version,)


# ---------------------------------------------------------------------------
# 0.1.0
# ---------------------------------------------------------------------------

step(ANA, "Initial commit",
     W("README.md", """
# billsplit

Split shared bills fairly, to the cent.

billsplit reads the items of a bill from a CSV file. It prints the total and
fair shares. Every share is a whole number of cents, and the shares always add
up to the total.
"""),
     W("LICENSE", """
MIT License

Copyright (c) 2026 The billsplit authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
"""),
     W(".gitignore", """
__pycache__/
*.pyc
.venv/
build/
dist/
*.egg-info/
.pytest_cache/
"""))

step(ANA, "Add pyproject.toml",
     W("pyproject.toml", """
[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"

[project]
name = "billsplit"
version = "0.1.0"
description = "Split shared bills fairly, to the cent."
readme = "README.md"
requires-python = ">=3.9"
license = { text = "MIT" }

[project.scripts]
billsplit = "billsplit.cli:main"

[tool.pytest.ini_options]
testpaths = ["tests"]
"""))

step(ANA, "money: parse and round amounts",
     W("billsplit/__init__.py", '''
"""Split shared bills fairly, to the cent."""

from .money import AmountError, format_money, parse_amount, round_money

__version__ = "0.1.0"
'''),
     W("billsplit/money.py", '''
"""Money amounts as Decimal values, rounded to whole cents."""

from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

CENT = Decimal("0.01")


class AmountError(ValueError):
    """Raised when a text value is not a valid amount."""


def parse_amount(text: str) -> Decimal:
    """Parse text such as '12.50' into a Decimal.

    Empty text, NaN and infinity are rejected with AmountError.
    """
    cleaned = text.strip()
    if not cleaned:
        raise AmountError("empty amount")
    try:
        value = Decimal(cleaned)
    except InvalidOperation:
        raise AmountError(f"not a number: {text!r}") from None
    if not value.is_finite():
        raise AmountError(f"not a finite number: {text!r}")
    return value


def round_money(value: Decimal) -> Decimal:
    """Round to whole cents. Halves round away from zero: 2.345 -> 2.35."""
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


def format_money(value: Decimal) -> str:
    """Format an amount with exactly two decimals: 7 -> '7.00'."""
    return f"{round_money(value):.2f}"
'''))

step(ANA, "test: parsing and rounding",
     W("tests/test_money.py", '''
from decimal import Decimal

import pytest

from billsplit.money import AmountError, format_money, parse_amount, round_money


def test_parse_plain_amount():
    assert parse_amount("12.50") == Decimal("12.50")


def test_parse_strips_spaces():
    assert parse_amount("  3.10 ") == Decimal("3.10")


@pytest.mark.parametrize("text", ["", "abc", "NaN", "inf"])
def test_parse_rejects_bad_text(text):
    with pytest.raises(AmountError):
        parse_amount(text)


def test_round_money_half_away_from_zero():
    assert round_money(Decimal("2.345")) == Decimal("2.35")
    assert round_money(Decimal("-2.345")) == Decimal("-2.35")


def test_format_money_two_decimals():
    assert format_money(Decimal("7")) == "7.00"
'''))

step(KOFI, "split: even split that always adds up to the total",
     W("billsplit/split.py", '''
"""Split an amount into shares that add up exactly."""

from decimal import Decimal
from typing import List

from .money import CENT, round_money


def split_even(total: Decimal, people: int) -> List[Decimal]:
    """Split total into `people` shares that differ by at most one cent.

    The first shares get the extra cents, so the shares always add up to
    the rounded total.
    """
    if people < 1:
        raise ValueError("people must be at least 1")
    cents = int(round_money(total) / CENT)
    base, extra = divmod(cents, people)
    return [(base + (1 if k < extra else 0)) * CENT for k in range(people)]
'''),
     E("billsplit/__init__.py",
       "from .money import AmountError, format_money, parse_amount, round_money\n",
       "from .money import AmountError, format_money, parse_amount, round_money\nfrom .split import split_even\n"))

step(KOFI, "test: split_even",
     W("tests/test_split.py", '''
from decimal import Decimal

import pytest

from billsplit.split import split_even


def test_split_even_adds_up():
    shares = split_even(Decimal("10.00"), 3)
    assert shares == [Decimal("3.34"), Decimal("3.33"), Decimal("3.33")]
    assert sum(shares) == Decimal("10.00")


def test_split_even_one_person():
    assert split_even(Decimal("4.20"), 1) == [Decimal("4.20")]


def test_split_even_needs_people():
    with pytest.raises(ValueError):
        split_even(Decimal("1.00"), 0)
'''))

step(ANA, "ledger: Item and total()",
     W("billsplit/ledger.py", '''
"""Bill items and their total."""

from dataclasses import dataclass
from decimal import Decimal
from typing import Iterable

from .money import round_money


@dataclass(frozen=True)
class Item:
    """One line of a bill."""

    name: str
    amount: Decimal


def total(items: Iterable[Item]) -> Decimal:
    """Add up the item amounts, then round once to whole cents."""
    return round_money(sum((item.amount for item in items), Decimal(0)))
'''))

step(ANA, "io: read items from a CSV file",
     W("billsplit/io.py", '''
"""Read bill items from CSV files."""

import csv
from typing import List

from .ledger import Item
from .money import parse_amount


def read_items(path: str) -> List[Item]:
    """Read a CSV file with the header row `item,amount`."""
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        return [Item(row["item"].strip(), parse_amount(row["amount"])) for row in reader]
'''))

step(ANA, "cli: billsplit total FILE",
     W("billsplit/cli.py", '''
"""Command line interface for billsplit."""

import argparse
import sys
from typing import List, Optional

from .io import read_items
from .ledger import total
from .money import format_money


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="billsplit", description="Split shared bills fairly, to the cent."
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_total = sub.add_parser("total", help="print the total of a bill")
    p_total.add_argument("file", help="CSV file with the columns item,amount")
    return parser


def main(argv: Optional[List[str]] = None) -> int:
    args = build_parser().parse_args(argv)
    items = read_items(args.file)
    if args.command == "total":
        print(format_money(total(items)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
'''),
     W("billsplit/__main__.py", '''
import sys

from .cli import main

sys.exit(main())
'''))

step(LIN, "test: ledger total",
     W("tests/test_ledger.py", '''
from decimal import Decimal

from billsplit.ledger import Item, total


def test_total_adds_amounts():
    items = [Item("a", Decimal("1.10")), Item("b", Decimal("2.20"))]
    assert total(items) == Decimal("3.30")


def test_total_of_nothing_is_zero():
    assert total([]) == Decimal("0.00")
'''))

step(LIN, "test: reading CSV files",
     W("tests/test_io.py", '''
from decimal import Decimal

from billsplit.io import read_items


def write(tmp_path, text):
    path = tmp_path / "bill.csv"
    path.write_text(text, encoding="utf-8")
    return str(path)


def test_read_items(tmp_path):
    path = write(tmp_path, "item,amount\\ncoffee,3.50\\nbagel,2.25\\n")
    items = read_items(path)
    assert [i.name for i in items] == ["coffee", "bagel"]
    assert [i.amount for i in items] == [Decimal("3.50"), Decimal("2.25")]
'''))

step(ANA, "docs: usage",
     A("README.md", """
## Install

    pip install -e .

## Usage

A bill is a CSV file with a header row:

    item,amount
    pizza,18.50
    salad,7.25

Print the total:

    $ billsplit total dinner.csv
    25.75
"""))

step(ANA, "Release 0.1.0",
     W("CHANGELOG.md", """
# Changelog

## 0.1.0

- First release: `billsplit total`.
"""))
STEPS[-1] = STEPS[-1] + ("v0.1.0",)

# ---------------------------------------------------------------------------
# 0.2.0
# ---------------------------------------------------------------------------

step(KOFI, "split: weighted split with the largest remainder method",
     E("billsplit/split.py",
       "from decimal import Decimal\nfrom typing import List\n",
       "import math\nfrom decimal import Decimal\nfrom typing import List, Sequence\n"),
     A("billsplit/split.py", '''

def split_weighted(total: Decimal, weights: Sequence[Decimal]) -> List[Decimal]:
    """Split total in proportion to weights, to the cent.

    Largest remainder method: round every exact share down to whole cents,
    then give the leftover cents to the shares with the largest remainders.
    Ties go to the earlier share.
    """
    if not weights:
        raise ValueError("need at least one weight")
    if total < 0 or any(w < 0 for w in weights):
        raise ValueError("total and weights must not be negative")
    weight_sum = sum(weights, Decimal(0))
    if weight_sum == 0:
        raise ValueError("weights must not all be zero")
    cents = int(round_money(total) / CENT)
    exact = [Decimal(cents) * w / weight_sum for w in weights]
    floors = [math.floor(e) for e in exact]
    leftover = cents - sum(floors)
    order = sorted(range(len(weights)), key=lambda k: (floors[k] - exact[k], k))
    for k in order[:leftover]:
        floors[k] += 1
    return [c * CENT for c in floors]
'''),
     E("billsplit/__init__.py", "from .split import split_even\n", "from .split import split_even, split_weighted\n"))

step(KOFI, "test: weighted split",
     E("tests/test_split.py", "from billsplit.split import split_even\n",
       "from billsplit.split import split_even, split_weighted\n"),
     A("tests/test_split.py", '''

def test_split_weighted_follows_weights():
    shares = split_weighted(Decimal("100.00"), [Decimal(2), Decimal(1), Decimal(1)])
    assert shares == [Decimal("50.00"), Decimal("25.00"), Decimal("25.00")]


def test_split_weighted_leftover_cent_goes_first():
    shares = split_weighted(Decimal("10.00"), [Decimal(1)] * 3)
    assert shares == [Decimal("3.34"), Decimal("3.33"), Decimal("3.33")]


def test_split_weighted_rejects_zero_weights():
    with pytest.raises(ValueError):
        split_weighted(Decimal("1.00"), [Decimal(0), Decimal(0)])
'''))

step(KOFI, "cli: billsplit split FILE --people N",
     E("billsplit/cli.py", "from .money import format_money\n",
       "from .money import format_money\nfrom .split import split_even\n"),
     E("billsplit/cli.py",
       '    p_total.add_argument("file", help="CSV file with the columns item,amount")\n    return parser\n',
       '    p_total.add_argument("file", help="CSV file with the columns item,amount")\n\n'
       '    p_split = sub.add_parser("split", help="split a bill evenly")\n'
       '    p_split.add_argument("file", help="CSV file with the columns item,amount")\n'
       '    p_split.add_argument("--people", type=int, required=True, help="number of people")\n'
       '    return parser\n'),
     E("billsplit/cli.py",
       "        print(format_money(total(items)))\n    return 0\n",
       "        print(format_money(total(items)))\n"
       '    elif args.command == "split":\n'
       "        for share in split_even(total(items), args.people):\n"
       "            print(format_money(share))\n"
       "    return 0\n"),
     A("README.md", """
Split it evenly between three people:

    $ billsplit split dinner.csv --people 3
    8.59
    8.58
    8.58
"""))

step(LIN, "io: skip rows where every field is empty",
     W("billsplit/io.py", '''
"""Read bill items from CSV files."""

import csv
from typing import Dict, List, Optional

from .ledger import Item
from .money import parse_amount


def _is_blank(row: Dict[Optional[str], Optional[str]]) -> bool:
    return all(not (value or "").strip() for key, value in row.items() if key is not None)


def read_items(path: str) -> List[Item]:
    """Read a CSV file with the header row `item,amount`.

    Rows where every field is empty are skipped.
    """
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        return [
            Item(row["item"].strip(), parse_amount(row["amount"]))
            for row in reader
            if not _is_blank(row)
        ]
'''))

step(LIN, "test: blank rows",
     A("tests/test_io.py", '''

def test_blank_rows_are_skipped(tmp_path):
    path = write(tmp_path, "item,amount\\ncoffee,3.50\\n,\\n  ,  \\nbagel,2.25\\n")
    assert [i.name for i in read_items(path)] == ["coffee", "bagel"]
'''))

step(ANA, "docs: explain the rounding rule",
     W("docs/rounding.md", """
# How billsplit rounds

billsplit keeps exact Decimal amounts while it adds things up. It rounds to
whole cents once, at the end.

Halves round away from zero:

| exact  | printed |
|--------|---------|
| 2.345  | 2.35    |
| 2.344  | 2.34    |
| -2.345 | -2.35   |

Rounding every line first and then adding can give a different total. For
example, three lines of 0.005 add up to 0.015, which prints as 0.02. Rounding
each line first would give 0.03.
"""),
     A("README.md", """
See [docs/rounding.md](docs/rounding.md) for the rounding rule.
"""))

step(SAM, "ci: run the tests on every push",
     W(".github/workflows/test.yml", """
name: test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-python@v4
        with:
          python-version: "3.12"
      - run: pip install pytest
      - run: pip install -e .
      - run: pytest -q
"""))

release(ANA, "0.2.0", "0.1.0", ["`billsplit split --people N`.", "Weighted splits in the Python API.",
                                "Blank rows in CSV files are skipped."])

# ---------------------------------------------------------------------------
# 0.3.0
# ---------------------------------------------------------------------------

step(SAM, "docs: add CONTRIBUTING.md",
     W("CONTRIBUTING.md", """
# Contributing

1. Create a virtual environment: `python3 -m venv .venv && . .venv/bin/activate`
2. Install: `pip install -e . pytest`
3. Run the tests: `pytest -q`

Keep pull requests small. Add a test for every bug you fix.
"""))

step(LIN, "money: allow a leading currency symbol ($, €, £)",
     E("billsplit/money.py", 'CENT = Decimal("0.01")\n', 'CENT = Decimal("0.01")\nCURRENCY_SYMBOLS = "$€£"\n'),
     E("billsplit/money.py", "    \"\"\"Parse text such as '12.50' into a Decimal.",
       "    \"\"\"Parse text such as '12.50' or '$12.50' into a Decimal."),
     E("billsplit/money.py", '        raise AmountError("empty amount")\n    try:',
       '        raise AmountError("empty amount")\n'
       "    if cleaned[0] in CURRENCY_SYMBOLS:\n"
       "        cleaned = cleaned[1:].strip()\n"
       "    try:"))

step(LIN, "test: currency symbols are ignored when parsing",
     A("tests/test_money.py", '''

@pytest.mark.parametrize("text", ["$12.50", "€12.50", "£ 12.50"])
def test_parse_ignores_currency_symbol(text):
    assert parse_amount(text) == Decimal("12.50")
'''))

step(KOFI, "tax: apply_tax(subtotal, rate)",
     W("billsplit/tax.py", '''
"""Tax and tip on top of a subtotal."""

from decimal import Decimal

from .money import round_money


def apply_tax(subtotal: Decimal, rate: Decimal) -> Decimal:
    """Return subtotal plus tax, rounded to cents. rate 0.08875 means 8.875%."""
    if rate < 0:
        raise ValueError("tax rate must not be negative")
    return round_money(subtotal * (1 + rate))
'''))

step(KOFI, "test: apply_tax",
     W("tests/test_tax.py", '''
from decimal import Decimal

import pytest

from billsplit.tax import apply_tax


def test_apply_tax():
    assert apply_tax(Decimal("100.00"), Decimal("0.08875")) == Decimal("108.88")


def test_zero_tax_keeps_subtotal():
    assert apply_tax(Decimal("12.34"), Decimal(0)) == Decimal("12.34")


def test_negative_tax_is_rejected():
    with pytest.raises(ValueError):
        apply_tax(Decimal("1.00"), Decimal("-0.1"))
'''))

step(KOFI, "cli: total --tax RATE",
     E("billsplit/cli.py", "import argparse\nimport sys\n", "import argparse\nimport sys\nfrom decimal import Decimal\n"),
     E("billsplit/cli.py", "from .split import split_even\n", "from .split import split_even\nfrom .tax import apply_tax\n"),
     E("billsplit/cli.py",
       '    p_total.add_argument("file", help="CSV file with the columns item,amount")\n\n',
       '    p_total.add_argument("file", help="CSV file with the columns item,amount")\n'
       '    p_total.add_argument("--tax", type=Decimal, default=Decimal(0), help="tax rate, e.g. 0.08875")\n\n'),
     E("billsplit/cli.py",
       "        print(format_money(total(items)))\n",
       "        print(format_money(apply_tax(total(items), args.tax)))\n"))

step(ANA, "docs: document --tax",
     A("README.md", """
Add tax (the rate is a fraction, so 0.08875 means 8.875%):

    $ billsplit total dinner.csv --tax 0.08875
    28.04
"""))

step(SAM, "chore: add .editorconfig",
     W(".editorconfig", """
root = true

[*]
end_of_line = lf
insert_final_newline = true
charset = utf-8

[*.py]
indent_style = space
indent_size = 4
"""))

step(KOFI, "tax: add_tip(amount, percent)",
     A("billsplit/tax.py", '''

def add_tip(amount: Decimal, percent: Decimal) -> Decimal:
    """Return amount plus a tip of `percent` percent (18 means 18%)."""
    if percent < 0:
        raise ValueError("tip must not be negative")
    return round_money(amount * (1 + percent / 100))
'''))

step(KOFI, "test: add_tip",
     E("tests/test_tax.py", "from billsplit.tax import apply_tax\n", "from billsplit.tax import add_tip, apply_tax\n"),
     A("tests/test_tax.py", '''

def test_add_tip():
    assert add_tip(Decimal("50.00"), Decimal(18)) == Decimal("59.00")
'''))

step(KOFI, "cli: total --tip PERCENT",
     E("billsplit/cli.py", "from .tax import apply_tax\n", "from .tax import add_tip, apply_tax\n"),
     E("billsplit/cli.py",
       '    p_total.add_argument("--tax", type=Decimal, default=Decimal(0), help="tax rate, e.g. 0.08875")\n',
       '    p_total.add_argument("--tax", type=Decimal, default=Decimal(0), help="tax rate, e.g. 0.08875")\n'
       '    p_total.add_argument("--tip", type=Decimal, default=Decimal(0), help="tip in percent, e.g. 18")\n'),
     E("billsplit/cli.py",
       "        print(format_money(apply_tax(total(items), args.tax)))\n",
       "        amount = add_tip(apply_tax(total(items), args.tax), args.tip)\n"
       "        print(format_money(amount))\n"))

step(LIN, "io: report the file and line number of a bad row",
     W("billsplit/io.py", '''
"""Read bill items from CSV files."""

import csv
from typing import Dict, List, Optional

from .ledger import Item
from .money import AmountError, parse_amount


class ItemError(ValueError):
    """A row of a CSV file could not be read."""

    def __init__(self, path: str, line: int, message: str) -> None:
        super().__init__(f"{path}:{line}: {message}")
        self.path = path
        self.line = line


def _is_blank(row: Dict[Optional[str], Optional[str]]) -> bool:
    return all(not (value or "").strip() for key, value in row.items() if key is not None)


def read_items(path: str) -> List[Item]:
    """Read a CSV file with the header row `item,amount`.

    Rows where every field is empty are skipped. A bad row raises ItemError
    with the file name and line number.
    """
    items = []
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if _is_blank(row):
                continue
            try:
                amount = parse_amount(row.get("amount") or "")
            except AmountError as exc:
                raise ItemError(path, reader.line_num, str(exc)) from None
            items.append(Item((row.get("item") or "").strip(), amount))
    return items
'''))

step(LIN, "test: line numbers in errors",
     E("tests/test_io.py", "from decimal import Decimal\n\nfrom billsplit.io import read_items\n",
       "from decimal import Decimal\n\nimport pytest\n\nfrom billsplit.io import ItemError, read_items\n"),
     A("tests/test_io.py", '''

def test_bad_amount_reports_line(tmp_path):
    path = write(tmp_path, "item,amount\\ncoffee,3.50\\nbagel,two\\n")
    with pytest.raises(ItemError) as info:
        read_items(path)
    assert info.value.line == 3
    assert str(info.value).startswith(path + ":3:")
'''))

step(LIN, "cli: print errors to stderr and exit with status 1",
     E("billsplit/cli.py",
       "def main(argv: Optional[List[str]] = None) -> int:\n"
       "    args = build_parser().parse_args(argv)\n"
       "    items = read_items(args.file)\n",
       "def main(argv: Optional[List[str]] = None) -> int:\n"
       "    args = build_parser().parse_args(argv)\n"
       "    try:\n"
       "        return run(args)\n"
       "    except (ValueError, OSError) as exc:\n"
       '        print(f"billsplit: error: {exc}", file=sys.stderr)\n'
       "        return 1\n\n\n"
       "def run(args: argparse.Namespace) -> int:\n"
       "    items = read_items(args.file)\n"))

release(ANA, "0.3.0", "0.2.0", ["`billsplit total --tax RATE --tip PERCENT`.",
                                "Amounts may start with $, € or £.",
                                "Errors name the file and line and go to stderr."])

# ---------------------------------------------------------------------------
# 0.4.0
# ---------------------------------------------------------------------------

step(SAM, "io: rename to csvio so the module no longer shadows the stdlib io\n\n"
     "Inside the package, `import io` is fine today, but the name confuses\n"
     "tools and readers.",
     MV("billsplit/io.py", "billsplit/csvio.py"),
     MV("tests/test_io.py", "tests/test_csvio.py"),
     E("tests/test_csvio.py", "from billsplit.io import ItemError, read_items\n",
       "from billsplit.csvio import ItemError, read_items\n"))

step(SAM, "cli: import read_items from csvio",
     E("billsplit/cli.py", "from .io import read_items\n", "from .csvio import read_items\n"))

step(LIN, "docs: CSV format reference",
     W("docs/csv-format.md", """
# CSV format

- The first row is the header. Column names are lower case.
- `item`: a short name for the line.
- `amount`: the price of the line, such as `3.50`, `$3.50` or `-2.00`.
- Rows where every field is empty are skipped.
- Fields are separated by commas. Put a name that contains a comma in
  double quotes: `"pasta, large",14.00`.
"""))

step(LIN, "csvio: detect ';' as the delimiter",
     E("billsplit/csvio.py", "from typing import Dict, List, Optional\n",
       "from typing import Any, Dict, List, Optional, TextIO\n"),
     E("billsplit/csvio.py", "def _is_blank(",
       'def _dialect(f: TextIO) -> Any:\n'
       '    """Guess "," or ";" from the start of the file, then rewind."""\n'
       "    sample = f.read(4096)\n"
       "    f.seek(0)\n"
       "    try:\n"
       '        return csv.Sniffer().sniff(sample, delimiters=",;")\n'
       "    except csv.Error:\n"
       "        return csv.excel\n\n\n"
       "def _is_blank("),
     E("billsplit/csvio.py", "        reader = csv.DictReader(f)\n",
       "        reader = csv.DictReader(f, dialect=_dialect(f))\n"),
     A("docs/csv-format.md", """- Semicolons work too: `item;amount`. billsplit looks at the start of the
  file to decide.
"""))

step(LIN, "test: semicolon-separated files",
     A("tests/test_csvio.py", '''

def test_semicolon_files(tmp_path):
    path = write(tmp_path, "item;amount\\ncoffee;3.50\\nbagel;2.25\\n")
    assert [i.amount for i in read_items(path)] == [Decimal("3.50"), Decimal("2.25")]
'''))

step(LIN, "csvio: accept files that start with a UTF-8 byte order mark",
     E("billsplit/csvio.py", 'with open(path, newline="", encoding="utf-8") as f:',
       'with open(path, newline="", encoding="utf-8-sig") as f:'))

step(LIN, "test: byte order mark",
     A("tests/test_csvio.py", '''

def test_byte_order_mark(tmp_path):
    path = tmp_path / "bom.csv"
    path.write_bytes(b"\\xef\\xbb\\xbfitem,amount\\ncoffee,3.50\\n")
    assert [i.name for i in read_items(str(path))] == ["coffee"]
'''))

step(ANA, "examples: dinner and road trip bills",
     W("examples/dinner.csv", """
item,amount
pizza,18.50
salad,7.25
"lemonade, large",4.80
tiramisu,6.90
"""),
     W("examples/road-trip.csv", """
item,amount
fuel,41.257
fuel,38.118
tolls,12.40
snacks,9.15
"""))

step(ANA, "docs: link the examples from the README",
     A("README.md", """
Examples live in [examples/](examples/). Fuel prices often have three decimals,
so `examples/road-trip.csv` is a good test of the rounding rule.
"""))

step(KOFI, "split: parse_shares for '2:1:1' style splits",
     E("billsplit/split.py", "from decimal import Decimal\n", "from decimal import Decimal, InvalidOperation\n"),
     A("billsplit/split.py", '''

def parse_shares(spec: str) -> List[Decimal]:
    """Parse a share spec such as '2:1:1' into weights."""
    try:
        return [Decimal(part) for part in spec.split(":")]
    except InvalidOperation:
        raise ValueError(f"bad shares: {spec!r}") from None
'''))

step(KOFI, "test: parse_shares",
     E("tests/test_split.py", "from billsplit.split import split_even, split_weighted\n",
       "from billsplit.split import parse_shares, split_even, split_weighted\n"),
     A("tests/test_split.py", '''

def test_parse_shares():
    assert parse_shares("2:1:1") == [Decimal(2), Decimal(1), Decimal(1)]


def test_parse_shares_rejects_text():
    with pytest.raises(ValueError):
        parse_shares("2:x")
'''))

step(KOFI, "cli: split --shares 2:1:1",
     E("billsplit/cli.py", "from .split import split_even\n", "from .split import parse_shares, split_even, split_weighted\n"),
     E("billsplit/cli.py",
       '    p_split = sub.add_parser("split", help="split a bill evenly")\n'
       '    p_split.add_argument("file", help="CSV file with the columns item,amount")\n'
       '    p_split.add_argument("--people", type=int, required=True, help="number of people")\n',
       '    p_split = sub.add_parser("split", help="split a bill evenly or by shares")\n'
       '    p_split.add_argument("file", help="CSV file with the columns item,amount")\n'
       "    how = p_split.add_mutually_exclusive_group(required=True)\n"
       '    how.add_argument("--people", type=int, help="split evenly between N people")\n'
       '    how.add_argument("--shares", help="split by shares, e.g. 2:1:1")\n'),
     E("billsplit/cli.py",
       "        for share in split_even(total(items), args.people):\n",
       "        if args.shares:\n"
       "            shares = split_weighted(total(items), parse_shares(args.shares))\n"
       "        else:\n"
       "            shares = split_even(total(items), args.people)\n"
       "        for share in shares:\n"))

step(SAM, "chore: release helper script",
     W("scripts/release.sh", """
#!/bin/sh
# Tag a release. Usage: scripts/release.sh 0.4.0
set -eu
version="$1"
git tag "v$version"
echo "tagged v$version; push with: git push origin v$version"
"""))

step(SAM, "chore: configure ruff",
     A("pyproject.toml", """
[tool.ruff]
line-length = 100
target-version = "py39"

[tool.ruff.lint]
select = ["E", "F", "I", "B"]
"""))

step(SAM, "style: module docstring for __main__.py",
     W("billsplit/__main__.py", '''
"""Run billsplit with `python -m billsplit`."""

import sys

from .cli import main

sys.exit(main())
'''))

release(ANA, "0.4.0", "0.3.0", ["`billsplit split --shares 2:1:1`.", "Semicolon-separated files and UTF-8 BOM.",
                                "The `billsplit.io` module is now `billsplit.csvio`."])

# ---------------------------------------------------------------------------
# 0.5.0
# ---------------------------------------------------------------------------

step(KOFI, "ledger: optional payer on Item",
     E("billsplit/ledger.py", "from typing import Iterable\n", "from typing import Iterable, Optional\n"),
     E("billsplit/ledger.py", "    name: str\n    amount: Decimal\n",
       "    name: str\n    amount: Decimal\n    payer: Optional[str] = None\n"))

step(KOFI, "csvio: read an optional payer column",
     E("billsplit/csvio.py",
       '            items.append(Item((row.get("item") or "").strip(), amount))\n',
       '            payer = (row.get("payer") or "").strip() or None\n'
       '            items.append(Item((row.get("item") or "").strip(), amount, payer))\n'),
     A("docs/csv-format.md", """- `payer` (optional): who paid for the line. `billsplit balances` needs it.
"""))

step(KOFI, "test: payer column",
     A("tests/test_csvio.py", '''

def test_payer_column(tmp_path):
    path = write(tmp_path, "item,amount,payer\\ncoffee,3.50,ana\\nbagel,2.25,\\n")
    assert [i.payer for i in read_items(path)] == ["ana", None]
'''))

step(KOFI, "export Item, total and balances from the package",
     E("billsplit/__init__.py", "from .money import AmountError",
       "from .ledger import Item, balances, total\nfrom .money import AmountError"))

step(KOFI, "ledger: balances(items, people)",
     E("billsplit/ledger.py", "from typing import Iterable, Optional\n\nfrom .money import round_money\n",
       "from typing import Dict, Iterable, Optional, Sequence\n\nfrom .money import round_money\nfrom .split import split_even\n"),
     A("billsplit/ledger.py", '''

def balances(items: Iterable[Item], people: Sequence[str]) -> Dict[str, Decimal]:
    """What each person is owed (positive) or owes (negative).

    Everyone shares every item evenly. The payer of an item is credited with
    its full amount. Every item needs a payer from `people`.
    """
    items = list(items)
    if not people:
        raise ValueError("need at least one person")
    paid = {person: Decimal(0) for person in people}
    for item in items:
        if item.payer not in paid:
            raise ValueError(f"item {item.name!r}: payer {item.payer!r} is not in people")
        paid[item.payer] += item.amount
    shares = split_even(total(items), len(people))
    return {person: round_money(paid[person]) - share for person, share in zip(people, shares)}
'''))

step(KOFI, "test: balances",
     E("tests/test_ledger.py", "from decimal import Decimal\n\nfrom billsplit.ledger import Item, total\n",
       "from decimal import Decimal\n\nimport pytest\n\nfrom billsplit.ledger import Item, balances, total\n"),
     A("tests/test_ledger.py", '''

def test_balances():
    items = [Item("hotel", Decimal("90.00"), "ana"), Item("dinner", Decimal("30.00"), "kofi")]
    result = balances(items, ["ana", "kofi", "lin"])
    assert result == {"ana": Decimal("50.00"), "kofi": Decimal("-10.00"), "lin": Decimal("-40.00")}
    assert sum(result.values()) == 0


def test_balances_unknown_payer():
    with pytest.raises(ValueError):
        balances([Item("x", Decimal("1.00"), "sam")], ["ana"])
'''))

step(KOFI, "cli: billsplit balances FILE --people a,b,c",
     E("billsplit/cli.py", "from .ledger import total\n", "from .ledger import balances, total\n"),
     E("billsplit/cli.py", "    return parser\n",
       '\n    p_bal = sub.add_parser("balances", help="who is owed and who owes")\n'
       '    p_bal.add_argument("file", help="CSV file with the columns item,amount,payer")\n'
       '    p_bal.add_argument("--people", required=True, help="comma-separated names")\n'
       "    return parser\n"),
     E("billsplit/cli.py",
       "        for share in shares:\n            print(format_money(share))\n",
       "        for share in shares:\n            print(format_money(share))\n"
       '    elif args.command == "balances":\n'
       '        people = [p.strip() for p in args.people.split(",") if p.strip()]\n'
       "        for person, amount in balances(items, people).items():\n"
       '            print(f"{person} {format_money(amount)}")\n'))

step(ANA, "docs: balances",
     A("README.md", """
Add a `payer` column to see who is owed money:

    $ billsplit balances trip.csv --people ana,kofi,lin
    ana 50.00
    kofi -10.00
    lin -40.00
"""))

step(KOFI, "ledger: settle() lists the payments that clear all balances",
     E("billsplit/ledger.py", "from typing import Dict, Iterable, Optional, Sequence\n",
       "from typing import Dict, Iterable, List, Optional, Sequence\n"),
     A("billsplit/ledger.py", '''

@dataclass(frozen=True)
class Payment:
    """One person pays another."""

    payer: str
    payee: str
    amount: Decimal


def settle(balances: Dict[str, Decimal]) -> List[Payment]:
    """Payments that bring every balance to zero.

    Greedy: the person who owes the most pays the person who is owed the
    most, until everyone is even. This needs at most n - 1 payments.
    """
    creditors = [[p, b] for p, b in sorted(balances.items()) if b > 0]
    debtors = [[p, -b] for p, b in sorted(balances.items()) if b < 0]
    payments = []
    while creditors and debtors:
        creditors.sort(key=lambda e: (-e[1], e[0]))
        debtors.sort(key=lambda e: (-e[1], e[0]))
        creditor, debtor = creditors[0], debtors[0]
        amount = min(creditor[1], debtor[1])
        payments.append(Payment(debtor[0], creditor[0], amount))
        creditor[1] -= amount
        debtor[1] -= amount
        if creditor[1] == 0:
            creditors.pop(0)
        if debtor[1] == 0:
            debtors.pop(0)
    return payments
'''))

step(KOFI, "test: settle",
     E("tests/test_ledger.py", "from billsplit.ledger import Item, balances, total\n",
       "from billsplit.ledger import Item, Payment, balances, settle, total\n"),
     A("tests/test_ledger.py", '''

def test_settle():
    payments = settle({"ana": Decimal("50.00"), "kofi": Decimal("-10.00"), "lin": Decimal("-40.00")})
    assert payments == [Payment("lin", "ana", Decimal("40.00")), Payment("kofi", "ana", Decimal("10.00"))]


def test_settle_nothing_to_do():
    assert settle({"ana": Decimal("0.00")}) == []
'''))

step(KOFI, "cli: billsplit settle",
     E("billsplit/cli.py", "from .ledger import balances, total\n", "from .ledger import balances, settle, total\n"),
     E("billsplit/cli.py", "    return parser\n",
       '\n    p_settle = sub.add_parser("settle", help="payments that make everyone even")\n'
       '    p_settle.add_argument("file", help="CSV file with the columns item,amount,payer")\n'
       '    p_settle.add_argument("--people", required=True, help="comma-separated names")\n'
       "    return parser\n"),
     E("billsplit/cli.py",
       '            print(f"{person} {format_money(amount)}")\n',
       '            print(f"{person} {format_money(amount)}")\n'
       '    elif args.command == "settle":\n'
       '        people = [p.strip() for p in args.people.split(",") if p.strip()]\n'
       "        for payment in settle(balances(items, people)):\n"
       '            print(f"{payment.payer} -> {payment.payee} {format_money(payment.amount)}")\n'))

step(ANA, "docs: how settle works",
     W("docs/settle.md", """
# How `billsplit settle` works

1. Compute every balance (see `billsplit balances`).
2. The person who owes the most pays the person who is owed the most.
   The payment is the smaller of the two amounts.
3. Repeat until every balance is zero.

Each payment brings at least one person to zero, so n people need at most
n - 1 payments. This is not always the smallest possible number of payments,
but it is simple and easy to check by hand.
"""))

step(LIN, "settle: ignore balances smaller than one cent",
     E("billsplit/ledger.py", "from .money import round_money\n", "from .money import CENT, round_money\n"),
     E("billsplit/ledger.py",
       "    creditors = [[p, b] for p, b in sorted(balances.items()) if b > 0]\n"
       "    debtors = [[p, -b] for p, b in sorted(balances.items()) if b < 0]\n",
       "    creditors = [[p, b] for p, b in sorted(balances.items()) if b >= CENT]\n"
       "    debtors = [[p, -b] for p, b in sorted(balances.items()) if b <= -CENT]\n"))

step(LIN, "test: settle with tiny balances",
     A("tests/test_ledger.py", '''

def test_settle_ignores_fractions_of_a_cent():
    assert settle({"ana": Decimal("0.004"), "kofi": Decimal("-0.004")}) == []
'''))

release(ANA, "0.5.0", "0.4.0", ["`billsplit balances` and `billsplit settle`.", "Optional `payer` column."])

# ---------------------------------------------------------------------------
# 0.6.0
# ---------------------------------------------------------------------------

step(SAM, "cli: total --json",
     E("billsplit/cli.py", "import argparse\nimport sys\n", "import argparse\nimport json\nimport sys\n"),
     E("billsplit/cli.py",
       '    p_total.add_argument("--tip", type=Decimal, default=Decimal(0), help="tip in percent, e.g. 18")\n',
       '    p_total.add_argument("--tip", type=Decimal, default=Decimal(0), help="tip in percent, e.g. 18")\n'
       '    p_total.add_argument("--json", action="store_true", help="print JSON")\n'),
     E("billsplit/cli.py",
       "        amount = add_tip(apply_tax(total(items), args.tax), args.tip)\n"
       "        print(format_money(amount))\n",
       "        amount = add_tip(apply_tax(total(items), args.tax), args.tip)\n"
       "        if args.json:\n"
       '            print(json.dumps({"total": format_money(amount)}))\n'
       "        else:\n"
       "            print(format_money(amount))\n"))

step(SAM, "test: command line smoke tests",
     W("tests/test_cli.py", '''
import json

from billsplit.cli import main


def write(tmp_path, text):
    path = tmp_path / "bill.csv"
    path.write_text(text, encoding="utf-8")
    return str(path)


def test_total(tmp_path, capsys):
    path = write(tmp_path, "item,amount\\npizza,18.50\\nsalad,7.25\\n")
    assert main(["total", path]) == 0
    assert capsys.readouterr().out == "25.75\\n"


def test_total_json(tmp_path, capsys):
    path = write(tmp_path, "item,amount\\npizza,18.50\\n")
    assert main(["total", path, "--json"]) == 0
    assert json.loads(capsys.readouterr().out) == {"total": "18.50"}


def test_bad_file_exits_1(tmp_path, capsys):
    path = write(tmp_path, "item,amount\\npizza,lots\\n")
    assert main(["total", path]) == 1
    assert "billsplit: error:" in capsys.readouterr().err
'''))

step(ANA, "cli: label the total line",
     E("billsplit/cli.py",
       "        else:\n            print(format_money(amount))\n",
       '        else:\n            print(f"Total: {format_money(amount)}")\n'),
     E("tests/test_cli.py", 'assert capsys.readouterr().out == "25.75\\n"', 'assert capsys.readouterr().out == "Total: 25.75\\n"'))

step(ANA, "docs: update the README output examples",
     E("README.md", "    $ billsplit total dinner.csv\n    25.75\n", "    $ billsplit total dinner.csv\n    Total: 25.75\n"),
     E("README.md", "    $ billsplit total dinner.csv --tax 0.08875\n    28.04\n",
       "    $ billsplit total dinner.csv --tax 0.08875\n    Total: 28.04\n"))

step(KOFI, "refactor: import Item from billsplit.models\n\n"
     "First step of moving the data types out of ledger.py, so csvio no longer\n"
     "has to import the ledger.",
     E("billsplit/ledger.py",
       '@dataclass(frozen=True)\nclass Item:\n    """One line of a bill."""\n\n'
       "    name: str\n    amount: Decimal\n    payer: Optional[str] = None\n\n\n",
       ""),
     E("billsplit/ledger.py", "from typing import Dict, Iterable, List, Optional, Sequence\n\n",
       "from typing import Dict, Iterable, List, Sequence\n\nfrom .models import Item\n"),
     E("billsplit/csvio.py", "from .ledger import Item\n", "from .models import Item\n"))

step(KOFI, "refactor: add the models module (missing from the last commit)",
     W("billsplit/models.py", '''
"""Data types shared by the billsplit modules."""

from dataclasses import dataclass
from decimal import Decimal
from typing import Optional


@dataclass(frozen=True)
class Item:
    """One line of a bill."""

    name: str
    amount: Decimal
    payer: Optional[str] = None
'''))

step(KOFI, "tax: accept percent strings such as '8.875%'",
     E("billsplit/tax.py", "from decimal import Decimal\n", "from decimal import Decimal, InvalidOperation\n"),
     A("billsplit/tax.py", '''

def parse_rate(text: str) -> Decimal:
    """Parse a tax rate: '0.08875' and '8.875%' both mean 8.875%."""
    cleaned = text.strip()
    percent = cleaned.endswith("%")
    if percent:
        cleaned = cleaned[:-1]
    try:
        rate = Decimal(cleaned)
    except InvalidOperation:
        raise ValueError(f"bad tax rate: {text!r}") from None
    return rate / 100 if percent else rate
'''),
     E("billsplit/cli.py", "from .tax import add_tip, apply_tax\n", "from .tax import add_tip, apply_tax, parse_rate\n"),
     E("billsplit/cli.py",
       'p_total.add_argument("--tax", type=Decimal, default=Decimal(0), help="tax rate, e.g. 0.08875")',
       'p_total.add_argument("--tax", type=parse_rate, default=Decimal(0), help="tax rate, e.g. 8.875%%")'))

step(KOFI, "test: parse_rate",
     E("tests/test_tax.py", "from billsplit.tax import add_tip, apply_tax\n", "from billsplit.tax import add_tip, apply_tax, parse_rate\n"),
     A("tests/test_tax.py", '''

@pytest.mark.parametrize("text", ["0.08875", "8.875%", " 8.875% "])
def test_parse_rate(text):
    assert parse_rate(text) == Decimal("0.08875")
'''))

step(LIN, "money: format_money takes an optional currency symbol",
     E("billsplit/money.py",
       'def format_money(value: Decimal) -> str:\n'
       '    """Format an amount with exactly two decimals: 7 -> \'7.00\'."""\n'
       '    return f"{round_money(value):.2f}"\n',
       'def format_money(value: Decimal, symbol: str = "") -> str:\n'
       '    """Format an amount with two decimals: 7 -> \'7.00\', -3.5 with \'$\' -> \'-$3.50\'."""\n'
       "    rounded = round_money(value)\n"
       '    sign = "-" if rounded < 0 else ""\n'
       '    return f"{sign}{symbol}{abs(rounded):.2f}"\n'))

step(LIN, "cli: --currency SYMBOL",
     E("billsplit/cli.py",
       '    p_total.add_argument("--json", action="store_true", help="print JSON")\n',
       '    p_total.add_argument("--json", action="store_true", help="print JSON")\n'
       '    p_total.add_argument("--currency", default="", help="symbol to print, e.g. $")\n'),
     E("billsplit/cli.py",
       '            print(json.dumps({"total": format_money(amount)}))\n'
       "        else:\n"
       '            print(f"Total: {format_money(amount)}")\n',
       '            print(json.dumps({"total": format_money(amount)}))\n'
       "        else:\n"
       '            print(f"Total: {format_money(amount, args.currency)}")\n'))

step(LIN, "test: currency symbol in output",
     A("tests/test_money.py", '''

def test_format_money_with_symbol():
    assert format_money(Decimal("3.5"), "$") == "$3.50"
    assert format_money(Decimal("-3.5"), "$") == "-$3.50"
'''),
     A("tests/test_cli.py", '''

def test_total_currency(tmp_path, capsys):
    path = write(tmp_path, "item,amount\\npizza,18.50\\n")
    assert main(["total", path, "--currency", "$"]) == 0
    assert capsys.readouterr().out == "Total: $18.50\\n"
'''))

step(ANA, "docs: --currency",
     A("README.md", """
Print a currency symbol:

    $ billsplit total dinner.csv --currency '€'
    Total: €25.75
"""))

step(SAM, "ci: bump actions/checkout and actions/setup-python",
     E(".github/workflows/test.yml", "actions/checkout@v3", "actions/checkout@v4"),
     E(".github/workflows/test.yml", "actions/setup-python@v4", "actions/setup-python@v5"))

release(ANA, "0.6.0", "0.5.0", ["`billsplit total --json` and `--currency`.", "Tax rates may be percent strings.",
                                "The total line now reads `Total: 25.75`."])

# ---------------------------------------------------------------------------
# 0.7.0
# ---------------------------------------------------------------------------

step(KOFI, "split: shares must be positive",
     E("billsplit/split.py",
       "    try:\n        return [Decimal(part) for part in spec.split(\":\")]\n"
       "    except InvalidOperation:\n        raise ValueError(f\"bad shares: {spec!r}\") from None\n",
       "    try:\n        weights = [Decimal(part) for part in spec.split(\":\")]\n"
       "    except InvalidOperation:\n        raise ValueError(f\"bad shares: {spec!r}\") from None\n"
       "    if any(not w.is_finite() or w <= 0 for w in weights):\n"
       "        raise ValueError(f\"shares must be positive numbers: {spec!r}\")\n"
       "    return weights\n"))

step(KOFI, "test: zero and negative shares are rejected",
     A("tests/test_split.py", '''

@pytest.mark.parametrize("spec", ["0:1", "-1:2", "NaN:1"])
def test_parse_shares_rejects_non_positive(spec):
    with pytest.raises(ValueError):
        parse_shares(spec)
'''))

step(LIN, "money: accept thousands separators such as '1,234.50'",
     E("billsplit/money.py", "from decimal import ROUND_HALF_UP", "import re\nfrom decimal import ROUND_HALF_UP"),
     E("billsplit/money.py", 'CURRENCY_SYMBOLS = "$€£"\n',
       'CURRENCY_SYMBOLS = "$€£"\n_THOUSANDS = re.compile(r"^[+-]?\\d{1,3}(,\\d{3})+(\\.\\d+)?$")\n'),
     E("billsplit/money.py", "        cleaned = cleaned[1:].strip()\n",
       "        cleaned = cleaned[1:].strip()\n"
       "    if _THOUSANDS.match(cleaned):\n"
       '        cleaned = cleaned.replace(",", "")\n'))

step(LIN, "test: thousands separators",
     A("tests/test_money.py", '''

def test_parse_thousands_separators():
    assert parse_amount("1,234.50") == Decimal("1234.50")
    assert parse_amount("$12,000") == Decimal("12000")


def test_parse_rejects_misplaced_commas():
    with pytest.raises(AmountError):
        parse_amount("12,34")
'''))

step(SAM, "docs: CONTRIBUTING: run ruff before you push",
     E("CONTRIBUTING.md", "3. Run the tests: `pytest -q`\n",
       "3. Run the tests: `pytest -q`\n4. Run the linter: `ruff check .`\n"))

step(KOFI, "tax: optional per-line rounding",
     E("billsplit/tax.py", "from decimal import Decimal, InvalidOperation\n\nfrom .money import round_money\n",
       "from decimal import Decimal, InvalidOperation\nfrom typing import Iterable\n\n"
       "from .models import Item\nfrom .money import round_money\n"),
     A("billsplit/tax.py", '''

def apply_tax_per_line(items: Iterable[Item], rate: Decimal) -> Decimal:
    """Round the tax of every line to cents, then add up (some receipts do this)."""
    if rate < 0:
        raise ValueError("tax rate must not be negative")
    return sum((round_money(item.amount) + round_money(item.amount * rate) for item in items), Decimal(0)
'''))

step(KOFI, "tax: close the parenthesis in apply_tax_per_line",
     E("billsplit/tax.py",
       "for item in items), Decimal(0)\n",
       "for item in items), Decimal(0))\n"))

step(KOFI, "cli: total --per-line",
     E("billsplit/cli.py", "from .tax import add_tip, apply_tax, parse_rate\n",
       "from .tax import add_tip, apply_tax, apply_tax_per_line, parse_rate\n"),
     E("billsplit/cli.py",
       '    p_total.add_argument("--json", action="store_true", help="print JSON")\n',
       '    p_total.add_argument("--per-line", action="store_true", help="round the tax of each line")\n'
       '    p_total.add_argument("--json", action="store_true", help="print JSON")\n'),
     E("billsplit/cli.py",
       "        amount = add_tip(apply_tax(total(items), args.tax), args.tip)\n",
       "        if args.per_line:\n"
       "            subtotal = apply_tax_per_line(items, args.tax)\n"
       "        else:\n"
       "            subtotal = apply_tax(total(items), args.tax)\n"
       "        amount = add_tip(subtotal, args.tip)\n"))

step(KOFI, "test: per-line tax",
     E("tests/test_tax.py", "from billsplit.tax import add_tip, apply_tax, parse_rate\n",
       "from billsplit.models import Item\nfrom billsplit.tax import add_tip, apply_tax, apply_tax_per_line, parse_rate\n"),
     A("tests/test_tax.py", '''

def test_per_line_tax_can_differ():
    items = [Item("a", Decimal("0.10")), Item("b", Decimal("0.10")), Item("c", Decimal("0.10"))]
    assert apply_tax(Decimal("0.30"), Decimal("0.05")) == Decimal("0.32")
    assert apply_tax_per_line(items, Decimal("0.05")) == Decimal("0.33")
'''))

step(ANA, "docs: per-line tax rounding",
     A("docs/rounding.md", """
## Tax

`billsplit total --tax 5%` adds the tax to the total and rounds once.
Some receipts round the tax of every line instead. Use `--per-line` to match
them. The two can differ by a few cents.
"""))

release(ANA, "0.7.0", "0.6.0", ["`billsplit total --per-line`.", "Thousands separators such as `1,234.50`.",
                                "Shares must be positive."])

# ---------------------------------------------------------------------------
# 0.8.0
# ---------------------------------------------------------------------------

step(LIN, "models: Item.quantity and Item.line_total",
     E("billsplit/models.py", "    payer: Optional[str] = None\n",
       "    payer: Optional[str] = None\n"
       "    quantity: int = 1\n\n"
       "    @property\n"
       "    def line_total(self) -> Decimal:\n"
       '        """amount times quantity, not rounded."""\n'
       "        return self.amount * self.quantity\n"))

step(LIN, "csvio: optional quantity column",
     E("billsplit/csvio.py",
       '            payer = (row.get("payer") or "").strip() or None\n'
       '            items.append(Item((row.get("item") or "").strip(), amount, payer))\n',
       '            payer = (row.get("payer") or "").strip() or None\n'
       '            quantity_text = (row.get("quantity") or "1").strip()\n'
       "            if not quantity_text.isdigit() or int(quantity_text) < 1:\n"
       '                raise ItemError(path, reader.line_num, f"bad quantity: {quantity_text!r}")\n'
       '            items.append(Item((row.get("item") or "").strip(), amount, payer, int(quantity_text)))\n'))

step(LIN, "test: quantity column",
     A("tests/test_csvio.py", '''

def test_quantity_column(tmp_path):
    path = write(tmp_path, "item,amount,quantity\\ncoffee,3.50,2\\nbagel,2.25,\\n")
    assert [i.quantity for i in read_items(path)] == [2, 1]


def test_bad_quantity(tmp_path):
    path = write(tmp_path, "item,amount,quantity\\ncoffee,3.50,0\\n")
    with pytest.raises(ItemError):
        read_items(path)
'''))

step(LIN, "ledger: total() and balances() use line_total",
     E("billsplit/ledger.py", "    return round_money(sum((item.amount for item in items), Decimal(0)))\n",
       "    return round_money(sum((item.line_total for item in items), Decimal(0)))\n"),
     E("billsplit/ledger.py", "        paid[item.payer] += item.amount\n", "        paid[item.payer] += item.line_total\n"),
     E("billsplit/tax.py",
       "round_money(item.amount) + round_money(item.amount * rate)",
       "round_money(item.line_total) + round_money(item.line_total * rate)"))

step(LIN, "test: total with quantities",
     A("tests/test_ledger.py", '''

def test_total_uses_quantity():
    items = [Item("coffee", Decimal("3.50"), quantity=3), Item("bagel", Decimal("2.25"))]
    assert total(items) == Decimal("12.75")
'''))

step(ANA, "docs: quantity column",
     A("docs/csv-format.md", """- `quantity` (optional, default 1): how many of the item. The line costs
  amount times quantity.
"""))

step(SAM, "cli: one handler function per command",
     W("billsplit/cli.py", '''
"""Command line interface for billsplit."""

import argparse
import json
import sys
from decimal import Decimal
from typing import Callable, Dict, List, Optional

from .csvio import read_items
from .ledger import balances, settle, total
from .money import format_money
from .split import parse_shares, split_even, split_weighted
from .tax import add_tip, apply_tax, apply_tax_per_line, parse_rate


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="billsplit", description="Split shared bills fairly, to the cent."
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_total = sub.add_parser("total", help="print the total of a bill")
    p_total.add_argument("file", help="CSV file with the columns item,amount")
    p_total.add_argument("--tax", type=parse_rate, default=Decimal(0), help="tax rate, e.g. 8.875%%")
    p_total.add_argument("--tip", type=Decimal, default=Decimal(0), help="tip in percent, e.g. 18")
    p_total.add_argument("--per-line", action="store_true", help="round the tax of each line")
    p_total.add_argument("--json", action="store_true", help="print JSON")
    p_total.add_argument("--currency", default="", help="symbol to print, e.g. $")

    p_split = sub.add_parser("split", help="split a bill evenly or by shares")
    p_split.add_argument("file", help="CSV file with the columns item,amount")
    how = p_split.add_mutually_exclusive_group(required=True)
    how.add_argument("--people", type=int, help="split evenly between N people")
    how.add_argument("--shares", help="split by shares, e.g. 2:1:1")

    p_bal = sub.add_parser("balances", help="who is owed and who owes")
    p_bal.add_argument("file", help="CSV file with the columns item,amount,payer")
    p_bal.add_argument("--people", required=True, help="comma-separated names")

    p_settle = sub.add_parser("settle", help="payments that make everyone even")
    p_settle.add_argument("file", help="CSV file with the columns item,amount,payer")
    p_settle.add_argument("--people", required=True, help="comma-separated names")
    return parser


def _people(text: str) -> List[str]:
    return [p.strip() for p in text.split(",") if p.strip()]


def cmd_total(args: argparse.Namespace) -> int:
    items = read_items(args.file)
    if args.per_line:
        subtotal = apply_tax_per_line(items, args.tax)
    else:
        subtotal = apply_tax(total(items), args.tax)
    amount = add_tip(subtotal, args.tip)
    if args.json:
        print(json.dumps({"total": format_money(amount)}))
    else:
        print(f"Total: {format_money(amount, args.currency)}")
    return 0


def cmd_split(args: argparse.Namespace) -> int:
    items = read_items(args.file)
    if args.shares:
        shares = split_weighted(total(items), parse_shares(args.shares))
    else:
        shares = split_even(total(items), args.people)
    for share in shares:
        print(format_money(share))
    return 0


def cmd_balances(args: argparse.Namespace) -> int:
    for person, amount in balances(read_items(args.file), _people(args.people)).items():
        print(f"{person} {format_money(amount)}")
    return 0


def cmd_settle(args: argparse.Namespace) -> int:
    for payment in settle(balances(read_items(args.file), _people(args.people))):
        print(f"{payment.payer} -> {payment.payee} {format_money(payment.amount)}")
    return 0


COMMANDS: Dict[str, Callable[[argparse.Namespace], int]] = {
    "total": cmd_total,
    "split": cmd_split,
    "balances": cmd_balances,
    "settle": cmd_settle,
}


def main(argv: Optional[List[str]] = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        return COMMANDS[args.command](args)
    except (ValueError, OSError) as exc:
        print(f"billsplit: error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
'''))

step(SAM, "test: smoke test every command",
     A("tests/test_cli.py", '''

def test_split_and_settle(tmp_path, capsys):
    path = write(tmp_path, "item,amount,payer\\nhotel,90.00,ana\\ndinner,30.00,kofi\\n")
    assert main(["split", path, "--people", "3"]) == 0
    assert capsys.readouterr().out == "40.00\\n40.00\\n40.00\\n"
    assert main(["split", path, "--shares", "2:1:1"]) == 0
    assert capsys.readouterr().out == "60.00\\n30.00\\n30.00\\n"
    assert main(["balances", path, "--people", "ana,kofi,lin"]) == 0
    assert capsys.readouterr().out == "ana 50.00\\nkofi -10.00\\nlin -40.00\\n"
    assert main(["settle", path, "--people", "ana,kofi,lin"]) == 0
    assert capsys.readouterr().out == "lin -> ana 40.00\\nkofi -> ana 10.00\\n"
'''))

step(SAM, "chore: Makefile with test and lint targets",
     W("Makefile", """
.PHONY: test lint

test:
\tpython3 -m pytest -q

lint:
\truff check .
"""))

step(LIN, "money: AmountError keeps the original text",
     E("billsplit/money.py",
       'class AmountError(ValueError):\n    """Raised when a text value is not a valid amount."""\n',
       'class AmountError(ValueError):\n    """Raised when a text value is not a valid amount."""\n\n'
       "    def __init__(self, message: str, text: str = \"\") -> None:\n"
       "        super().__init__(message)\n"
       "        self.text = text\n"),
     E("billsplit/money.py", 'raise AmountError("empty amount")', 'raise AmountError("empty amount", text)'),
     E("billsplit/money.py", 'raise AmountError(f"not a number: {text!r}") from None',
       'raise AmountError(f"not a number: {text!r}", text) from None'),
     E("billsplit/money.py", 'raise AmountError(f"not a finite number: {text!r}")',
       'raise AmountError(f"not a finite number: {text!r}", text)'),
     A("tests/test_money.py", '''

def test_amount_error_keeps_text():
    with pytest.raises(AmountError) as info:
        parse_amount("12.5.0")
    assert info.value.text == "12.5.0"
'''))

step(KOFI, "docs: docstrings for the split module",
     E("billsplit/split.py", '"""Split an amount into shares that add up exactly."""\n',
       '"""Split an amount into shares that add up exactly.\n\n'
       "All functions work in whole cents. The shares they return always add up\n"
       "to the rounded total, so nobody pays a cent more or less than the bill.\n"
       '"""\n'))

release(ANA, "0.8.0", "0.7.0", ["Optional `quantity` column.", "`AmountError.text` holds the bad input."])

# ---------------------------------------------------------------------------
# 0.9.0
# ---------------------------------------------------------------------------

step(LIN, "csvio: strict mode rejects unknown columns",
     E("billsplit/csvio.py", "class ItemError(ValueError):",
       'KNOWN_COLUMNS = {"item", "amount", "payer", "quantity"}\n\n\nclass ItemError(ValueError):'),
     E("billsplit/csvio.py", "def read_items(path: str) -> List[Item]:",
       "def read_items(path: str, strict: bool = False) -> List[Item]:"),
     E("billsplit/csvio.py",
       "    with the file name and line number.\n",
       "    with the file name and line number. With strict=True, unknown columns\n"
       "    are an error too.\n"),
     E("billsplit/csvio.py",
       "        reader = csv.DictReader(f, dialect=_dialect(f))\n",
       "        reader = csv.DictReader(f, dialect=_dialect(f))\n"
       "        if strict:\n"
       "            unknown = sorted(set(reader.fieldnames or []) - KNOWN_COLUMNS)\n"
       "            if unknown:\n"
       "                raise ItemError(path, 1, f\"unknown columns: {', '.join(unknown)}\")\n"))

step(LIN, "test: strict mode",
     A("tests/test_csvio.py", '''

def test_strict_rejects_unknown_columns(tmp_path):
    path = write(tmp_path, "item,amount,colour\\ncoffee,3.50,red\\n")
    assert len(read_items(path)) == 1
    with pytest.raises(ItemError):
        read_items(path, strict=True)
'''))

step(LIN, "cli: --strict for every command",
     E("billsplit/cli.py", "    sub = parser.add_subparsers(dest=\"command\", required=True)\n",
       "    sub = parser.add_subparsers(dest=\"command\", required=True)\n"
       "    common = argparse.ArgumentParser(add_help=False)\n"
       '    common.add_argument("--strict", action="store_true", help="reject unknown CSV columns")\n'),
     E("billsplit/cli.py", 'sub.add_parser("total", help=', 'sub.add_parser("total", parents=[common], help='),
     E("billsplit/cli.py", 'sub.add_parser("split", help=', 'sub.add_parser("split", parents=[common], help='),
     E("billsplit/cli.py", 'sub.add_parser("balances", help=', 'sub.add_parser("balances", parents=[common], help='),
     E("billsplit/cli.py", 'sub.add_parser("settle", help=', 'sub.add_parser("settle", parents=[common], help='),
     E("billsplit/cli.py", "read_items(args.file)", "read_items(args.file, args.strict)", count=4))

step(ANA, "docs: --strict",
     A("docs/csv-format.md", """- Other columns are ignored. Pass `--strict` to make them an error, which
  catches typos such as `amuont`.
"""))

step(KOFI, "test: negative lines (discounts and refunds)",
     A("tests/test_ledger.py", '''

def test_discount_lines_are_negative():
    items = [Item("pizza", Decimal("18.50")), Item("coupon", Decimal("-5.00"))]
    assert total(items) == Decimal("13.50")
'''))

step(KOFI, "split: name the leftover cents",
     E("billsplit/split.py",
       "    leftover = cents - sum(floors)\n",
       "      leftover_cents = cents - sum(floors)\n"),
     E("billsplit/split.py", "    for k in order[:leftover]:\n", "    for k in order[:leftover_cents]:\n"))

step(KOFI, "split: fix the indentation of leftover_cents",
     E("billsplit/split.py",
       "      leftover_cents = cents - sum(floors)\n",
       "    leftover_cents = cents - sum(floors)\n"))

step(ANA, "docs: discounts are negative lines",
     A("docs/csv-format.md", """- A discount or refund is a line with a negative amount: `coupon,-5.00`.
"""))

step(LIN, "csvio: collapse repeated spaces in item names",
     E("billsplit/csvio.py",
       'items.append(Item((row.get("item") or "").strip(), amount, payer, int(quantity_text)))',
       'name = " ".join((row.get("item") or "").split())\n'
       "            items.append(Item(name, amount, payer, int(quantity_text)))"))

step(LIN, "test: item names are normalized",
     A("tests/test_csvio.py", '''

def test_names_are_normalized(tmp_path):
    path = write(tmp_path, 'item,amount\\n"  iced   tea ",3.50\\n')
    assert [i.name for i in read_items(path)] == ["iced tea"]
'''))

step(SAM, "chore: py.typed marker",
     W("billsplit/py.typed", ""),
     A("pyproject.toml", """
[tool.setuptools.package-data]
billsplit = ["py.typed"]
"""))

step(SAM, "typing: annotate the csvio helpers",
     E("billsplit/csvio.py", "    items = []\n", "    items: List[Item] = []\n"))

step(SAM, "ci: test on Python 3.9 to 3.13",
     E(".github/workflows/test.yml", "    runs-on: ubuntu-latest\n",
       "    runs-on: ubuntu-latest\n    strategy:\n      matrix:\n"
       '        python: ["3.9", "3.10", "3.11", "3.12", "3.13"]\n'),
     E(".github/workflows/test.yml", 'python-version: "3.12"', "python-version: ${{ matrix.python }}"))

step(LIN, "test: every example file loads",
     W("tests/test_examples.py", '''
from pathlib import Path

import pytest

from billsplit.csvio import read_items

EXAMPLES = sorted((Path(__file__).parent.parent / "examples").glob("*.csv"))


@pytest.mark.parametrize("path", EXAMPLES, ids=lambda p: p.name)
def test_example_loads(path):
    assert read_items(str(path))
'''))

step(ANA, "docs: FAQ",
     W("docs/faq.md", """
# FAQ

**Why do the shares differ by one cent?**
10.00 split three ways is 3.33 + 3.33 + 3.33 = 9.99. One person has to pay
the last cent. billsplit gives extra cents to the first people in the list.

**Why does the total differ from my calculator?**
billsplit adds the exact amounts and rounds once at the end. Your calculator
may round every line. See docs/rounding.md.
"""))

step(SAM, "money: cache parsed amounts\n\nLarge files repeat the same prices many times.",
     E("billsplit/money.py", "def parse_amount(text: str) -> Decimal:\n",
       "@functools.lru_cache(maxsize=4096)\ndef parse_amount(text: str) -> Decimal:\n"))

step(SAM, "money: import functools",
     E("billsplit/money.py", "import re\n", "import functools\nimport re\n"))

step(SAM, "money: remove the parse cache (no measurable gain)",
     E("billsplit/money.py", "import functools\nimport re\n", "import re\n"),
     E("billsplit/money.py", "@functools.lru_cache(maxsize=4096)\ndef parse_amount", "def parse_amount"))

step(ANA, "docs: rounding examples with fuel prices",
     A("docs/rounding.md", """
## Example

`examples/road-trip.csv` has two fuel lines, 41.257 and 38.118. Their exact
sum is 79.375, which rounds to 79.38. The whole file totals 100.93.
"""))

step(LIN, "test: format and parse round trip",
     A("tests/test_money.py", '''

@pytest.mark.parametrize("text", ["0.00", "1.05", "-7.20", "1234.56"])
def test_format_parse_round_trip(text):
    assert format_money(parse_amount(text)) == text
'''))

step(KOFI, "ledger: subtotals(items) per payer",
     A("billsplit/ledger.py", '''

def subtotals(items: Iterable[Item]) -> Dict[str, Decimal]:
    """Total per payer, each rounded once to whole cents.

    Items without a payer are listed under "(nobody)".
    """
    sums: Dict[str, Decimal] = {}
    for item in items:
        key = item.payer or "(nobody)"
        sums[key] = sums.get(key, Decimal(0)) + item.line_total
    return {key: round_money(value) for key, value in sums.items()}
'''))

step(KOFI, "test: subtotals",
     E("tests/test_ledger.py", "from billsplit.ledger import Item, Payment, balances, settle, total\n",
       "from billsplit.ledger import Item, Payment, balances, settle, subtotals, total\n"),
     A("tests/test_ledger.py", '''

def test_subtotals():
    items = [Item("a", Decimal("1.00"), "ana"), Item("b", Decimal("2.50")), Item("c", Decimal("3.00"), "ana")]
    assert subtotals(items) == {"ana": Decimal("4.00"), "(nobody)": Decimal("2.50")}
'''))

step(KOFI, "cli: total --by-payer",
     E("billsplit/cli.py", "from .ledger import balances, settle, total\n",
       "from .ledger import balances, settle, subtotals, total\n"),
     E("billsplit/cli.py",
       '    p_total.add_argument("--currency", default="", help="symbol to print, e.g. $")\n',
       '    p_total.add_argument("--currency", default="", help="symbol to print, e.g. $")\n'
       '    p_total.add_argument("--by-payer", action="store_true", help="also print a subtotal per payer")\n'),
     E("billsplit/cli.py",
       '        print(f"Total: {format_money(amount, args.currency)}")\n    return 0\n',
       '        print(f"Total: {format_money(amount, args.currency)}")\n'
       "        if args.by_payer:\n"
       "            for payer, value in subtotals(items).items():\n"
       '                print(f"  {payer}: {format_money(value, args.currency)}")\n'
       "    return 0\n"))

step(KOFI, "test: --by-payer output",
     A("tests/test_cli.py", '''

def test_total_by_payer(tmp_path, capsys):
    path = write(tmp_path, "item,amount,payer\\nhotel,90.00,ana\\ndinner,30.00,kofi\\n")
    assert main(["total", path, "--by-payer"]) == 0
    assert capsys.readouterr().out == "Total: 120.00\\n  ana: 90.00\\n  kofi: 30.00\\n"
'''))

release(ANA, "0.9.0", "0.8.0", ["`--strict` rejects unknown columns.", "`billsplit total --by-payer`.",
                                "Item names are normalized."])

# ---------------------------------------------------------------------------
# 1.0.0
# ---------------------------------------------------------------------------

step(ANA, "docs: tidy the changelog wording",
     E("CHANGELOG.md", "- First release: `billsplit total`.\n", "- First release with `billsplit total`.\n"))

step(LIN, "csvio: accept 'price' as another name for the amount column",
     E("billsplit/csvio.py", 'KNOWN_COLUMNS = {"item", "amount", "payer", "quantity"}',
       'KNOWN_COLUMNS = {"item", "amount", "price", "payer", "quantity"}'),
     E("billsplit/csvio.py",
       "        for row in reader:\n",
       "        fields = reader.fieldnames or []\n"
       '        amount_column = "price" if "price" in fields and "amount" not in fields else "amount"\n'
       "        for row in reader:\n"),
     E("billsplit/csvio.py", 'amount = parse_amount(row.get("amount") or "")',
       'amount = parse_amount(row.get(amount_column) or "")'))

step(LIN, "test: price column",
     A("tests/test_csvio.py", '''

def test_price_column(tmp_path):
    path = write(tmp_path, "item,price\\ncoffee,3.50\\n")
    assert [i.amount for i in read_items(path)] == [Decimal("3.50")]
'''))

step(SAM, "chore: pin the ruff version in the Makefile",
     E("Makefile", "\truff check .\n", "\tpython3 -m pip install 'ruff==0.6.9' >/dev/null\n\truff check .\n"))

step(KOFI, "ledger: keep running totals in whole cents\n\n"
     "Adding integer cents makes it obvious that totals are exact, and it is\n"
     "faster for large files. to_cents and from_cents live in money.py so\n"
     "split.py can use them too.",
     E("billsplit/money.py",
       '\n\ndef format_money(',
       '\n\ndef to_cents(value: Decimal) -> int:\n'
       '    """Return an amount as a whole number of cents."""\n'
       "    return int(value * 100)\n\n\n"
       "def from_cents(cents: int) -> Decimal:\n"
       '    """Return whole cents as an amount with two decimals."""\n'
       "    return Decimal(cents) * CENT\n\n\n"
       "def format_money("),
     E("billsplit/ledger.py", "from .money import CENT, round_money\n",
       "from .money import CENT, from_cents, round_money, to_cents\n"),
     E("billsplit/ledger.py",
       "    return round_money(sum((item.line_total for item in items), Decimal(0)))\n",
       "    cents = 0\n"
       "    for item in items:\n"
       "        cents += to_cents(item.line_total)\n"
       "    return from_cents(cents)\n"),
     E("billsplit/ledger.py",
       "    sums: Dict[str, Decimal] = {}\n"
       "    for item in items:\n"
       '        key = item.payer or "(nobody)"\n'
       "        sums[key] = sums.get(key, Decimal(0)) + item.line_total\n"
       "    return {key: round_money(value) for key, value in sums.items()}\n",
       "    cents: Dict[str, int] = {}\n"
       "    for item in items:\n"
       '        key = item.payer or "(nobody)"\n'
       "        cents[key] = cents.get(key, 0) + to_cents(item.line_total)\n"
       "    return {key: from_cents(value) for key, value in cents.items()}\n"))

step(KOFI, "test: totals stay exact for many items",
     A("tests/test_ledger.py", '''

def test_total_of_many_small_items_is_exact():
    items = [Item(f"item{k}", Decimal("0.10")) for k in range(1000)]
    assert total(items) == Decimal("100.00")


def test_subtotals_of_many_items():
    items = [Item("x", Decimal("19.99"), "ana")] * 50
    assert subtotals(items) == {"ana": Decimal("999.50")}
'''))

step(KOFI, "split: use to_cents in split_even and split_weighted",
     E("billsplit/split.py", "from .money import CENT, round_money\n", "from .money import CENT, round_money, to_cents\n"),
     E("billsplit/split.py", "    cents = int(round_money(total) / CENT)\n", "    cents = to_cents(round_money(total))\n", count=2))

step(ANA, "docs: README: settle example",
     A("README.md", """
And the payments that make everyone even:

    $ billsplit settle trip.csv --people ana,kofi,lin
    lin -> ana 40.00
    kofi -> ana 10.00
"""))

step(LIN, "csvio: clearer error for a missing amount column",
     E("billsplit/csvio.py",
       "        for row in reader:\n",
       "        if amount_column not in fields:\n"
       "            raise ItemError(path, 1, \"missing column 'amount' (or 'price')\")\n"
       "        for row in reader:\n"))

step(LIN, "test: missing amount column",
     A("tests/test_csvio.py", '''

def test_missing_amount_column(tmp_path):
    path = write(tmp_path, "item,cost\\ncoffee,3.50\\n")
    with pytest.raises(ItemError, match="missing column"):
        read_items(path)
'''))

step(SAM, "style: wrap a long line in cli.py",
     E("billsplit/cli.py",
       '    p_total.add_argument("--by-payer", action="store_true", help="also print a subtotal per payer")\n',
       '    p_total.add_argument(\n'
       '        "--by-payer", action="store_true", help="also print a subtotal per payer"\n'
       "    )\n"))

step(ANA, "docs: quoted names in CSV examples",
     A("docs/csv-format.md", """
Example with a quoted name:

    item,amount
    "pasta, large",14.00
    water,0.00
"""))

step(KOFI, "settle: list payments in a stable order",
     E("billsplit/ledger.py", "    return payments\n",
       "    payments.sort(key=lambda p: (-p.amount, p.payer, p.payee))\n    return payments\n"))

step(KOFI, "test: payments come out in a stable order",
     A("tests/test_ledger.py", '''

def test_settle_order_is_stable():
    bal = {"a": Decimal("10.00"), "b": Decimal("10.00"), "c": Decimal("-10.00"), "d": Decimal("-10.00")}
    assert settle(bal) == [Payment("c", "a", Decimal("10.00")), Payment("d", "b", Decimal("10.00"))]
'''))

step(LIN, "models: Item rejects amounts that are not finite",
     E("billsplit/models.py", "from typing import Optional\n",
       "from typing import Optional\n\nfrom .money import AmountError\n"),
     E("billsplit/models.py", "    quantity: int = 1\n",
       "    quantity: int = 1\n\n"
       "    def __post_init__(self) -> None:\n"
       "        if not self.amount.is_finite():\n"
       '            raise AmountError(f"item {self.name!r}: amount is not finite", str(self.amount))\n'))

step(LIN, "test: Item rejects NaN",
     W("tests/test_models.py", '''
from decimal import Decimal

import pytest

from billsplit.models import Item
from billsplit.money import AmountError


def test_item_rejects_nan():
    with pytest.raises(AmountError):
        Item("x", Decimal("NaN"))


def test_line_total():
    assert Item("x", Decimal("2.50"), quantity=4).line_total == Decimal("10.00")
'''))

release(ANA, "1.0.0", "0.9.0", ["Stable API: `billsplit.csvio`, `billsplit.ledger`, `billsplit.split`, `billsplit.tax`.",
                                "`price` works as the amount column.", "`settle` lists payments in a stable order."])

# ---------------------------------------------------------------------------
# 1.1.0
# ---------------------------------------------------------------------------

step(SAM, "docs: support policy",
     A("CONTRIBUTING.md", """
## Support

We support the Python versions in the CI matrix. Bug fixes go to the latest
release only.
"""))

step(KOFI, "cli: settle --currency",
     E("billsplit/cli.py",
       '    p_settle.add_argument("--people", required=True, help="comma-separated names")\n',
       '    p_settle.add_argument("--people", required=True, help="comma-separated names")\n'
       '    p_settle.add_argument("--currency", default="", help="symbol to print, e.g. $")\n'),
     E("billsplit/cli.py",
       'print(f"{payment.payer} -> {payment.payee} {format_money(payment.amount)}")',
       'print(f"{payment.payer} -> {payment.payee} {format_money(payment.amount, args.currency)}")'))

step(KOFI, "test: settle with a currency symbol",
     A("tests/test_cli.py", '''

def test_settle_currency(tmp_path, capsys):
    path = write(tmp_path, "item,amount,payer\\nhotel,90.00,ana\\n")
    assert main(["settle", path, "--people", "ana,kofi", "--currency", "$"]) == 0
    assert capsys.readouterr().out == "kofi -> ana $45.00\\n"
'''))

step(LIN, "money: sum_amounts() helper with type hints",
     E("billsplit/money.py", "from decimal import ROUND_HALF_UP, Decimal, InvalidOperation\n",
       "from decimal import ROUND_HALF_UP, Decimal, InvalidOperation\nfrom typing import Iterable\n\nfrom .models import Item\n"),
     A("billsplit/money.py", '''

def sum_amounts(items: Iterable[Item]) -> Decimal:
    """Exact sum of the line totals, not rounded."""
    return sum((item.line_total for item in items), Decimal(0))
'''))

step(LIN, "money: import Item only for type checking (circular import)",
     E("billsplit/money.py", "from typing import Iterable\n\nfrom .models import Item\n",
       "from typing import TYPE_CHECKING, Iterable\n\nif TYPE_CHECKING:\n    from .models import Item\n"),
     E("billsplit/money.py", "def sum_amounts(items: Iterable[Item]) -> Decimal:",
       'def sum_amounts(items: "Iterable[Item]") -> Decimal:'))

step(LIN, "test: sum_amounts",
     A("tests/test_money.py", '''

def test_sum_amounts_is_exact():
    from billsplit.models import Item
    from billsplit.money import sum_amounts

    assert sum_amounts([Item("a", Decimal("0.005"), quantity=3)]) == Decimal("0.015")
'''))

step(ANA, "docs: API overview",
     W("docs/api.md", """
# Python API

    from billsplit.csvio import read_items
    from billsplit.ledger import balances, settle, total

    items = read_items("examples/dinner.csv")
    print(total(items))

- `billsplit.csvio.read_items(path, strict=False)` reads a bill.
- `billsplit.ledger.total(items)` adds up a bill.
- `billsplit.ledger.balances(items, people)` and `settle(balances)`.
- `billsplit.split.split_even`, `split_weighted`, `parse_shares`.
- `billsplit.tax.apply_tax`, `apply_tax_per_line`, `add_tip`, `parse_rate`.
- `billsplit.money.parse_amount`, `round_money`, `format_money`.
"""))

step(KOFI, "cli: --people must be at least 1",
     E("billsplit/cli.py", "def _people(text: str) -> List[str]:",
       "def _positive_int(text: str) -> int:\n"
       "    value = int(text)\n"
       "    if value < 1:\n"
       '        raise argparse.ArgumentTypeError("must be at least 1")\n'
       "    return value\n\n\n"
       "def _people(text: str) -> List[str]:"),
     E("billsplit/cli.py", 'how.add_argument("--people", type=int,', 'how.add_argument("--people", type=_positive_int,'))

step(KOFI, "test: the CLI rejects zero people",
     E("tests/test_cli.py", "import json\n", "import json\n\nimport pytest\n"),
     A("tests/test_cli.py", '''

def test_split_zero_people(tmp_path):
    path = write(tmp_path, "item,amount\\npizza,18.50\\n")
    with pytest.raises(SystemExit):
        main(["split", path, "--people", "0"])
'''))

step(SAM, "ci: cache pip downloads",
     E(".github/workflows/test.yml", "          python-version: ${{ matrix.python }}\n",
       "          python-version: ${{ matrix.python }}\n          cache: pip\n"))

step(LIN, "csvio: read from stdin when the file is '-'",
     E("billsplit/csvio.py", "import csv\n", "import csv\nimport io\nimport sys\n"),
     E("billsplit/csvio.py", "def _dialect(",
       "def _open(path: str) -> TextIO:\n"
       '    """Open a CSV file, or standard input when path is \'-\'."""\n'
       '    if path == "-":\n'
       '        return io.StringIO(sys.stdin.buffer.read().decode("utf-8-sig"), newline="")\n'
       '    return open(path, newline="", encoding="utf-8-sig")\n\n\n'
       "def _dialect("),
     E("billsplit/csvio.py", '    with open(path, newline="", encoding="utf-8-sig") as f:\n', "    with _open(path) as f:\n"))

step(LIN, "test: standard input",
     A("tests/test_csvio.py", '''

def test_read_from_stdin(monkeypatch):
    import io
    import sys

    monkeypatch.setattr(sys, "stdin", io.TextIOWrapper(io.BytesIO(b"item,amount\\ntea,2.00\\n")))
    assert [i.amount for i in read_items("-")] == [Decimal("2.00")]
'''))

step(ANA, "docs: reading from standard input",
     A("README.md", """
Use `-` to read the bill from standard input:

    $ cat dinner.csv | billsplit total -
"""))

release(ANA, "1.1.0", "1.0.0", ["Read from standard input with `-`.", "`settle --currency`.",
                                "`--people` must be at least 1."])

# ---------------------------------------------------------------------------
# 1.2.0
# ---------------------------------------------------------------------------

step(KOFI, "ledger: name the item in the unknown payer error",
     E("billsplit/ledger.py",
       'raise ValueError(f"item {item.name!r}: payer {item.payer!r} is not in people")',
       'raise ValueError(\n                f"item {item.name!r} was paid by {item.payer!r}, who is not in --people"\n            )'))

step(KOFI, "test: unknown payer message",
     A("tests/test_ledger.py", '''

def test_unknown_payer_message():
    with pytest.raises(ValueError, match="not in --people"):
        balances([Item("taxi", Decimal("9.00"), "sam")], ["ana", "kofi"])
'''))

step(SAM, "chore: ruff: also check pyupgrade rules",
     E("pyproject.toml", 'select = ["E", "F", "I", "B"]', 'select = ["E", "F", "I", "B", "UP"]'))

step(LIN, "money: amounts in parentheses are negative, as in accounting",
     E("billsplit/money.py",
       "    cleaned = text.strip()\n    if not cleaned:\n",
       "    cleaned = text.strip()\n"
       '    negative = cleaned.startswith("(") and cleaned.endswith(")")\n'
       "    if negative:\n"
       "        cleaned = cleaned[1:-1].strip()\n"
       "    if not cleaned:\n"),
     E("billsplit/money.py", "    return value\n\n\ndef round_money", "    return -value if negative else value\n\n\ndef round_money"))

step(LIN, "test: parentheses mean negative",
     A("tests/test_money.py", '''

def test_parentheses_are_negative():
    assert parse_amount("(5.00)") == Decimal("-5.00")
    assert parse_amount("($1,200.00)") == Decimal("-1200.00")
'''))

step(ANA, "docs: accounting-style negatives",
     A("docs/csv-format.md", """- Accounting style works too: `(5.00)` means `-5.00`.
"""))

step(SAM, "chore: remove unused files\n\nTags are made by hand now; nobody runs scripts/release.sh.",
     D("scripts/release.sh"),
     D("billsplit/__main__.py"))

step(SAM, "restore billsplit/__main__.py (python -m billsplit needs it)",
     W("billsplit/__main__.py", '''
"""Run billsplit with `python -m billsplit`."""

import sys

from .cli import main

sys.exit(main())
'''))

step(KOFI, "cli: --version",
     E("billsplit/cli.py", "from .csvio import read_items\n", "from . import __version__\nfrom .csvio import read_items\n"),
     E("billsplit/cli.py", "    sub = parser.add_subparsers(", '    parser.add_argument("--version", action="version", version=f"%(prog)s {__version__}")\n    sub = parser.add_subparsers('))

step(KOFI, "test: --version",
     A("tests/test_cli.py", '''

def test_version(capsys):
    with pytest.raises(SystemExit):
        main(["--version"])
    assert capsys.readouterr().out.startswith("billsplit ")
'''))

release(ANA, "1.2.0", "1.1.0", ["Accounting-style negative amounts such as `(5.00)`.", "`billsplit --version`."])

# ---------------------------------------------------------------------------
# 1.3.0
# ---------------------------------------------------------------------------

step(LIN, "csvio: skip comment rows that start with '#'",
     E("billsplit/csvio.py", "            if _is_blank(row):\n                continue\n",
       "            if _is_blank(row):\n                continue\n"
       '            if (row.get("item") or "").lstrip().startswith("#"):\n'
       "                continue\n"))

step(LIN, "test: comment rows",
     A("tests/test_csvio.py", '''

def test_comment_rows(tmp_path):
    path = write(tmp_path, "item,amount\\n# drinks\\ncoffee,3.50\\n")
    assert [i.name for i in read_items(path)] == ["coffee"]
'''))

step(ANA, "docs: comment rows",
     A("docs/csv-format.md", """- Rows whose item starts with `#` are comments and are skipped.
"""))

step(KOFI, "cli: settle prints 'lin pays ana 40.00'",
     E("billsplit/cli.py",
       'print(f"{payment.payer} -> {payment.payee} {format_money(payment.amount, args.currency)}")',
       'print(f"{payment.payer} pays {payment.payee} {format_money(payment.amount, args.currency)}")'),
     E("tests/test_cli.py", '"lin -> ana 40.00\\nkofi -> ana 10.00\\n"', '"lin pays ana 40.00\\nkofi pays ana 10.00\\n"'),
     E("tests/test_cli.py", '"kofi -> ana $45.00\\n"', '"kofi pays ana $45.00\\n"'),
     E("README.md", "    lin -> ana 40.00\n    kofi -> ana 10.00\n", "    lin pays ana 40.00\n    kofi pays ana 10.00\n"))

step(SAM, "ci: run ruff",
     A(".github/workflows/test.yml", """      - run: pip install ruff==0.6.9 && ruff check .
"""))

step(SAM, "style: move test imports to the top of the file",
     E("tests/test_money.py", "from billsplit.money import AmountError, format_money, parse_amount, round_money\n",
       "from billsplit.models import Item\nfrom billsplit.money import AmountError, format_money, parse_amount, round_money, sum_amounts\n"),
     E("tests/test_money.py", "    from billsplit.models import Item\n    from billsplit.money import sum_amounts\n\n", ""))

step(LIN, "money: reject amounts with more than four decimal places",
     E("billsplit/money.py",
       '        raise AmountError(f"not a finite number: {text!r}", text)\n',
       '        raise AmountError(f"not a finite number: {text!r}", text)\n'
       "    if value.as_tuple().exponent < -4:\n"
       '        raise AmountError(f"too many decimal places: {text!r}", text)\n'))

step(LIN, "test: too many decimal places",
     A("tests/test_money.py", '''

def test_too_many_decimals():
    assert parse_amount("1.2345") == Decimal("1.2345")
    with pytest.raises(AmountError):
        parse_amount("1.23456")
'''))

step(ANA, "docs: amount format rules",
     A("docs/csv-format.md", """- Amounts may have at most four decimal places.
"""))

step(KOFI, "cli: split --people also accepts names",
     E("billsplit/cli.py",
       "def _positive_int(text: str) -> int:\n    value = int(text)\n",
       "def _positive_int(text: str) -> int:\n"
       '    if not text.isdigit() and "," in text:\n'
       "        return len(_people(text))\n"
       "    value = int(text)\n"),
     E("billsplit/cli.py", 'help="split evenly between N people")', 'help="N, or names such as ana,kofi,lin")'))

step(KOFI, "test: split with names",
     A("tests/test_cli.py", '''

def test_split_with_names(tmp_path, capsys):
    path = write(tmp_path, "item,amount\\npizza,18.00\\n")
    assert main(["split", path, "--people", "ana,kofi,lin"]) == 0
    assert capsys.readouterr().out == "6.00\\n6.00\\n6.00\\n"
'''))

step(SAM, "chore: project URLs in pyproject.toml",
     E("pyproject.toml", 'license = { text = "MIT" }\n',
       'license = { text = "MIT" }\n\n[project.urls]\nChangelog = "CHANGELOG.md"\n'))

step(LIN, "csvio: clear error for an empty file",
     E("billsplit/csvio.py",
       "        fields = reader.fieldnames or []\n",
       "        fields = reader.fieldnames or []\n"
       "        if not fields:\n"
       '            raise ItemError(path, 1, "empty file")\n'))

step(LIN, "test: empty file",
     A("tests/test_csvio.py", '''

def test_empty_file(tmp_path):
    path = write(tmp_path, "")
    with pytest.raises(ItemError, match="empty file"):
        read_items(path)
'''))

step(ANA, "docs: FAQ: payments in settle",
     A("docs/faq.md", """
**Is `settle` the smallest number of payments?**
Not always. It uses at most n - 1 payments. See docs/settle.md.
"""))

step(KOFI, "tax: reject rates above 100%",
     E("billsplit/tax.py",
       '    if rate < 0:\n        raise ValueError("tax rate must not be negative")\n    return round_money(subtotal * (1 + rate))\n',
       '    if rate < 0:\n        raise ValueError("tax rate must not be negative")\n'
       "    if rate > 1:\n"
       '        raise ValueError(f"tax rate {rate} is above 100%; did you mean {rate}%?")\n'
       "    return round_money(subtotal * (1 + rate))\n"))

step(KOFI, "test: huge tax rates",
     A("tests/test_tax.py", '''

def test_rate_above_100_percent():
    with pytest.raises(ValueError, match="above 100%"):
        apply_tax(Decimal("10.00"), Decimal("8.875"))
'''))

step(LIN, "csvio: tab-separated files",
     E("billsplit/csvio.py", 'delimiters=",;")', 'delimiters=",;\\t")'),
     E("billsplit/csvio.py", '"""Guess "," or ";" from the start of the file, then rewind."""',
       '"""Guess ",", ";" or a tab from the start of the file, then rewind."""'))

step(LIN, "test: tab-separated files",
     A("tests/test_csvio.py", '''

def test_tab_separated(tmp_path):
    path = write(tmp_path, "item\\tamount\\ncoffee\\t3.50\\n")
    assert [i.amount for i in read_items(path)] == [Decimal("3.50")]
'''))

step(ANA, "docs: tab-separated files",
     A("docs/csv-format.md", """- Tab-separated files work too.
"""))

step(SAM, "chore: tidy .gitignore",
     E(".gitignore", ".pytest_cache/\n", ".pytest_cache/\n.ruff_cache/\n.coverage\n"))

release(ANA, "1.3.0", "1.2.0", ["Comment rows, tab-separated files, clearer errors.",
                                "`settle` prints `lin pays ana 40.00`."])

step(SAM, "docs: fix typos in the README",
     E("README.md", "fair shares. Every share", "fair shares. Each share"))

step(LIN, "csvio: ignore spaces and case in column names",
     E("billsplit/csvio.py",
       "        reader = csv.DictReader(f, dialect=_dialect(f))\n",
       "        reader = csv.DictReader(f, dialect=_dialect(f))\n"
       "        reader.fieldnames = [name.strip().lower() for name in reader.fieldnames or []]\n"))

step(LIN, "test: column names with spaces and capitals",
     A("tests/test_csvio.py", '''

def test_column_names_are_normalized(tmp_path):
    path = write(tmp_path, "Item, Amount\\ncoffee,3.50\\n")
    assert [i.amount for i in read_items(path)] == [Decimal("3.50")]
'''))

step(ANA, "docs: column names ignore case and spaces",
     E("docs/csv-format.md", "- The first row is the header. Column names are lower case.\n",
       "- The first row is the header. Case and spaces around column names do not\n  matter: ` Amount` is `amount`.\n"))

step(KOFI, "test: split_weighted always adds up to the total",
     A("tests/test_split.py", '''

@pytest.mark.parametrize("people", range(1, 12))
def test_split_weighted_adds_up(people):
    weights = [Decimal(k % 4 + 1) for k in range(people)]
    shares = split_weighted(Decimal("99.99"), weights)
    assert sum(shares) == Decimal("99.99")
    assert all(s >= 0 for s in shares)
'''))

step(LIN, "money: clearer error for a lone currency symbol",
     E("billsplit/money.py", "        cleaned = cleaned[1:].strip()\n",
       "        cleaned = cleaned[1:].strip()\n"
       "        if not cleaned:\n"
       '            raise AmountError(f"no number after the currency symbol: {text!r}", text)\n'))

step(LIN, "test: lone currency symbol",
     A("tests/test_money.py", '''

def test_lone_currency_symbol():
    with pytest.raises(AmountError, match="no number after"):
        parse_amount("$")
'''))


# ---------------------------------------------------------------------------
# machinery
# ---------------------------------------------------------------------------

def apply(root, op):
    kind = op[0]
    if kind == "write":
        _, path, text = op
        p = root / path
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text, encoding="utf-8", newline="\n")
    elif kind == "append":
        _, path, text = op
        p = root / path
        with p.open("a", encoding="utf-8", newline="\n") as f:
            f.write(text)
    elif kind == "edit":
        _, path, old, new, count = op
        p = root / path
        text = p.read_text(encoding="utf-8")
        found = text.count(old)
        if found != count:
            raise SystemExit(f"edit of {path}: expected {count} match(es) of {old!r}, found {found}")
        p.write_text(text.replace(old, new), encoding="utf-8", newline="\n")
    elif kind == "delete":
        p = root / op[1]
        p.unlink()
        prune_empty_parents(root, p)
    elif kind == "move":
        src, dst = root / op[1], root / op[2]
        dst.parent.mkdir(parents=True, exist_ok=True)
        src.rename(dst)
        prune_empty_parents(root, src)
    else:
        raise SystemExit(f"unknown op {kind}")


def prune_empty_parents(root, path):
    """Remove folders that a delete or move left empty, as a checkout would.

    git does not track folders, so this never changes a commit id.
    """
    parent = path.parent
    while parent != root and root in parent.parents:
        try:
            parent.rmdir()
        except OSError:
            break
        parent = parent.parent


def main():
    if len(sys.argv) != 2:
        raise SystemExit("usage: gen_history.py TARGET_DIR")
    root = Path(sys.argv[1]).resolve()
    here = Path(__file__).resolve().parent
    if root == here or here in root.parents:
        raise SystemExit("refusing to build the history inside the lab folder")
    if root.exists() and any(root.iterdir()):
        raise SystemExit(f"{root} is not empty")
    root.mkdir(parents=True, exist_ok=True)
    if len(STEPS) != 200:
        raise SystemExit(f"expected 200 commits, have {len(STEPS)}")

    env = {
        "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
        "HOME": str(root),
        "GIT_CONFIG_NOSYSTEM": "1",
        "GIT_CONFIG_GLOBAL": os.devnull,
        "GIT_TERMINAL_PROMPT": "0",
        "LC_ALL": "C",
        "TZ": "UTC",
    }

    def git(*args, stdin=None):
        subprocess.run(["git", *args], cwd=root, env=env, check=True, input=stdin,
                       stdout=subprocess.DEVNULL, text=True)

    git("init", "-q", "-b", "main")
    git("config", "core.autocrlf", "false")
    git("config", "commit.gpgsign", "false")
    git("config", "tag.gpgsign", "false")
    when = START
    for n, entry in enumerate(STEPS, start=1):
        author, message, ops = entry[0], entry[1], entry[2]
        for op in ops:
            apply(root, op)
        when += 60 * (95 + (n * 137) % 600)
        name, email, tz = author
        env.update({
            "GIT_AUTHOR_NAME": name, "GIT_AUTHOR_EMAIL": email, "GIT_AUTHOR_DATE": f"{when} {tz}",
            "GIT_COMMITTER_NAME": name, "GIT_COMMITTER_EMAIL": email, "GIT_COMMITTER_DATE": f"{when} {tz}",
        })
        git("add", "-A")
        git("commit", "-q", "--no-verify", "-F", "-", stdin=message + "\n")
        if len(entry) > 3:
            git("tag", entry[3])
    print(f"built {len(STEPS)} commits in {root}", file=sys.stderr)


if __name__ == "__main__":
    main()
