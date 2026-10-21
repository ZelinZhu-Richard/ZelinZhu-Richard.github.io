"""Service layer: what the CLI calls today and an HTTP handler would call later.

Methods take and return plain data (str, float, dict, list), so every result
can go straight to ``json.dumps``.
"""

from __future__ import annotations

import time
from collections.abc import Iterable, Mapping
from dataclasses import asdict

from .aggregate import Aggregate, rollup
from .config import Config
from .ingest import Ingestor
from .model import SeriesKey, tag_key
from .parsing import Clock
from .storage import Store
from .windows import format_ts, parse_duration


class TallyService:
    def __init__(self, store: Store, config: Config, now: Clock = time.time) -> None:
        self.store = store
        self.config = config
        self._ingestor = Ingestor(store, config, now=now)

    def ingest(self, lines: Iterable[str]) -> dict[str, object]:
        return asdict(self._ingestor.feed(lines))

    def query(self, metric: str, window: str | int = "1h",
              start: float | None = None, end: float | None = None,
              tags: Mapping[str, str] | None = None) -> list[dict[str, object]]:
        """One row per (series, window) with data.

        `start` and `end` select base buckets (start <= bucket < end). If they
        are not aligned to `window`, the first and last windows are partial.
        """
        width = parse_duration(window) if isinstance(window, str) else int(window)
        resolution = self.config.resolution_seconds
        if width % resolution:
            raise ValueError(f"window of {width}s is not a multiple of the {resolution}s resolution")
        wanted = tag_key(tags or {})
        series_buckets: dict[SeriesKey, list[tuple[int, Aggregate]]] = {}
        for series, t, agg in self.store.fetch(metric, start, end):
            if series.matches(wanted):
                series_buckets.setdefault(series, []).append((t, agg))
        rows = []
        for series, buckets in series_buckets.items():
            for t, agg in rollup(buckets, width).items():
                rows.append({"window": format_ts(t), "series": series.render(),
                             "kind": series.kind.value, **agg.report(series.kind)})
        return rows

    def metrics(self) -> list[dict[str, str]]:
        return [{"metric": m, "kind": k.value} for m, k in self.store.metrics()]
