# PB-144: Fixed-amount coupon can make the total negative

Reported by: support

One pair of gloves (`GLOVE-L`, 12.00 CAD) with coupon `WELCOME20` (20.00 off) in `CA-ON` shows a
discount of 20.00, a negative tax line and a negative total.

The README says a discount is at most the subtotal. Make the code match. The other rules in
"How totals are computed" stay as they are.

**Expected for that order:** discount 12.00, tax 0.00, total 0.00.
