"""Plain-text and CSV renderings of an invoice."""

from __future__ import annotations

import csv
import io
from decimal import Decimal

from .invoice import Invoice
from .money import Money

CSV_COLUMNS = ["sku", "description", "quantity", "unit_price", "amount", "net", "tax_category"]


def _amount(money: Money) -> str:
    return str(money.rounded().amount)


def _percent(rate: Decimal) -> str:
    text = f"{rate * 100:f}"
    return text.rstrip("0").rstrip(".") if "." in text else text


def render_text(invoice: Invoice) -> str:
    out = [
        f"INVOICE {invoice.issue_date.isoformat()}",
        f"Region: {invoice.region}    Currency: {invoice.currency}",
        "",
        f"{'SKU':<10} {'Description':<22} {'Qty':>5} {'Unit':>10} {'Amount':>10}",
    ]
    for line in invoice.lines:
        out.append(
            f"{line.sku:<10} {line.description[:22]:<22} {line.quantity:>5} "
            f"{line.unit_price.amount!s:>10} {_amount(line.total()):>10}"
        )
    out.append("")
    out.append(f"{'Subtotal':<50} {_amount(invoice.subtotal()):>10}")
    if invoice.coupon is not None:
        problem = invoice.coupon_problem()
        if problem:
            out.append(f"Coupon not applied: {problem}")
        else:
            label = f"Discount {invoice.coupon.code}"
            out.append(f"{label:<50} {'-' + _amount(invoice.discount()):>10}")
    for category, amount in invoice.tax_by_category().items():
        rate = invoice.tax_table.rate_for(invoice.region, category)
        label = f"Tax {category} {_percent(rate)}%"
        out.append(f"{label:<50} {_amount(amount):>10}")
    # The billing mailer parses the next two lines. Keep their format stable.
    out.append(f"Total: {invoice.total().format()}")
    out.append(f"Due: {invoice.due_date().isoformat()}")
    return "\n".join(out) + "\n"


def render_csv(invoice: Invoice) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(CSV_COLUMNS)
    for line, net in zip(invoice.lines, invoice.line_nets()):
        writer.writerow(
            [
                line.sku,
                line.description,
                line.quantity,
                line.unit_price.amount,
                _amount(line.total()),
                _amount(net),
                line.tax_category,
            ]
        )
    return buffer.getvalue()
