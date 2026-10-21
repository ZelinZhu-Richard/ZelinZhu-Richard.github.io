"""In-process store. Used by tests and by `--store memory://` one-shot runs."""

from __future__ import annotations

from collections.abc import Mapping

from ..aggregate import Aggregate, BucketKey
from ..model import Kind
from .base import Row, Store, sort_rows


class MemoryStore(Store):
    def __init__(self) -> None:
        self._buckets: dict[BucketKey, Aggregate] = {}

    def write(self, buckets: Mapping[BucketKey, Aggregate]) -> None:
        for key, agg in buckets.items():
            old = self._buckets.get(key)
            self._buckets[key] = agg if old is None else old.merge(agg)

    def fetch(self, metric: str, start: float | None = None, end: float | None = None) -> list[Row]:
        rows = [
            (series, t, agg)
            for (series, t), agg in self._buckets.items()
            if series.metric == metric
            and (start is None or t >= start)
            and (end is None or t < end)
        ]
        return sort_rows(rows)

    def metrics(self) -> list[tuple[str, Kind]]:
        pairs = {(series.metric, series.kind) for series, _ in self._buckets}
        return sorted(pairs, key=lambda p: (p[0], p[1].value))
