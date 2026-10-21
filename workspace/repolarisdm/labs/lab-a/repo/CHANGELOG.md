# Changelog

## 0.6.1 (2026-02-20)

- Fix: `query --tag` now requires every given tag. It used to match any one.
- Fix: `max_line_bytes` counts UTF-8 bytes, not characters.

## 0.6.0 (2026-01-28)

- `query --format json` prints one JSON object per row.
- Tally lines accept a `T<epoch seconds>` field.
- `TALLYHUB_<FIELD>` environment variables override the TOML config.

## 0.5.0 (2025-12-03)

- Gauges (`g`). Buckets keep the latest value and its timestamp.
  SQLite schema v2 adds `last` and `last_ts`; v1 databases migrate on open.
- Duplicate ids: the cache is now bounded by `dedup_cache_size`.

## 0.4.0 (2025-10-15)

- Renamed `windows.bucket_for()` to `windows.bucket_start()`.
- A query window must be a whole multiple of `resolution_seconds`.
- ISO timestamps may carry fractional seconds; they are dropped.

## 0.3.0 (2025-09-02)

- SQLite store (`sqlite:///PATH`), now the default. `memory://` stays for tests.
- JSON lines accept ISO 8601 timestamps as well as epoch seconds.
