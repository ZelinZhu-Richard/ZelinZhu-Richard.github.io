# freebusy

A small library that turns room bookings into busy spans.
A calendar export gives you bookings (room, start, end, title).
`freebusy` tells you when each room is busy without a break.

## Layout

- `freebusy/model.py`: the `Booking` and `BusySpan` data types.
- `freebusy/csvio.py`: `load_bookings(path)` reads a CSV export. Timestamps must carry a UTC offset.
- `freebusy/merge.py`: `merge_busy(bookings, *, tolerance)` merges bookings into busy spans.
- `freebusy/__main__.py`: the command line.
- `data/sample_bookings.csv`: one day of bookings from one office.
- `tests/`: unit tests (standard library `unittest`).

## Use

```sh
python3 -m freebusy data/sample_bookings.csv
python3 -m freebusy data/sample_bookings.csv --tolerance 15
```

Each output line is: room, span start, span end, number of bookings (tab-separated).

## Test

```sh
python3 -m unittest discover -s tests -v
```

No third-party packages are needed. Python 3.9 or newer.
