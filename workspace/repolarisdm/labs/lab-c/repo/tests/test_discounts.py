import unittest
from datetime import date
from decimal import Decimal

from pricebook.discounts import CouponError, find_coupon, load_coupons
from pricebook.money import Money


class CouponTests(unittest.TestCase):
    def setUp(self):
        self.coupons = load_coupons()

    def test_codes_are_case_insensitive(self):
        self.assertEqual(find_coupon(self.coupons, " save10 ").code, "SAVE10")

    def test_unknown_code(self):
        with self.assertRaises(CouponError):
            find_coupon(self.coupons, "FREE99")

    def test_percent_discount_rounds_half_up(self):
        save10 = self.coupons["SAVE10"]
        self.assertEqual(save10.discount_for(Money("0.25", "CAD")).amount, Decimal("0.03"))

    def test_first_day_is_valid(self):
        spring = self.coupons["SPRING15"]
        self.assertIsNone(spring.problem(Money("60.00", "CAD"), date(2026, 3, 1)))
        self.assertIsNotNone(spring.problem(Money("60.00", "CAD"), date(2026, 2, 28)))

    def test_minimum_subtotal(self):
        spring = self.coupons["SPRING15"]
        self.assertIn("at least", spring.problem(Money("49.99", "CAD"), date(2026, 3, 10)))

    def test_fixed_coupon_currency_must_match(self):
        welcome = self.coupons["WELCOME20"]
        self.assertIn("CAD", welcome.problem(Money("30.00", "USD"), date(2026, 5, 4)))

    def test_fixed_discount(self):
        welcome = self.coupons["WELCOME20"]
        self.assertEqual(welcome.discount_for(Money("30.00", "CAD")), Money("20.00", "CAD"))


if __name__ == "__main__":
    unittest.main()
