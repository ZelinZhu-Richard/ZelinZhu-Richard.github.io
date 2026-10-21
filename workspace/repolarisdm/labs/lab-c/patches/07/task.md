# PB-147: Coupon rejected on its last day

Reported by: support

A customer used `SPRING15` on 2026-03-31 and saw:

```console
Coupon not applied: SPRING15 is not valid on 2026-03-31
```

`coupons.csv` says `valid_until` is 2026-03-31, and the README says both dates are included. Fix it.
