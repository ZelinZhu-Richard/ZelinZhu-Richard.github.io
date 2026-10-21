"""The product catalog: SKUs, names, unit prices and tax categories."""

from __future__ import annotations

import csv
from dataclasses import dataclass
from pathlib import Path

from .money import Money

DATA_DIR = Path(__file__).parent / "data"


class UnknownSku(KeyError):
    """Raised when a SKU is not in the catalog."""


@dataclass(frozen=True)
class Product:
    sku: str
    name: str
    unit_price: Money
    tax_category: str = "standard"


class Catalog:
    def __init__(self, products: list[Product]) -> None:
        self._by_sku: dict[str, Product] = {}
        for product in products:
            if product.sku in self._by_sku:
                raise ValueError(f"duplicate SKU in catalog: {product.sku}")
            self._by_sku[product.sku] = product

    def get(self, sku: str) -> Product:
        try:
            return self._by_sku[sku]
        except KeyError:
            raise UnknownSku(sku) from None

    def __contains__(self, sku: object) -> bool:
        return sku in self._by_sku

    def __len__(self) -> int:
        return len(self._by_sku)


def load_catalog(path: str | Path = DATA_DIR / "catalog.csv") -> Catalog:
    """Load a catalog CSV with columns sku,name,unit_price,currency,tax_category."""
    products = []
    with open(path, newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            products.append(
                Product(
                    sku=row["sku"].strip(),
                    name=row["name"].strip(),
                    unit_price=Money(row["unit_price"], row["currency"].strip()),
                    tax_category=row["tax_category"].strip() or "standard",
                )
            )
    return Catalog(products)
