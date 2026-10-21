"""Read lines, parse them, drop repeated event ids, write buckets in batches."""

from __future__ import annotations

import time
from collections import OrderedDict
from collections.abc import Iterable
from dataclasses import dataclass, field

from .aggregate import aggregate_events
from .config import Config
from .model import Event
from .parsing import Clock, ParseError, parse_line
from .storage import Store

MAX_REPORTED_ERRORS = 20


class IngestError(Exception):
    """Strict mode only: the first line that could not be ingested."""


@dataclass
class IngestReport:
    accepted: int = 0
    rejected: int = 0
    duplicates: int = 0
    bucket_writes: int = 0  # one bucket touched by two batches counts twice
    errors: list[str] = field(default_factory=list)


class Ingestor:
    """Feeds lines into a store.

    Duplicate detection only remembers the last ``dedup_cache_size`` event ids
    seen by this Ingestor. Ids are not stored, so a new process starts empty.
    """

    def __init__(self, store: Store, config: Config, now: Clock = time.time) -> None:
        self.store = store
        self.config = config
        self.now = now
        self._seen: OrderedDict[str, None] = OrderedDict()

    def feed(self, lines: Iterable[str]) -> IngestReport:
        report = IngestReport()
        batch: list[Event] = []
        for lineno, line in enumerate(lines, start=1):
            if not line.strip() or line.lstrip().startswith("#"):
                continue
            try:
                event = self._parse(line)
            except ParseError as exc:
                if self.config.strict:
                    raise IngestError(f"line {lineno}: {exc}") from exc
                report.rejected += 1
                if len(report.errors) < MAX_REPORTED_ERRORS:
                    report.errors.append(f"line {lineno}: {exc}")
                continue
            if self._is_duplicate(event.event_id):
                report.duplicates += 1
                continue
            batch.append(event)
            report.accepted += 1
            if len(batch) >= self.config.batch_size:
                report.bucket_writes += self._flush(batch)
                batch = []
        if batch:
            report.bucket_writes += self._flush(batch)
        return report

    def _parse(self, line: str) -> Event:
        if len(line.encode("utf-8")) > self.config.max_line_bytes:
            raise ParseError(f"line is longer than {self.config.max_line_bytes} bytes")
        return parse_line(line, now=self.now)

    def _is_duplicate(self, event_id: str | None) -> bool:
        if event_id is None or self.config.dedup_cache_size == 0:
            return False
        if event_id in self._seen:
            self._seen.move_to_end(event_id)
            return True
        self._seen[event_id] = None
        if len(self._seen) > self.config.dedup_cache_size:
            self._seen.popitem(last=False)
        return False

    def _flush(self, batch: list[Event]) -> int:
        buckets = aggregate_events(batch, self.config.resolution_seconds)
        self.store.write(buckets)
        return len(buckets)
