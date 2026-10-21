"""The interface every bucket store implements."""

from __future__ import annotations

import abc
from collections.abc import Mapping

from ..aggregate import Aggregate, BucketKey
from ..model import Kind, SeriesKey

Row = tuple[SeriesKey, int, Aggregate]


def sort_rows(rows: list[Row]) -> list[Row]:
    """The one row order every backend returns: kind, tags, then bucket start."""
    return sorted(rows, key=lambda r: (r[0].kind.value, r[0].tags, r[1]))


class Store(abc.ABC):
    """Holds base-resolution buckets. Writing a bucket that exists merges into it."""

    @abc.abstractmethod
    def write(self, buckets: Mapping[BucketKey, Aggregate]) -> None:
        """Merge every bucket into the store, atomically."""

    @abc.abstractmethod
    def fetch(self, metric: str, start: float | None = None, end: float | None = None) -> list[Row]:
        """Buckets of `metric` with start <= bucket start < end, sorted by series then time."""

    @abc.abstractmethod
    def metrics(self) -> list[tuple[str, Kind]]:
        """Every (metric, kind) pair that has at least one bucket, sorted."""

    def close(self) -> None:
        pass

    def __enter__(self) -> Store:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()
