import unittest

from pricebook.catalog import Catalog, Product, UnknownSku, load_catalog
from pricebook.money import Money
from pricebook.orders import OrderError, read_order

from .helpers import TempFiles


class CatalogTests(unittest.TestCase):
    def setUp(self):
        self.files = TempFiles()
        self.addCleanup(self.files.cleanup)

    def test_bundled_catalog_loads(self):
        catalog = load_catalog()
        self.assertIn("DRILL-18V", catalog)
        self.assertEqual(catalog.get("DRILL-18V").unit_price, Money("129.00", "CAD"))

    def test_unknown_sku(self):
        with self.assertRaises(UnknownSku):
            load_catalog().get("NOPE-1")

    def test_duplicate_sku_is_rejected(self):
        product = Product("A-1", "Thing", Money("1.00", "USD"))
        with self.assertRaises(ValueError):
            Catalog([product, product])

    def test_blank_category_means_standard(self):
        path = self.files.write("c.csv", "sku,name,unit_price,currency,tax_category\nA-1,Thing,1.00,USD,\n")
        self.assertEqual(load_catalog(path).get("A-1").tax_category, "standard")


class OrderFileTests(unittest.TestCase):
    def setUp(self):
        self.files = TempFiles()
        self.addCleanup(self.files.cleanup)

    def test_rows_keep_their_line_numbers(self):
        path = self.files.write("o.csv", "sku,quantity\nDRILL-18V,1\nBITS-20, 2\n")
        rows = read_order(path)
        self.assertEqual([(r.sku, r.quantity, r.lineno) for r in rows], [("DRILL-18V", 1, 2), ("BITS-20", 2, 3)])

    def test_bad_quantity_names_the_line(self):
        path = self.files.write("o.csv", "sku,quantity\nDRILL-18V,1\nBITS-20,two\n")
        with self.assertRaisesRegex(OrderError, "line 3"):
            read_order(path)

    def test_quantity_must_be_positive(self):
        path = self.files.write("o.csv", "sku,quantity\nDRILL-18V,0\n")
        with self.assertRaises(OrderError):
            read_order(path)

    def test_empty_order(self):
        path = self.files.write("o.csv", "sku,quantity\n")
        with self.assertRaises(OrderError):
            read_order(path)


if __name__ == "__main__":
    unittest.main()
