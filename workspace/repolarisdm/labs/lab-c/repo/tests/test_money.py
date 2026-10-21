import unittest
from decimal import Decimal

from pricebook.money import Money, UnknownCurrency, minor_unit


class MoneyTests(unittest.TestCase):
    def test_amount_is_decimal(self):
        self.assertEqual(Money("19.99", "USD").amount, Decimal("19.99"))
        self.assertEqual(Money(5, "JPY").amount, Decimal(5))

    def test_floats_are_refused(self):
        with self.assertRaises(TypeError):
            Money(0.1, "USD")

    def test_unknown_currency(self):
        with self.assertRaises(UnknownCurrency):
            Money("1", "XYZ")

    def test_minor_units(self):
        self.assertEqual(minor_unit("USD"), Decimal("0.01"))
        self.assertEqual(minor_unit("JPY"), Decimal("1"))

    def test_rounding_ties_go_up(self):
        self.assertEqual(Money("2.345", "USD").rounded().amount, Decimal("2.35"))
        self.assertEqual(Money("0.5", "JPY").rounded().amount, Decimal("1"))

    def test_rounding_below_half_goes_down(self):
        self.assertEqual(Money("2.344", "USD").rounded().amount, Decimal("2.34"))

    def test_adding_different_currencies_fails(self):
        with self.assertRaises(ValueError):
            Money("1", "USD") + Money("1", "EUR")

    def test_multiply_by_quantity(self):
        self.assertEqual(Money("2.50", "CAD") * 3, Money("7.50", "CAD"))

    def test_allocate_even_split(self):
        parts = Money("10.00", "USD").allocate([1, 1])
        self.assertEqual([p.amount for p in parts], [Decimal("5.00"), Decimal("5.00")])

    def test_allocate_proportional(self):
        parts = Money("1.00", "USD").allocate([1, 3])
        self.assertEqual([p.amount for p in parts], [Decimal("0.25"), Decimal("0.75")])

    def test_allocate_needs_a_positive_sum(self):
        with self.assertRaises(ValueError):
            Money("1.00", "USD").allocate([0, 0])

    def test_format(self):
        self.assertEqual(Money("1234.5", "CAD").format(), "1234.50 CAD")
        self.assertEqual(Money("980", "JPY").format(), "980 JPY")


if __name__ == "__main__":
    unittest.main()
