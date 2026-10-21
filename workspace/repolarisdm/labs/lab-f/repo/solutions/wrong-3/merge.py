"""Merge room bookings into busy spans."""
from __future__ import annotations

from datetime import timedelta, timezone
from typing import Sequence

from .model import Booking, BusySpan

UTC = timezone.utc


def merge_busy(bookings: Sequence[Booking], *, tolerance: timedelta = timedelta(0)) -> list[BusySpan]:
    """Return the busy spans of every room, sorted by room and then by start."""
    if tolerance < timedelta(0):
        raise ValueError("tolerance must be >= 0")

    entries = []
    for index, booking in enumerate(bookings):
        if booking.start.tzinfo is None or booking.end.tzinfo is None:
            raise ValueError(f"booking {index} has no timezone")
        if booking.start.utcoffset() is None or booking.end.utcoffset() is None:
            raise ValueError(f"booking {index} has no UTC offset")
        if booking.end.astimezone(UTC) < booking.start.astimezone(UTC):
            raise ValueError(f"booking {index} ends before it starts")
        if booking.end.astimezone(UTC) == booking.start.astimezone(UTC):
            continue
        entries.append((booking.room, booking.start.isoformat(), index))
    entries.sort()

    spans: list[BusySpan] = []
    for room, _, index in entries:
        booking = bookings[index]
        if spans and spans[-1].room == room and booking.start.astimezone(UTC) - spans[-1].end.astimezone(UTC) <= tolerance:
            last = spans[-1]
            end = max(last.end, booking.end, key=lambda value: value.astimezone(UTC))
            spans[-1] = BusySpan(room, last.start, end, tuple(sorted(last.sources + (index,))))
        else:
            spans.append(BusySpan(room, booking.start, booking.end, (index,)))
    return spans
