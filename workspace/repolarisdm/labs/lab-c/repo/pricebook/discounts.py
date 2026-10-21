"""Coupons: percentage or fixed-amount discounts on the invoice subtotal."""

from __future__ import annotations

import csv
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from pathlib import Path

from .money import Money, to_decimal

DATA_DIR = Path(__file__).parent / "data"


class CouponError(ValueError):
    """Raised for an unknown coupon code or a malformed coupon file."""


@dataclass(frozen=True)
class Coupon:
    """A discount code.

    ``kind`` is "percent" (``value`` is a fraction: 0.10 means 10 %) or "fixed"
    (``value`` is an amount in ``currency``). The coupon is valid from
    ``valid_from`` to ``valid_until``, both days included.
    """

    code: str
    kind: str
    value: Decimal
    valid_from: date
    valid_until: date
    min_subtotal: Decimal = Decimal(0)
    currency: str | None = None

    def problem(self, subtotal: Money, day: date) -> str | None:
        """Return why the coupon cannot be used, or None if it can."""
        if not self.valid_from <= day < self.valid_until:
            return f"{self.code} is not valid on {day.isoformat()}"
        if subtotal.amount < self.min_subtotal:
            return f"{self.code} needs a subtotal of at least {self.min_subtotal}"
        if self.kind == "fixed" and self.currency != subtotal.currency:
            return f"{self.code} is a {self.currency} coupon"
        return None

    def discount_for(self, subtotal: Money) -> Money:
        """The discount on ``subtotal``, rounded to the minor unit."""
        if self.kind == "percent":
            return (subtotal * self.value).rounded()
        return Money(self.value, subtotal.currency).rounded()


def load_coupons(path: str | Path = DATA_DIR / "coupons.csv") -> dict[str, Coupon]:
    coupons: dict[str, Coupon] = {}
    with open(path, newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            kind = row["kind"].strip()
            if kind not in ("percent", "fixed"):
                raise CouponError(f"line {reader.line_num}: unknown coupon kind {kind!r}")
            code = row["code"].strip().upper()
            coupons[code] = Coupon(
                code=code,
                kind=kind,
                value=to_decimal(row["value"]),
                valid_from=date.fromisoformat(row["valid_from"].strip()),
                valid_until=date.fromisoformat(row["valid_until"].strip()),
                min_subtotal=to_decimal(row["min_subtotal"].strip() or "0"),
                currency=row["currency"].strip() or None,
            )
    return coupons


def find_coupon(coupons: dict[str, Coupon], code: str) -> Coupon:
    try:
        return coupons[code.strip().upper()]
    except KeyError:
        raise CouponError(f"unknown coupon code: {code}") from None
