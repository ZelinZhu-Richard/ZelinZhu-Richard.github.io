# PB-150: JSON output for quotes

Reported by: web team

Add `--format json` to `pricebook quote`. Print one JSON object like this one
(example order, coupon `SAVE10`, issued 2026-05-04; lines shortened):

```json
{
  "issue_date": "2026-05-04",
  "due_date": "2026-06-03",
  "region": "CA-ON",
  "currency": "CAD",
  "lines": [
    {"sku": "DRILL-18V", "description": "18V cordless drill", "quantity": 1, "unit_price": "129.00",
     "amount": "129.00", "net": "116.10", "tax_category": "standard"}
  ],
  "subtotal": "236.00",
  "coupon": {"code": "SAVE10", "applied": true, "problem": null},
  "discount": "23.60",
  "tax": {"food": "0.00", "standard": "25.04"},
  "total": "237.44"
}
```

- Money values are strings with the currency's digits, never JSON numbers.
  `unit_price` keeps the catalog's precision.
- `coupon` is `null` when no coupon was given. For a coupon that does not apply,
  `applied` is `false` and `problem` is the reason.
- `quantity` is a JSON integer.
- Text and CSV output must not change.
