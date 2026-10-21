"""Merge room bookings into busy spans.

This module has no I/O. The CLI (``python3 -m freebusy``) and other callers
pass in bookings they loaded with :mod:`freebusy.csvio`.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Sequence

from .model import Booking, BusySpan


def merge_busy(bookings: Sequence[Booking], *, tolerance: timedelta = timedelta(0)) -> list[BusySpan]:
    """Return the busy spans of every room, sorted by room and then by start."""
    if tolerance < timedelta(0):
        raise ValueError(f"tolerance must not be negative, got {tolerance}")

    by_room: dict[str, list[tuple[datetime, datetime, int]]] = {}
    for index, booking in enumerate(bookings):
        start, end = _utc(index, "start", booking.start), _utc(index, "end", booking.end)
        if end < start:
            raise ValueError(
                f"booking {index} ends before it starts ({booking.end.isoformat()} < {booking.start.isoformat()})"
            )
        if end == start:
            continue  # an empty booking covers no time
        by_room.setdefault(booking.room, []).append((start, end, index))

    spans: list[BusySpan] = []
    for room in sorted(by_room):
        items = sorted(by_room[room], key=lambda item: item[0])
        start, end, sources = items[0][0], items[0][1], [items[0][2]]
        for item_start, item_end, index in items[1:]:
            if item_start - end <= tolerance:
                end = max(end, item_end)
                sources.append(index)
            else:
                spans.append(_span(bookings, room, start, end, sources))
                start, end, sources = item_start, item_end, [index]
        spans.append(_span(bookings, room, start, end, sources))
    return spans


def _utc(index: int, name: str, value: datetime) -> datetime:
    """Check that value is timezone-aware, then return it in UTC.

    Every comparison uses UTC values. Two datetimes that share one tzinfo
    object (all ZoneInfo values for one zone do) compare by wall-clock time
    and ignore ``fold``. That is wrong during a daylight-saving change.
    """
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError(f"booking {index}: {name} must be timezone-aware, got {value!r}")
    return value.astimezone(timezone.utc)


def _span(bookings: Sequence[Booking], room: str, start: datetime, end: datetime, sources: list[int]) -> BusySpan:
    """Report the span in the timezone of its earliest booking."""
    zone = bookings[sources[0]].start.tzinfo
    return BusySpan(room, start.astimezone(zone), end.astimezone(zone), tuple(sorted(sources)))
