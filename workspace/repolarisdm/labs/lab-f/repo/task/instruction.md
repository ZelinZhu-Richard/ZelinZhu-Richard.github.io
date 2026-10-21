# Merge room bookings into busy spans

The `freebusy` library in `/app` reads room bookings and reports when each room is busy.
The function `freebusy.merge_busy` is not implemented yet. Implement it.

## Interface

```python
merge_busy(bookings, *, tolerance=timedelta(0)) -> list[BusySpan]
```

- `bookings` is a list of `freebusy.Booking(room, start, end, title)`.
- The result is a new list of `freebusy.BusySpan(room, start, end, sources)`.
- Do not change the `Booking` or `BusySpan` types, `load_bookings`, or the command line.

## Rules

R1. **Half-open.** A booking covers `[start, end)`: the start instant is busy, the end instant is not.

R2. **Instants.** Every `start` and `end` must be timezone-aware. Compare them as instants.
The same instant can be written with different UTC offsets, for example during a daylight-saving change.
Such values are equal.

R3. **Empty bookings.** A booking with `start == end` is empty. It covers no time.
It is in no span, it is in no `sources` tuple, and it never connects two other bookings.
The error checks in R10 still apply to it.

R4. **Rooms.** Rooms are independent. Compare room names exactly as given: no trimming, no case folding.
Bookings in different rooms never merge.

R5. **Merging.** Work on each room's non-empty bookings in order of start.
The first booking starts a span. For each next booking, let `gap = booking.start - span_end`,
where `span_end` is the latest end in the span so far.
If `gap <= tolerance`, the booking joins the span. Otherwise it starts a new span.
So overlapping bookings (negative gap) and touching bookings (gap of zero) always merge.
A gap exactly equal to `tolerance` merges. A longer gap does not.

R6. **Span times.** A span's `start` equals the earliest start of its bookings.
Its `end` equals the latest end of its bookings. "Equals" means the same instant.
The UTC offset in which you return `start` and `end` is up to you.

R7. **Sources.** `sources` is a tuple of the 0-based positions, in the input list, of the bookings in the span.
The positions are in ascending order.

R8. **Order.** The result is sorted by room (Python string order), then by span start.

R9. **Titles.** A booking's title never changes the result.

R10. **Errors.** Raise `ValueError` if any booking ends before it starts, if any `start` or `end` is naive
(its `tzinfo` is `None` or its `utcoffset()` is `None`), or if `tolerance` is negative.
These checks apply to every booking, empty ones included.
The error message wording is up to you.

R11. **No side effects.** Do not modify the input list or the `Booking` objects in it.

R12. **Empty input.** An empty list returns `[]`. A negative tolerance still raises (R10).

The existing tests in `/app/tests` must keep passing without changes.

## Example

Input: the 8 bookings in `/app/data/sample_bookings.csv` (all at offset `+02:00`), with the default tolerance.

| room | start (+02:00) | end (+02:00) | sources |
|---|---|---|---|
| Atlas | 2026-10-21 09:00 | 2026-10-21 11:00 | (0, 1) |
| Atlas | 2026-10-21 13:00 | 2026-10-21 15:00 | (3, 6) |
| Borealis | 2026-10-21 09:15 | 2026-10-21 09:45 | (2,) |
| Borealis | 2026-10-21 11:00 | 2026-10-21 12:15 | (5,) |
| Cirrus | 2026-10-21 16:00 | 2026-10-21 17:30 | (7,) |

Booking 4 is empty, so it appears nowhere.

## Constraints

- Use only the Python standard library.
- No network access is available.
