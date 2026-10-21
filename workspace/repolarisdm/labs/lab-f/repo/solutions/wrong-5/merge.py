"""Merge room bookings into busy spans."""
from __future__ import annotations

from datetime import timedelta, timezone
from typing import Sequence

from .model import Booking, BusySpan

# Cancelled holds stay in the calendar export but do not block the room.
_PLACEHOLDER_PREFIXES = ("hold", "cancelled", "canceled")
_UTC = timezone.utc


def merge_busy(bookings: Sequence[Booking], *, tolerance: timedelta = timedelta(0)) -> list[BusySpan]:
    """Return the busy spans of every room, sorted by room and then by start."""
    if tolerance < timedelta(0):
        raise ValueError("tolerance must not be negative")

    candidates = []
    for index, booking in enumerate(bookings):
        start, end = _check(index, booking)
        if _is_placeholder(booking):
            continue
        candidates.append((booking.room, start, end, index))
    candidates.sort(key=lambda item: (item[0], item[1]))

    merged: list[list] = []  # [room, start, end, sources], times in UTC
    for room, start, end, index in candidates:
        previous = merged[-1] if merged else None
        if previous is not None and previous[0] == room and start - previous[2] <= tolerance:
            previous[2] = max(previous[2], end)
            previous[3].append(index)
        else:
            merged.append([room, start, end, [index]])
    # Report each span in the timezone of its first booking.
    return [BusySpan(room, start.astimezone(bookings[sources[0]].start.tzinfo),
                     end.astimezone(bookings[sources[0]].start.tzinfo), tuple(sorted(sources)))
            for room, start, end, sources in merged]


def _is_placeholder(booking: Booking) -> bool:
    return booking.title.strip().lower().startswith(_PLACEHOLDER_PREFIXES)


def _check(index: int, booking: Booking):
    if booking.start.utcoffset() is None or booking.end.utcoffset() is None:
        raise ValueError(f"booking {index}: datetimes must be timezone-aware")
    start, end = booking.start.astimezone(_UTC), booking.end.astimezone(_UTC)
    if end < start:
        raise ValueError(f"booking {index} ends before it starts")
    return start, end
