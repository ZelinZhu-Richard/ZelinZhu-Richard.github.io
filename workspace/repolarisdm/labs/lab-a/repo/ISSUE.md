# Events with a UTC offset are counted in the wrong window (#41)

**Labels:** bug, needs-triage
**Version:** tallyhub 0.6.1, Python 3.13, SQLite store

## What happened

Our New York checkout service sends ISO timestamps with its local offset
(`-05:00`). Late-evening orders show up on the previous UTC day in the
daily view. Our Berlin service sends `+01:00`, and its hourly numbers look
one hour off too. Services that send `Z` timestamps or epoch seconds look fine.

Nothing is rejected and nothing is logged. The totals are just in the wrong place.

## Steps to reproduce

```console
$ cat > orders.ndjson <<'EOF'
{"metric": "checkout.orders", "ts": "2026-03-01T23:30:00-05:00", "id": "ny-1001"}
{"metric": "checkout.orders", "ts": "2026-03-02T04:45:00Z", "id": "ny-1002"}
EOF
$ python -m tallyhub --store sqlite:///issue41.db ingest orders.ndjson
accepted 2, rejected 0, duplicates 0, bucket writes 2
$ python -m tallyhub --store sqlite:///issue41.db query checkout.orders --window 1d
```

## Expected

23:30 at `-05:00` is 04:30 UTC on March 2. Both orders are on 2026-03-02 (UTC):

```text
window                series           value
2026-03-02T00:00:00Z  checkout.orders  2
```

## Actual

```text
window                series           value
2026-03-01T00:00:00Z  checkout.orders  1
2026-03-02T00:00:00Z  checkout.orders  1
```

## Notes from the reporter

- The README says ISO timestamps may have "an optional UTC offset such as `-05:00`".
- Our guess: `1d` windows are cut at the wrong time for producers outside UTC.
  Maybe the window code should use the producer's offset?
- We only checked counters.
