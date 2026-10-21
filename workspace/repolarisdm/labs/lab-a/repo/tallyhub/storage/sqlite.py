"""SQLite store: one row per (metric, kind, tags, bucket start)."""

from __future__ import annotations

import json
import sqlite3
from collections.abc import Mapping

from ..aggregate import Aggregate, BucketKey
from ..model import Kind, SeriesKey
from .base import Row, Store, sort_rows

SCHEMA_VERSION = 2

_CREATE = """
CREATE TABLE IF NOT EXISTS buckets (
    metric  TEXT    NOT NULL,
    kind    TEXT    NOT NULL,
    tags    TEXT    NOT NULL,  -- JSON list of [key, value] pairs, sorted by key
    start   INTEGER NOT NULL,  -- bucket start, epoch seconds
    count   INTEGER NOT NULL,
    total   REAL    NOT NULL,
    min     REAL    NOT NULL,
    max     REAL    NOT NULL,
    last    REAL    NOT NULL,
    last_ts REAL    NOT NULL,
    PRIMARY KEY (metric, kind, tags, start)
)
"""

# Schema v1 (tallyhub < 0.5) had no gauges, so it kept no latest value.
_MIGRATE_V1 = (
    "ALTER TABLE buckets ADD COLUMN last REAL NOT NULL DEFAULT 0",
    "ALTER TABLE buckets ADD COLUMN last_ts REAL NOT NULL DEFAULT 0",
)

_UPSERT = """
INSERT INTO buckets (metric, kind, tags, start, count, total, min, max, last, last_ts)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (metric, kind, tags, start) DO UPDATE SET
    count   = count + excluded.count,
    total   = total + excluded.total,
    min     = MIN(min, excluded.min),
    max     = MAX(max, excluded.max),
    last    = CASE WHEN excluded.last_ts >= last_ts THEN excluded.last ELSE last END,
    last_ts = MAX(last_ts, excluded.last_ts)
"""


class SqliteStore(Store):
    def __init__(self, path: str) -> None:
        self._conn = sqlite3.connect(path)
        self._migrate()

    def _migrate(self) -> None:
        version = self._conn.execute("PRAGMA user_version").fetchone()[0]
        if version == SCHEMA_VERSION:
            return
        if version > SCHEMA_VERSION:
            raise RuntimeError(f"database schema v{version} is newer than this tallyhub")
        with self._conn:
            if version == 0:
                self._conn.execute(_CREATE)
            else:
                for statement in _MIGRATE_V1:
                    self._conn.execute(statement)
            self._conn.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")

    def write(self, buckets: Mapping[BucketKey, Aggregate]) -> None:
        rows = [
            (series.metric, series.kind.value, json.dumps(series.tags), start,
             a.count, a.total, a.min, a.max, a.last, a.last_ts)
            for (series, start), a in buckets.items()
        ]
        with self._conn:
            self._conn.executemany(_UPSERT, rows)

    def fetch(self, metric: str, start: float | None = None, end: float | None = None) -> list[Row]:
        sql = ("SELECT kind, tags, start, count, total, min, max, last, last_ts"
               " FROM buckets WHERE metric = ?")
        args: list[object] = [metric]
        if start is not None:
            sql += " AND start >= ?"
            args.append(start)
        if end is not None:
            sql += " AND start < ?"
            args.append(end)
        rows = []
        for kind, tags, t, *values in self._conn.execute(sql, args):
            series = SeriesKey(metric, Kind(kind), tuple((k, v) for k, v in json.loads(tags)))
            rows.append((series, t, Aggregate(*values)))
        return sort_rows(rows)

    def metrics(self) -> list[tuple[str, Kind]]:
        cur = self._conn.execute("SELECT DISTINCT metric, kind FROM buckets ORDER BY metric, kind")
        return [(metric, Kind(kind)) for metric, kind in cur]

    def close(self) -> None:
        self._conn.close()
