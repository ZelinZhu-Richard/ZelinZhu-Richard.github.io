# PB-148: Unknown SKU crashes the quote command

Reported by: support

If an order has a SKU that is not in the catalog, `pricebook quote` crashes with a Python traceback
(`UnknownSku`).

Make it an input error like the others: print `error: ...` to stderr, name the SKU and its line in
the order file, exit with status 2, and print no invoice. Pricing must never silently drop an order line.
