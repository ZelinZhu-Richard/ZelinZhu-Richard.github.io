"""Per-window aggregates and how they combine.

A bucket keeps count, total, min, max and the latest value. That is enough
to report every kind: counters report the total, gauges the latest value,
timers count/mean/min/max. Two aggregates of the same series merge exactly,
so wide windows are built by merging narrow ones (see ``rollup``).
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass

from .model import Event, Kind, SeriesKey
from .windows import bucket_start

BucketKey = tuple[SeriesKey, int]


@dataclass(frozen=True)
class Aggregate:
    count: int
    total: float
    min: float
    max: float
    last: float
    last_ts: float

    @classmethod
    def of(cls, value: float, ts: float) -> Aggregate:
        return cls(1, value, value, value, value, ts)

    def merge(self, other: Aggregate) -> Aggregate:
        # Gauges keep the newest value. On a timestamp tie, `other` wins.
        newer = other if other.last_ts >= self.last_ts else self
        return Aggregate(
            count=self.count + other.count,
            total=self.total + other.total,
            min=min(self.min, other.min),
            max=max(self.max, other.max),
            last=newer.last,
            last_ts=newer.last_ts,
        )

    def report(self, kind: Kind) -> dict[str, float]:
        if kind is Kind.COUNTER:
            return {"value": self.total}
        if kind is Kind.GAUGE:
            return {"value": self.last}
        return {"count": self.count, "mean": round(self.total / self.count, 6),
                "min": self.min, "max": self.max}


def aggregate_events(events: Iterable[Event], resolution: int) -> dict[BucketKey, Aggregate]:
    """Fold events into buckets of `resolution` seconds, keyed by (series, start)."""
    out: dict[BucketKey, Aggregate] = {}
    for event in events:
        key = (event.series, bucket_start(event.ts, resolution))
        agg = Aggregate.of(event.value, event.ts)
        out[key] = out[key].merge(agg) if key in out else agg
    return out


def rollup(buckets: Iterable[tuple[int, Aggregate]], width: int) -> dict[int, Aggregate]:
    """Merge (start, aggregate) pairs of one series into windows of `width` seconds."""
    out: dict[int, Aggregate] = {}
    for start, agg in buckets:
        key = bucket_start(start, width)
        out[key] = out[key].merge(agg) if key in out else agg
    return dict(sorted(out.items()))
