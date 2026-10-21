# PB-141: Add a per-line tax column to the CSV export

Reported by: accounting

Accounting imports `pricebook quote --format csv` into the ledger. They need the tax of each line.

- Add a column `tax` right after `net`.
- A line's tax is its `net` amount times the tax rate of the line's category in the invoice's region.
- Round it the same way as every other amount in pricebook (README, "Rounding").
- The per-line taxes may differ from the invoice tax by rounding. That is expected.
  Do not change how the invoice tax is computed.

**Acceptance:** `python -m pricebook quote examples/order.csv --region CA-ON --date 2026-05-04 --format csv`
shows the new column. Tests cover it.
