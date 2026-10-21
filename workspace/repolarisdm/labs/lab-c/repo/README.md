# pricebook

Price lists, coupons, sales tax and invoices with exact decimal money.
pricebook has no runtime dependencies. It needs Python 3.10 or newer.

```console
$ python -m pricebook quote examples/order.csv --region CA-ON --date 2026-05-04 --coupon SAVE10
INVOICE 2026-05-04
Region: CA-ON    Currency: CAD
...
Total: 237.44 CAD
Due: 2026-06-03
```

## How totals are computed

1. A line total is unit price x quantity, rounded to the currency's minor unit.
   Unit prices may have more digits than the currency (bulk items such as `BOLT-M4` at 0.125).
2. The subtotal is the sum of the line totals.
3. A coupon's discount is spread over the lines in proportion to their totals
   (`Money.allocate`). The shares add up to the discount exactly.
4. Tax is charged per tax category on the discounted line amounts and rounded once per category.
5. Total = subtotal - discount + tax.

A discount never makes an amount negative: it is at most the subtotal.

## Rounding

Every amount is a `Decimal`. Floats are refused. Rounding goes to the currency's minor unit
(2 digits for CAD, EUR, GBP and USD; 0 digits for JPY) with `ROUND_HALF_UP`: ties go away
from zero, so 0.125 becomes 0.13. Do not use Python's `round()` on money: it sends ties to
the even digit (0.125 becomes 0.12).

## Data files

The bundled files live in `pricebook/data/`. They are sample data for tests, not tax advice.

| File | Columns | Notes |
|---|---|---|
| `catalog.csv` | `sku,name,unit_price,currency,tax_category` | Categories in use: `standard`, `food`, `digital`. A blank category means `standard`. |
| `rates.csv` | `region,category,rate` | `rate` is a fraction (0.13 = 13 %). A category without a row uses the region's `standard` rate. |
| `coupons.csv` | `code,kind,value,currency,min_subtotal,valid_from,valid_until` | `kind` is `percent` or `fixed`. Both dates are included. |

Regions in `rates.csv`: CA-AB, CA-ON, DE, JP, US-OR, US-WA.

## Command line

```console
$ python -m pricebook quote ORDER.csv --region REGION [--coupon CODE] [--date YYYY-MM-DD]
                                     [--net-days N] [--format text|csv]
                                     [--catalog PATH] [--rates PATH] [--coupons PATH]
```

An order file has the columns `sku,quantity`. Input errors (bad quantity, unknown region,
unknown coupon) print `error: ...` to stderr and exit with status 2.

The last two lines of the text format are `Total: <amount> <currency>` and `Due: <date>`.
The billing mailer parses them, so their format must not change.

## Development

```console
$ python -m unittest            # standard library only
$ python -m pytest -q           # same tests, if you installed the dev extra
```

Tests live in `tests/`. Each module has its own test file.
