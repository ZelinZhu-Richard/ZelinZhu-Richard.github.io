# PB-143: CSV files saved from Excel are rejected

Reported by: support

Customers save orders from Excel with "CSV UTF-8". `pricebook quote` then fails:

```console
error: line 2: missing SKU
```

Column A is filled. Excel writes a byte-order mark (BOM) at the start of the file.
Catalog files exported from Excel fail too (`KeyError: 'sku'`).

Accept order files and catalog files with or without a BOM. Files without a BOM must keep working.
