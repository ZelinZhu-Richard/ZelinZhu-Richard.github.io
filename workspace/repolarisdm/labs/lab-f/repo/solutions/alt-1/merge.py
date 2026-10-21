"""Merge room bookings into busy spans with a sweep over open/close events."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Sequence

from .model import Booking, BusySpan

OPEN, CLOSE = 0, 1  # at the same instant, opens sort before closes
EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)
MICROSECOND = timedelta(microseconds=1)


def merge_busy(bookings: Sequence[Booking], *, tolerance: timedelta = timedelta(0)) -> list[BusySpan]:
    """Return the busy spans of every room, sorted by room and then by start.

    Each booking opens at its start and closes at end + tolerance. A span ends
    when no booking is open. Event times are integer microseconds since the
    epoch, so end + tolerance never overflows. Times are returned in UTC.
    """
    if tolerance < timedelta(0):
        raise ValueError("tolerance must be zero or positive")
    slack = tolerance // MICROSECOND

    events: dict[str, list[tuple[int, int, int, datetime, datetime]]] = {}
    for index, booking in enumerate(bookings):
        start = _utc(booking.start, index)
        end = _utc(booking.end, index)
        if end < start:
            raise ValueError(f"booking {index} ends before it starts")
        if end == start:
            continue
        room_events = events.setdefault(booking.room, [])
        room_events.append((_micros(start), OPEN, index, start, end))
        room_events.append((_micros(end) + slack, CLOSE, index, start, end))

    spans: list[BusySpan] = []
    for room in sorted(events):
        depth = 0
        span_start = span_end = None
        members: list[int] = []
        for _, kind, index, start, end in sorted(events[room]):
            if kind == OPEN:
                if depth == 0:
                    span_start, span_end, members = start, end, []
                depth += 1
                members.append(index)
                span_end = max(span_end, end)
            else:
                depth -= 1
                if depth == 0:
                    spans.append(BusySpan(room, span_start, span_end, tuple(sorted(members))))
    return spans


def _micros(value: datetime) -> int:
    return (value - EPOCH) // MICROSECOND


def _utc(value: datetime, index: int) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError(f"booking {index} has a naive datetime: {value!r}")
    return value.astimezone(timezone.utc)
