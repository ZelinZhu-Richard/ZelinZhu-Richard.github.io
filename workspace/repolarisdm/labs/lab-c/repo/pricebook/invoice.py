"""Invoices: lines, discount, tax and totals.

Order of operations (README, "How totals are computed"):

1. A line total is unit price x quantity, rounded to the minor unit.
2. The subtotal is the sum of the line totals.
3. A coupon's discount is spread over the lines in proportion to their totals.
4. Tax is charged per tax category on the discounted line amounts and
   rounded once per category.
5. Total = subtotal - discount + tax.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, timedelta

from .discounts import Coupon
from .money import Money
from .tax import TaxTable


@dataclass(frozen=True)
class Line:
    sku: str
    description: str
    unit_price: Money
    quantity: int
    tax_category: str = "standard"

    def total(self) -> Money:
        return self.unit_price.rounded() * self.quantity


@dataclass
class Invoice:
    currency: str
    region: str
    tax_table: TaxTable
    issue_date: date
    coupon: Coupon | None = None
    net_days: int = 30
    lines: list[Line] = field(default_factory=list)

    def add_line(self, line: Line) -> None:
        if line.unit_price.currency != self.currency:
            raise ValueError(
                f"{line.sku} is priced in {line.unit_price.currency}, "
                f"but the invoice is in {self.currency}"
            )
        self.lines.append(line)

    def subtotal(self) -> Money:
        total = Money.zero(self.currency)
        for line in self.lines:
            total = total + line.total()
        return total

    def coupon_problem(self) -> str | None:
        if self.coupon is None:
            return None
        return self.coupon.problem(self.subtotal(), self.issue_date)

    def discount(self) -> Money:
        if self.coupon is None or self.coupon_problem() is not None:
            return Money.zero(self.currency)
        return self.coupon.discount_for(self.subtotal())

    def line_nets(self) -> list[Money]:
        """Each line's total minus its share of the discount."""
        totals = [line.total() for line in self.lines]
        discount = self.discount()
        if discount.is_zero():
            return totals
        shares = discount.allocate([t.amount for t in totals])
        return [t - s for t, s in zip(totals, shares)]

    def tax_by_category(self) -> dict[str, Money]:
        bases: dict[str, Money] = defaultdict(lambda: Money.zero(self.currency))
        for line, net in zip(self.lines, self.line_nets()):
            bases[line.tax_category] += net
        return {
            category: (base * self.tax_table.rate_for(self.region, category)).rounded()
            for category, base in sorted(bases.items())
        }

    def tax(self) -> Money:
        total = Money.zero(self.currency)
        for amount in self.tax_by_category().values():
            total = total + amount
        return total

    def total(self) -> Money:
        return self.subtotal() - self.discount() + self.tax()

    def due_date(self) -> date:
        return self.issue_date + timedelta(days=self.net_days)
