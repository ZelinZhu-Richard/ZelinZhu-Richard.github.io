"""Order files (CSV with columns sku,quantity) and pricing them into invoices."""

from __future__ import annotations

import csv
from datetime import date
from pathlib import Path
from typing import NamedTuple

from .catalog import Catalog
from .discounts import Coupon
from .invoice import Invoice, Line
from .tax import TaxTable


class OrderError(ValueError):
    """Raised for an order file that cannot be priced."""


class OrderRow(NamedTuple):
    sku: str
    quantity: int
    lineno: int  # line in the CSV file; the header is line 1


def read_order(path: str | Path) -> list[OrderRow]:
    rows = []
    with open(path, newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            lineno = reader.line_num
            sku = (row.get("sku") or "").strip()
            raw_qty = (row.get("quantity") or "").strip()
            if not sku:
                raise OrderError(f"line {lineno}: missing SKU")
            try:
                quantity = int(raw_qty)
            except ValueError:
                raise OrderError(
                    f"line {lineno}: quantity must be a whole number, got {raw_qty!r}"
                ) from None
            if quantity <= 0:
                raise OrderError(f"line {lineno}: quantity must be positive, got {quantity}")
            rows.append(OrderRow(sku, quantity, lineno))
    if not rows:
        raise OrderError("order has no lines")
    return rows


def build_invoice(
    rows: list[OrderRow],
    catalog: Catalog,
    tax_table: TaxTable,
    *,
    region: str,
    issue_date: date,
    coupon: Coupon | None = None,
    net_days: int = 30,
) -> Invoice:
    """Price every order row. The invoice currency is the first product's currency."""
    first = catalog.get(rows[0].sku)
    invoice = Invoice(
        currency=first.unit_price.currency,
        region=region,
        tax_table=tax_table,
        issue_date=issue_date,
        coupon=coupon,
        net_days=net_days,
    )
    for row in rows:
        product = catalog.get(row.sku)
        invoice.add_line(
            Line(product.sku, product.name, product.unit_price, row.quantity, product.tax_category)
        )
    return invoice
