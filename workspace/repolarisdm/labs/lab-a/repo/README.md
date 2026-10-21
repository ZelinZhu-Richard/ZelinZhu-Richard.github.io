# tallyhub

tallyhub counts events and aggregates metrics into time windows.
It reads JSON lines or statsd-style "tally" lines, folds them into
base buckets (one minute by default), keeps the buckets in SQLite,
and answers "how many, how long, per window" queries.

No runtime dependencies. Python 3.11 or newer.

## Quick start

```sh
uv venv --python 3.13 .venv
uv pip install --python .venv/bin/python -r requirements-dev.txt
.venv/bin/python -m pytest
.venv/bin/python -m tallyhub --store sqlite:///demo.db ingest examples/sample.ndjson
.venv/bin/python -m tallyhub --store sqlite:///demo.db query http.requests --window 1h
.venv/bin/python -m tallyhub --store sqlite:///demo.db metrics
```

`pip install -e .` also gives you a `tallyhub` command.

## Input

One event per line. Blank lines and lines that start with `#` are skipped.

JSON:

```json
{"metric": "http.requests", "kind": "counter", "value": 1, "ts": "2026-03-02T14:05:00Z", "tags": {"route": "/login"}, "id": "e-17"}
```

`kind` defaults to `counter` and `value` to 1. `rate` is an optional sample rate.
`id` is optional; a repeated id is dropped as a duplicate.

Tally (statsd style):

```text
http.requests:1|c|@0.5|#route:/login,status:200|T1772460300
```

Fields after the kind code: `@rate`, `#key:value,...` tags, `T<epoch seconds>`.

Timestamps are epoch seconds (int or float) or ISO 8601 strings such as
`2026-03-02T14:05:00Z`, with an optional UTC offset such as `-05:00`.
Fractional seconds in ISO strings are dropped. A string without an offset
is read as UTC. An event without a timestamp gets the time it was ingested.

## Kinds

| kind    | tally code | sample rate         | a window reports      |
|---------|------------|---------------------|-----------------------|
| counter | `c`        | value scaled by 1/rate | sum of values      |
| gauge   | `g`        | ignored             | latest value          |
| timer   | `ms`       | ignored             | count, mean, min, max |

## Querying

```sh
python -m tallyhub query METRIC [--window 1h] [--start T] [--end T] [--tag k=v ...] [--format table|json]
```

Windows are aligned to the Unix epoch, so `1d` windows start at 00:00 UTC.
A window must be a whole multiple of `resolution_seconds`. `--start` and
`--end` take epoch seconds or ISO 8601 and select base buckets with
`start <= bucket < end`. Each tag set is its own series and gets its own row.

## Configuration

Pass a TOML file with `--config` (see `tallyhub.example.toml`).
`TALLYHUB_<FIELD>` environment variables override the file, for example
`TALLYHUB_STORE_URL=memory://`. `--store` overrides both.

| field                | default                 | meaning                                  |
|----------------------|-------------------------|------------------------------------------|
| `store_url`          | `sqlite:///tallyhub.db` | `memory://` or `sqlite:///PATH`          |
| `resolution_seconds` | 60                      | width of the stored base buckets          |
| `max_line_bytes`     | 8192                    | longer lines are rejected                 |
| `dedup_cache_size`   | 10000                   | recent event ids remembered; 0 turns it off |
| `batch_size`         | 500                     | events per store write                    |
| `strict`             | false                   | stop at the first bad line                |

## Layout

```text
tallyhub/
  cli.py        argparse front end (ingest, query, metrics)
  api.py        TallyService: the calls the CLI makes
  ingest.py     lines -> events -> base buckets -> store, in batches
  parsing.py    one line -> Event
  aggregate.py  Aggregate, merge, rollup
  windows.py    durations and window alignment
  model.py      Event, SeriesKey, Kind
  config.py     defaults, TOML, environment
  storage/      Store interface, memory and SQLite backends
tests/          pytest suite
```

## Known limitations

- Duplicate ids are remembered per process only. Ingesting the same file
  twice in two runs counts it twice.
- Windows are always aligned to UTC. There is no local-time view.
- Line numbers in ingest errors count across all input files.
