Synthetic, written for practice. Not real Gemini output.

# Agent session for patch 10

Setup: one coding agent, working alone in a checkout of `pricebook` (Python 3.13). Tools: shell and file edit. It was given the prompt below and the ticket in `task.md`. Shell output was produced by running each command at that point of the session.

## User

Work on this ticket in the pricebook repository. Keep the change focused. Run the tests before you finish.

> # PB-150: JSON output for quotes
>
> Reported by: web team
>
> Add `--format json` to `pricebook quote`. Print one JSON object like this one
> (example order, coupon `SAVE10`, issued 2026-05-04; lines shortened):
>
> ```json
> {
>   "issue_date": "2026-05-04",
>   "due_date": "2026-06-03",
>   "region": "CA-ON",
>   "currency": "CAD",
>   "lines": [
>     {"sku": "DRILL-18V", "description": "18V cordless drill", "quantity": 1, "unit_price": "129.00",
>      "amount": "129.00", "net": "116.10", "tax_category": "standard"}
>   ],
>   "subtotal": "236.00",
>   "coupon": {"code": "SAVE10", "applied": true, "problem": null},
>   "discount": "23.60",
>   "tax": {"food": "0.00", "standard": "25.04"},
>   "total": "237.44"
> }
> ```
>
> - Money values are strings with the currency's digits, never JSON numbers.
>   `unit_price` keeps the catalog's precision.
> - `coupon` is `null` when no coupon was given. For a coupon that does not apply,
>   `applied` is `false` and `problem` is the reason.
> - `quantity` is a JSON integer.
> - Text and CSV output must not change.

**Tool call: shell**

```console
$ rg -n "format|render" pricebook/cli.py
12:from .render import render_csv, render_text
23:    quote.add_argument("--date", type=date.fromisoformat, help="issue date YYYY-MM-DD (default: today)")
25:    quote.add_argument("--format", choices=["text", "csv"], default="text")
54:    sys.stdout.write(render_csv(invoice) if args.format == "csv" else render_text(invoice))
```

**Tool call: shell**

```console
$ sed -n '1,20p' pricebook/render.py
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
```

**Agent:** Plan: add `render_json` next to the other renderers and reuse `_amount`, so money keeps the currency's digits and the README rounding rule. `unit_price` uses the raw catalog value, as the ticket asks. Then add `json` to the `--format` choices.

**Agent:** Text and CSV output must not change, and I will touch the line in `cli.py` that picks the renderer. `test_csv_quote` checks only the CSV header and the number of lines. I'll pin the full CSV first, on the unchanged code.

**Tool call: shell**

```console
$ python -m pricebook quote examples/order.csv --region CA-ON --date 2026-05-04 --format csv
sku,description,quantity,unit_price,amount,net,tax_category
DRILL-18V,18V cordless drill,1,129.00,129.00,129.00,standard
BITS-20,Drill bit set 20 pc,2,24.50,49.00,49.00,standard
COFFEE-1KG,Coffee beans 1 kg,1,22.00,22.00,22.00,food
GLOVE-L,Work gloves size L,3,12.00,36.00,36.00,standard
```

**Agent:** Comparing all four rows also checks the line count, so the row comparison replaces the length check.

**Tool call: edit `tests/test_cli.py`**

```diff
@@ -35,5 +35,10 @@
         self.assertEqual(code, 0)
         self.assertEqual(lines[0], "sku,description,quantity,unit_price,amount,net,tax_category")
-        self.assertEqual(len(lines), 5)
+        self.assertEqual(lines[1:], [
+            "DRILL-18V,18V cordless drill,1,129.00,129.00,129.00,standard",
+            "BITS-20,Drill bit set 20 pc,2,24.50,49.00,49.00,standard",
+            "COFFEE-1KG,Coffee beans 1 kg,1,22.00,22.00,22.00,food",
+            "GLOVE-L,Work gloves size L,3,12.00,36.00,36.00,standard",
+        ])
 
     def test_bad_quantity_exits_2(self):
```

**Tool call: shell**

```console
$ python -m pytest -q tests/test_cli.py
......                                                                   [100%]
6 passed in 0.01s
```

**Tool call: edit `pricebook/render.py`**

```diff
@@ -5,4 +5,5 @@
 import csv
 import io
+import json
 from decimal import Decimal
 
```

**Tool call: edit `pricebook/render.py`**

```diff
@@ -71,2 +71,33 @@
         )
     return buffer.getvalue()
+
+
+def render_json(invoice: Invoice) -> str:
+    coupon = None
+    if invoice.coupon is not None:
+        problem = invoice.coupon_problem()
+        coupon = {"code": invoice.coupon.code, "applied": problem is None, "problem": problem}
+    data = {
+        "issue_date": invoice.issue_date.isoformat(),
+        "due_date": invoice.due_date().isoformat(),
+        "region": invoice.region,
+        "currency": invoice.currency,
+        "lines": [
+            {
+                "sku": line.sku,
+                "description": line.description,
+                "quantity": line.quantity,
+                "unit_price": str(line.unit_price.amount),
+                "amount": _amount(line.total()),
+                "net": _amount(net),
+                "tax_category": line.tax_category,
+            }
+            for line, net in zip(invoice.lines, invoice.line_nets())
+        ],
+        "subtotal": _amount(invoice.subtotal()),
+        "coupon": coupon,
+        "discount": _amount(invoice.discount()),
+        "tax": {category: _amount(amount) for category, amount in invoice.tax_by_category().items()},
+        "total": _amount(invoice.total()),
+    }
+    return json.dumps(data, indent=2) + "\n"
```

**Tool call: edit `pricebook/cli.py`**

```diff
@@ -10,5 +10,5 @@
 from .discounts import find_coupon, load_coupons
 from .orders import build_invoice, read_order
-from .render import render_csv, render_text
+from .render import render_csv, render_json, render_text
 from .tax import load_rates
 
```

**Tool call: edit `pricebook/cli.py`**

```diff
@@ -23,5 +23,5 @@
     quote.add_argument("--date", type=date.fromisoformat, help="issue date YYYY-MM-DD (default: today)")
     quote.add_argument("--net-days", type=int, default=30, help="payment terms in days (default: 30)")
-    quote.add_argument("--format", choices=["text", "csv"], default="text")
+    quote.add_argument("--format", choices=["text", "csv", "json"], default="text")
     quote.add_argument("--catalog", default=DATA_DIR / "catalog.csv")
     quote.add_argument("--rates", default=DATA_DIR / "rates.csv")
```

**Tool call: edit `pricebook/cli.py`**

```diff
@@ -52,4 +52,5 @@
         print(f"error: {exc}", file=sys.stderr)
         return 2
-    sys.stdout.write(render_csv(invoice) if args.format == "csv" else render_text(invoice))
+    renderers = {"text": render_text, "csv": render_csv, "json": render_json}
+    sys.stdout.write(renderers[args.format](invoice))
     return 0
```

**Tool call: edit `README.md`**

```diff
@@ -48,5 +48,5 @@
 ```console
 $ python -m pricebook quote ORDER.csv --region REGION [--coupon CODE] [--date YYYY-MM-DD]
-                                     [--net-days N] [--format text|csv]
+                                     [--net-days N] [--format text|csv|json]
                                      [--catalog PATH] [--rates PATH] [--coupons PATH]
 ```
```

**Tool call: edit `tests/test_cli.py`**

```diff
@@ -1,4 +1,5 @@
 import contextlib
 import io
+import json
 import unittest
 
```

**Tool call: edit `tests/test_cli.py`**

```diff
@@ -43,4 +43,18 @@
         ])
 
+    def test_json_quote(self):
+        code, out, _ = self.quote("--format", "json", "--coupon", "SAVE10")
+        data = json.loads(out)
+        self.assertEqual(code, 0)
+        self.assertEqual((data["subtotal"], data["discount"], data["total"]), ("236.00", "23.60", "237.44"))
+        self.assertEqual(data["coupon"], {"code": "SAVE10", "applied": True, "problem": None})
+        self.assertEqual(data["lines"][0]["quantity"], 1)
+
+    def test_json_rejected_coupon(self):
+        _, out, _ = self.quote("--format", "json", "--coupon", "SPRING15")
+        data = json.loads(out)
+        self.assertFalse(data["coupon"]["applied"])
+        self.assertEqual(data["discount"], "0.00")
+
     def test_bad_quantity_exits_2(self):
         files = TempFiles()
```

**Tool call: shell**

```console
$ python -m pytest -q
...............................................                          [100%]
47 passed in 0.09s
```

**Tool call: shell**

```console
$ python -m pricebook quote examples/order.csv --region CA-ON --date 2026-05-04 --coupon SAVE10 --format json | head -16
{
  "issue_date": "2026-05-04",
  "due_date": "2026-06-03",
  "region": "CA-ON",
  "currency": "CAD",
  "lines": [
    {
      "sku": "DRILL-18V",
      "description": "18V cordless drill",
      "quantity": 1,
      "unit_price": "129.00",
      "amount": "129.00",
      "net": "116.10",
      "tax_category": "standard"
    },
    {
```

**Tool call: shell**

```console
$ python -m pricebook quote examples/bulk-order.csv --region CA-ON --date 2026-05-04 --format json | grep -m1 unit_price
      "unit_price": "0.125",
```

## Agent (final message)

Added `--format json`.

- `render_json` in `pricebook/render.py` builds the object from the ticket. Money values are strings from the existing `_amount` helper, so they keep the currency's digits; `unit_price` is the raw catalog value (`0.125` stays `0.125`, shown above).
- `coupon` is `null` without a coupon, and has `applied: false` plus the reason when it does not apply.
- Text and CSV paths are unchanged; the CLI now picks the renderer from a small dict.
- `test_csv_quote` now compares all four CSV rows instead of only the line count. I pinned it on the old code first (output above), so a change to the CSV output would fail it.
- README: the CLI usage line lists `json`.
- Added two CLI tests. Full suite: 47 passed (output above).
