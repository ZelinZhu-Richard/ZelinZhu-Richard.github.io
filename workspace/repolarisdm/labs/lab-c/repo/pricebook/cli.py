"""Command line: python -m pricebook quote ORDER.csv --region CA-ON [options]."""

from __future__ import annotations

import argparse
import sys
from datetime import date

from .catalog import DATA_DIR, load_catalog
from .discounts import find_coupon, load_coupons
from .orders import build_invoice, read_order
from .render import render_csv, render_text
from .tax import load_rates


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="pricebook", description="Price an order and print an invoice.")
    sub = parser.add_subparsers(dest="command", required=True)
    quote = sub.add_parser("quote", help="price an order file")
    quote.add_argument("order", help="CSV file with columns sku,quantity")
    quote.add_argument("--region", required=True, help="tax region, for example CA-ON")
    quote.add_argument("--coupon", help="coupon code")
    quote.add_argument("--date", type=date.fromisoformat, help="issue date YYYY-MM-DD (default: today)")
    quote.add_argument("--net-days", type=int, default=30, help="payment terms in days (default: 30)")
    quote.add_argument("--format", choices=["text", "csv"], default="text")
    quote.add_argument("--catalog", default=DATA_DIR / "catalog.csv")
    quote.add_argument("--rates", default=DATA_DIR / "rates.csv")
    quote.add_argument("--coupons", default=DATA_DIR / "coupons.csv")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        catalog = load_catalog(args.catalog)
        tax_table = load_rates(args.rates)
        if args.region not in tax_table.regions():
            known = ", ".join(sorted(tax_table.regions()))
            raise ValueError(f"unknown region {args.region!r} (known: {known})")
        coupon = find_coupon(load_coupons(args.coupons), args.coupon) if args.coupon else None
        rows = read_order(args.order)
        invoice = build_invoice(
            rows,
            catalog,
            tax_table,
            region=args.region,
            issue_date=args.date or date.today(),
            coupon=coupon,
            net_days=args.net_days,
        )
    except (OSError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    sys.stdout.write(render_csv(invoice) if args.format == "csv" else render_text(invoice))
    return 0
