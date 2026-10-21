import contextlib
import io
import unittest

from pricebook.cli import main

from .helpers import EXAMPLE_ORDER, TempFiles


def run_cli(*args):
    out, err = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        code = main(list(args))
    return code, out.getvalue(), err.getvalue()


class CliTests(unittest.TestCase):
    def quote(self, *extra):
        return run_cli("quote", str(EXAMPLE_ORDER), "--region", "CA-ON", "--date", "2026-05-04", *extra)

    def test_text_quote(self):
        code, out, _ = self.quote()
        self.assertEqual(code, 0)
        self.assertIn("DRILL-18V", out)
        self.assertIn("Tax standard 13%", out)

    def test_total_and_due_lines_are_stable(self):
        # The billing mailer parses these two lines.
        _, out, _ = self.quote("--coupon", "SAVE10")
        self.assertEqual(out.splitlines()[-2:], ["Total: 237.44 CAD", "Due: 2026-06-03"])

    def test_csv_quote(self):
        code, out, _ = self.quote("--format", "csv")
        lines = out.splitlines()
        self.assertEqual(code, 0)
        self.assertEqual(lines[0], "sku,description,quantity,unit_price,amount,net,tax_category")
        self.assertEqual(len(lines), 5)

    def test_bad_quantity_exits_2(self):
        files = TempFiles()
        self.addCleanup(files.cleanup)
        order = files.write("o.csv", "sku,quantity\nDRILL-18V,x\n")
        code, out, err = run_cli("quote", str(order), "--region", "CA-ON")
        self.assertEqual((code, out), (2, ""))
        self.assertIn("error: line 2", err)

    def test_unknown_region_exits_2(self):
        code, _, err = run_cli("quote", str(EXAMPLE_ORDER), "--region", "MARS")
        self.assertEqual(code, 2)
        self.assertIn("unknown region", err)

    def test_unknown_coupon_exits_2(self):
        code, _, err = self.quote("--coupon", "FREE99")
        self.assertEqual(code, 2)
        self.assertIn("unknown coupon", err)


if __name__ == "__main__":
    unittest.main()
