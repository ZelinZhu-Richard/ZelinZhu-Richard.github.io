import unittest
from decimal import Decimal

from pricebook.tax import UnknownRegion, load_rates, parse_rate

from .helpers import TempFiles


class ParseRateTests(unittest.TestCase):
    def test_decimal_fraction(self):
        self.assertEqual(parse_rate("0.13"), Decimal("0.13"))
        self.assertEqual(parse_rate(" 0 "), Decimal("0"))

    def test_invalid_rates(self):
        for text in ["", "abc", "1.5", "-0.01", "NaN"]:
            with self.subTest(text=text), self.assertRaises(ValueError):
                parse_rate(text)


class TaxTableTests(unittest.TestCase):
    def setUp(self):
        self.table = load_rates()

    def test_exact_rate(self):
        self.assertEqual(self.table.rate_for("CA-ON", "food"), Decimal("0"))

    def test_category_falls_back_to_standard(self):
        self.assertEqual(self.table.rate_for("CA-ON", "digital"), Decimal("0.13"))

    def test_unknown_region(self):
        with self.assertRaises(UnknownRegion):
            self.table.rate_for("XX", "standard")

    def test_duplicate_rows_are_rejected(self):
        files = TempFiles()
        self.addCleanup(files.cleanup)
        path = files.write("r.csv", "region,category,rate\nXX,standard,0.1\nXX,standard,0.2\n")
        with self.assertRaisesRegex(ValueError, "line 3"):
            load_rates(path)


if __name__ == "__main__":
    unittest.main()
