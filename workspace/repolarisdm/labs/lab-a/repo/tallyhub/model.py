"""Core data types shared by parsing, ingest, aggregation and storage."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from enum import Enum

TagKey = tuple[tuple[str, str], ...]


class Kind(str, Enum):
    COUNTER = "counter"
    GAUGE = "gauge"
    TIMER = "timer"


def tag_key(tags: Mapping[str, object]) -> TagKey:
    """Canonical, hashable form of a tag mapping. Order does not matter."""
    return tuple(sorted((str(k), str(v)) for k, v in tags.items()))


@dataclass(frozen=True)
class SeriesKey:
    """One time series: a metric name, its kind and one exact set of tags."""

    metric: str
    kind: Kind
    tags: TagKey = ()

    def render(self) -> str:
        if not self.tags:
            return self.metric
        inner = ",".join(f"{k}={v}" for k, v in self.tags)
        return f"{self.metric}{{{inner}}}"

    def matches(self, wanted: TagKey) -> bool:
        """True if every wanted (key, value) pair is among this series' tags."""
        return set(wanted) <= set(self.tags)


@dataclass(frozen=True)
class Event:
    """One parsed input line. ``ts`` is seconds since the Unix epoch, in UTC."""

    series: SeriesKey
    value: float
    ts: float
    event_id: str | None = None
