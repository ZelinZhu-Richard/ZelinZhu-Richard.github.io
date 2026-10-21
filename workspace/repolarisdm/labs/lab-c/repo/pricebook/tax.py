"""Sales tax tables.

``rates.csv`` has one row per region and tax category::

    region,category,rate
    CA-ON,standard,0.13

``rate`` is a decimal fraction: 0.13 means 13 %. A category without its own
row uses the region's ``standard`` rate. An unknown region is an error:
pricebook never guesses a tax rate.
"""

from __future__ import annotations

import csv
from decimal import Decimal, InvalidOperation
from pathlib import Path

DATA_DIR = Path(__file__).parent / "data"


class UnknownRegion(KeyError):
    """Raised for a region that has no rates."""


def parse_rate(text: str) -> Decimal:
    """Parse a rate such as "0.13". Rates must be at least 0 and below 1."""
    try:
        rate = Decimal(text.strip())
    except InvalidOperation:
        raise ValueError(f"invalid tax rate: {text!r}") from None
    if not rate.is_finite() or not 0 <= rate < 1:
        raise ValueError(f"tax rate out of range: {text!r}")
    return rate


class TaxTable:
    def __init__(self, rates: dict[tuple[str, str], Decimal]) -> None:
        self._rates = dict(rates)
        self._regions = {region for region, _ in self._rates}

    def regions(self) -> set[str]:
        return set(self._regions)

    def rate_for(self, region: str, category: str) -> Decimal:
        if region not in self._regions:
            raise UnknownRegion(region)
        if (region, category) in self._rates:
            return self._rates[(region, category)]
        try:
            return self._rates[(region, "standard")]
        except KeyError:
            raise UnknownRegion(f"{region} has no standard rate") from None


def load_rates(path: str | Path = DATA_DIR / "rates.csv") -> TaxTable:
    rates: dict[tuple[str, str], Decimal] = {}
    with open(path, newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            key = (row["region"].strip(), row["category"].strip())
            if key in rates:
                raise ValueError(f"line {reader.line_num}: duplicate rate for {key[0]}/{key[1]}")
            rates[key] = parse_rate(row["rate"])
    return TaxTable(rates)
