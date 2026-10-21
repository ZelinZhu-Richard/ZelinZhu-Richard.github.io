# PB-151: Thousands separators in the text invoice

Reported by: finance

Finance wants thousands separators in the text invoice: `12,900.00`, not `12900.00`. Use them for
money in the line table and in the Subtotal, Discount and Tax rows.

With separators, big amounts no longer fit the 10-character columns. Size the money columns to the
widest value, so every amount still lines up on the right.

Do not change the `Total:` and `Due:` lines. The billing mailer parses them (README).
