"""Merge room bookings into busy spans."""
from __future__ import annotations

from datetime import timedelta, timezone
from typing import Sequence

from .model import Booking, BusySpan


def merge_busy(bookings: Sequence[Booking], *, tolerance: timedelta = timedelta(0)) -> list[BusySpan]:
    """Return the busy spans of every room, sorted by room and then by start.

    Times are normalized to UTC for the comparisons and converted back to the
    caller's timezone (the first booking's) for display.
    """
    if tolerance < timedelta(0):
        raise ValueError("tolerance must not be negative")
    if not bookings:
        return []
    display_tz = bookings[0].start.tzinfo

    for index, booking in enumerate(bookings):
        if booking.start.utcoffset() is None or booking.end.utcoffset() is None:
            raise ValueError(f"booking {index} must use timezone-aware datetimes")
        booking.start = booking.start.astimezone(timezone.utc)
        booking.end = booking.end.astimezone(timezone.utc)
        if booking.end < booking.start:
            raise ValueError(f"booking {index} ends before it starts")

    by_room: dict[str, list[int]] = {}
    for index, booking in enumerate(bookings):
        if booking.end > booking.start:
            by_room.setdefault(booking.room, []).append(index)

    spans: list[BusySpan] = []
    for room in sorted(by_room):
        indexes = sorted(by_room[room], key=lambda i: bookings[i].start)
        start, end, members = bookings[indexes[0]].start, bookings[indexes[0]].end, [indexes[0]]
        for index in indexes[1:]:
            booking = bookings[index]
            if booking.start - end <= tolerance:
                end = max(end, booking.end)
                members.append(index)
            else:
                spans.append(BusySpan(room, start.astimezone(display_tz), end.astimezone(display_tz), tuple(sorted(members))))
                start, end, members = booking.start, booking.end, [index]
        spans.append(BusySpan(room, start.astimezone(display_tz), end.astimezone(display_tz), tuple(sorted(members))))
    return spans
