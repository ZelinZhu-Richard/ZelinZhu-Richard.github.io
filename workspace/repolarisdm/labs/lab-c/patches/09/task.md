# PB-149: Accept tax rates written as percentages

Reported by: accounting

Our accountant sends `rates.csv` with rates such as `13%` or `8.875 %`. `load_rates` rejects them
with "invalid tax rate".

Accept both forms: a fraction (`0.13`) or a percentage (`13%`, `8.875 %`; spaces around the number
are fine). The range check stays: at least 0 % and below 100 %. Any other text is a `ValueError`.
