# PB-146: Bulk bolt price is rounded up

Reported by: warehouse

`BOLT-M4` costs 0.125 CAD per bolt. An order of 1000 bolts shows an amount of 130.00.
It should be 125.00. See `examples/bulk-order.csv`.
