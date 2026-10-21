"""Merge room bookings into busy spans."""
from __future__ import annotations

from datetime import timedelta, timezone
from typing import Sequence

from .model import Booking, BusySpan


def merge_busy(bookings: Sequence[Booking], *, tolerance: timedelta = timedelta(0)) -> list[BusySpan]:
    """Return the busy spans of every room, sorted by room and then by start."""
    if tolerance < timedelta(0):
        raise ValueError("tolerance must not be negative")
    for i, b in enumerate(bookings):
        if b.start.utcoffset() is None or b.end.utcoffset() is None:
            raise ValueError(f"booking {i} uses a naive datetime")
    # Compare UTC copies, so mixed offsets and DST changes cannot confuse the order.
    utc = [(b.start.astimezone(timezone.utc), b.end.astimezone(timezone.utc)) for b in bookings]
    for i, (start, end) in enumerate(utc):
        if end < start:
            raise ValueError(f"booking {i} ends before it starts")

    order = sorted(
        (i for i, (start, end) in enumerate(utc) if end > start),
        key=lambda i: (bookings[i].room, utc[i][0]),
    )

    spans: list[BusySpan] = []
    room = first = last = None
    members: list[int] = []
    for i in order:
        b = bookings[i]
        if b.room == room and utc[i][0] < utc[last][1] + tolerance:
            if utc[i][1] > utc[last][1]:
                last = i
            members.append(i)
            continue
        if members:
            spans.append(BusySpan(room, bookings[first].start, bookings[last].end, tuple(sorted(members))))
        room, first, last, members = b.room, i, i, [i]
    if members:
        spans.append(BusySpan(room, bookings[first].start, bookings[last].end, tuple(sorted(members))))
    return spans
