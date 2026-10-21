from dataclasses import replace

import pytest

from tallyhub.ingest import IngestError, Ingestor
from tallyhub.storage import MemoryStore

T0 = 1772460000  # 2026-03-02T14:00:00Z


def lines(*ids):
    return [f'{{"metric": "orders", "ts": {T0}, "id": "{i}"}}' for i in ids]


def test_counts_accepted_rejected_and_duplicates(config):
    store = MemoryStore()
    report = Ingestor(store, config).feed(["# comment", "", *lines("a", "b", "a"), "oops"])
    assert (report.accepted, report.rejected, report.duplicates) == (2, 1, 1)
    assert report.errors == ["line 6: expected <metric>:<value>|<kind>"]
    assert store.fetch("orders")[0][2].total == 2.0


def test_dedup_cache_is_bounded(config):
    ingestor = Ingestor(MemoryStore(), replace(config, dedup_cache_size=2))
    report = ingestor.feed(lines("a", "b", "c", "a"))
    assert report.duplicates == 0  # "a" was evicted before it came back


def test_dedup_can_be_turned_off(config):
    report = Ingestor(MemoryStore(), replace(config, dedup_cache_size=0)).feed(lines("a", "a"))
    assert report.duplicates == 0


def test_strict_mode_raises_on_first_bad_line(config):
    with pytest.raises(IngestError, match="line 2"):
        Ingestor(MemoryStore(), replace(config, strict=True)).feed([*lines("a"), "bad"])


def test_batches_are_flushed_as_they_fill(config):
    store = MemoryStore()
    report = Ingestor(store, replace(config, batch_size=2)).feed(lines("a", "b", "c"))
    assert report.bucket_writes == 2
    assert store.fetch("orders")[0][2].count == 3


def test_overlong_lines_are_rejected(config):
    report = Ingestor(MemoryStore(), replace(config, max_line_bytes=10)).feed(["orders:1|c|T1772460000"])
    assert report.rejected == 1
