# PB-152: Discount shares don't add up

Reported by: accounting

`Money("0.05", "CAD").allocate([1, 1, 1])` returns 0.02, 0.02, 0.02. That is 0.06, not 0.05.
On real invoices the discounted lines then don't add up to subtotal minus discount.

The docstring and the README promise that the parts add up exactly. Fix `allocate` so that:

- the parts always add up to the amount;
- each part is within one minor unit of its exact share;
- when cents are left over and shares tie, earlier parts get them first.
  The example must give 0.02, 0.02, 0.01.
