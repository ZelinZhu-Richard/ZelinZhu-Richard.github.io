"""Exact money arithmetic for pricebook.

Amounts are ``Decimal`` values. Binary floats are refused because they cannot
hold most cent values exactly.

Rounding rule, used everywhere in pricebook: round to the currency's minor
unit with ROUND_HALF_UP, so ties go away from zero (2.345 -> 2.35).
Python's built-in round() sends ties to the even digit, so never use it on money.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

# Digits after the decimal point for each supported currency (ISO 4217).
CURRENCY_DIGITS = {"CAD": 2, "EUR": 2, "GBP": 2, "JPY": 0, "USD": 2}


class UnknownCurrency(ValueError):
    """Raised for a currency code that pricebook does not support."""


def minor_unit(currency: str) -> Decimal:
    """Return the smallest unit of ``currency``: Decimal('0.01') for USD."""
    try:
        digits = CURRENCY_DIGITS[currency]
    except KeyError:
        raise UnknownCurrency(f"unsupported currency: {currency!r}") from None
    return Decimal(1).scaleb(-digits)


def to_decimal(value: object) -> Decimal:
    """Convert a str, int or Decimal to a finite Decimal. Floats are refused."""
    if isinstance(value, (bool, float)):
        raise TypeError(f"money amounts must be str, int or Decimal, not {type(value).__name__}")
    if isinstance(value, Decimal):
        result = value
    else:
        try:
            result = Decimal(str(value).strip())
        except InvalidOperation:
            raise ValueError(f"not a decimal amount: {value!r}") from None
    if not result.is_finite():
        raise ValueError(f"not a finite amount: {value!r}")
    return result


@dataclass(frozen=True)
class Money:
    """An amount in one currency. Arithmetic never rounds; call rounded()."""

    amount: Decimal
    currency: str

    def __post_init__(self) -> None:
        object.__setattr__(self, "amount", to_decimal(self.amount))
        minor_unit(self.currency)  # raises UnknownCurrency

    @classmethod
    def zero(cls, currency: str) -> Money:
        return cls(Decimal(0), currency).rounded()

    def rounded(self) -> Money:
        """Round to the minor unit with ROUND_HALF_UP."""
        unit = minor_unit(self.currency)
        return Money(self.amount.quantize(unit, rounding=ROUND_HALF_UP), self.currency)

    def is_zero(self) -> bool:
        return self.amount == 0

    def _same_currency(self, other: Money) -> None:
        if not isinstance(other, Money):
            raise TypeError(f"expected Money, got {type(other).__name__}")
        if other.currency != self.currency:
            raise ValueError(f"currency mismatch: {self.currency} vs {other.currency}")

    def __add__(self, other: Money) -> Money:
        self._same_currency(other)
        return Money(self.amount + other.amount, self.currency)

    def __sub__(self, other: Money) -> Money:
        self._same_currency(other)
        return Money(self.amount - other.amount, self.currency)

    def __neg__(self) -> Money:
        return Money(-self.amount, self.currency)

    def __mul__(self, factor: int | Decimal) -> Money:
        return Money(self.amount * to_decimal(factor), self.currency)

    __rmul__ = __mul__

    def __lt__(self, other: Money) -> bool:
        self._same_currency(other)
        return self.amount < other.amount

    def __le__(self, other: Money) -> bool:
        self._same_currency(other)
        return self.amount <= other.amount

    def allocate(self, ratios: list[int | Decimal]) -> list[Money]:
        """Split this amount into parts proportional to ``ratios``.

        Used to spread an invoice discount over its lines. Each part is a whole
        number of minor units. The parts add up to exactly this amount, and each
        part is within one minor unit of its exact share.
        """
        weights = [to_decimal(r) for r in ratios]
        if not weights or any(w < 0 for w in weights) or sum(weights) == 0:
            raise ValueError("ratios must be non-negative with a positive sum")
        total = sum(weights)
        unit = minor_unit(self.currency)
        return [
            Money((self.amount * w / total).quantize(unit, rounding=ROUND_HALF_UP), self.currency)
            for w in weights
        ]

    def format(self) -> str:
        """Format for people and for the billing mailer: '1234.50 CAD'."""
        return f"{self.rounded().amount} {self.currency}"
