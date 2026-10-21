import sqlite3

import pytest

from tallyhub.aggregate import Aggregate
from tallyhub.model import Kind, SeriesKey
from tallyhub.storage import MemoryStore, SqliteStore, open_store

T0 = 1772460000  # 2026-03-02T14:00:00Z
REQS = SeriesKey("http.requests", Kind.COUNTER, (("route", "/a"),))
REQS_B = SeriesKey("http.requests", Kind.COUNTER, (("route", "/b"),))
DEPTH = SeriesKey("queue.depth", Kind.GAUGE)


def test_write_then_fetch(store):
    store.write({(REQS, T0): Aggregate.of(1.0, T0), (REQS_B, T0): Aggregate.of(2.0, T0)})
    rows = store.fetch("http.requests")
    assert [(s, t, a.total) for s, t, a in rows] == [(REQS, T0, 1.0), (REQS_B, T0, 2.0)]


def test_writing_an_existing_bucket_merges(store):
    store.write({(DEPTH, T0): Aggregate.of(5.0, T0 + 10)})
    store.write({(DEPTH, T0): Aggregate.of(3.0, T0 + 2)})
    [(_, _, agg)] = store.fetch("queue.depth")
    assert (agg.count, agg.total, agg.min, agg.max, agg.last) == (2, 8.0, 3.0, 5.0, 5.0)


def test_fetch_range_is_half_open(store):
    store.write({(REQS, T0 + 60 * i): Aggregate.of(1.0, T0 + 60 * i) for i in range(5)})
    assert [t for _, t, _ in store.fetch("http.requests", T0 + 60, T0 + 180)] == [T0 + 60, T0 + 120]


def test_metrics_lists_metric_and_kind(store):
    store.write({(REQS, T0): Aggregate.of(1.0, T0), (DEPTH, T0): Aggregate.of(1.0, T0)})
    assert store.metrics() == [("http.requests", Kind.COUNTER), ("queue.depth", Kind.GAUGE)]


def test_sqlite_data_survives_reopen(tmp_path):
    path = str(tmp_path / "t.db")
    with SqliteStore(path) as s:
        s.write({(REQS, T0): Aggregate.of(4.0, T0)})
    with SqliteStore(path) as s:
        assert s.fetch("http.requests")[0][2].total == 4.0


def test_sqlite_migrates_v1_schema(tmp_path):
    path = str(tmp_path / "old.db")
    conn = sqlite3.connect(path)
    conn.execute("CREATE TABLE buckets (metric TEXT NOT NULL, kind TEXT NOT NULL, tags TEXT NOT NULL,"
                 " start INTEGER NOT NULL, count INTEGER NOT NULL, total REAL NOT NULL,"
                 " min REAL NOT NULL, max REAL NOT NULL, PRIMARY KEY (metric, kind, tags, start))")
    conn.execute("INSERT INTO buckets VALUES ('jobs', 'counter', '[]', ?, 2, 2.0, 1.0, 1.0)", (T0,))
    conn.execute("PRAGMA user_version = 1")
    conn.commit()
    conn.close()
    with SqliteStore(path) as s:
        s.write({(SeriesKey("jobs", Kind.COUNTER), T0): Aggregate.of(1.0, T0)})
        assert s.fetch("jobs")[0][2].total == 3.0


def test_open_store_urls(tmp_path):
    assert isinstance(open_store("memory://"), MemoryStore)
    s = open_store(f"sqlite:///{tmp_path / 'x.db'}")
    assert isinstance(s, SqliteStore)
    s.close()
    with pytest.raises(ValueError):
        open_store("postgres://db")
