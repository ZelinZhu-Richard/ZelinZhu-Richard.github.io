import unittest
from datetime import date
from decimal import Decimal

from pricebook.catalog import load_catalog
from pricebook.discounts import load_coupons
from pricebook.invoice import Line
from pricebook.money import Money
from pricebook.orders import build_invoice, read_order
from pricebook.tax import load_rates

from .helpers import EXAMPLE_ORDER


def example_invoice(coupon_code=None, issue_date=date(2026, 5, 4)):
    coupon = load_coupons()[coupon_code] if coupon_code else None
    return build_invoice(
        read_order(EXAMPLE_ORDER),
        load_catalog(),
        load_rates(),
        region="CA-ON",
        issue_date=issue_date,
        coupon=coupon,
    )


class InvoiceTests(unittest.TestCase):
    def test_totals_without_coupon(self):
        invoice = example_invoice()
        self.assertEqual(invoice.subtotal(), Money("236.00", "CAD"))
        self.assertEqual(invoice.tax(), Money("27.82", "CAD"))
        self.assertEqual(invoice.total(), Money("263.82", "CAD"))

    def test_food_is_zero_rated_in_ontario(self):
        self.assertEqual(example_invoice().tax_by_category()["food"].amount, Decimal("0.00"))

    def test_discount_is_spread_before_tax(self):
        invoice = example_invoice("SAVE10")
        self.assertEqual(invoice.discount(), Money("23.60", "CAD"))
        self.assertEqual(invoice.tax(), Money("25.04", "CAD"))
        self.assertEqual(invoice.total(), Money("237.44", "CAD"))

    def test_rejected_coupon_gives_no_discount(self):
        invoice = example_invoice("SPRING15")
        self.assertTrue(invoice.discount().is_zero())
        self.assertIn("not valid", invoice.coupon_problem())

    def test_due_date_is_net_days_after_issue(self):
        self.assertEqual(example_invoice().due_date(), date(2026, 6, 3))

    def test_line_currency_must_match(self):
        invoice = example_invoice()
        with self.assertRaises(ValueError):
            invoice.add_line(Line("DRILL-EU", "Drill", Money("119.00", "EUR"), 1))


if __name__ == "__main__":
    unittest.main()
