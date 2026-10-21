"""Merge room bookings into busy spans."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone, tzinfo
from typing import Optional, Sequence

from .model import Booking, BusySpan


@dataclass
class _OpenSpan:
    room: str
    start: datetime  # UTC
    end: datetime  # UTC
    zone: Optional[tzinfo]  # the first booking's timezone, used for the result
    members: list = field(default_factory=list)

    def close(self) -> BusySpan:
        return BusySpan(self.room, self.start.astimezone(self.zone), self.end.astimezone(self.zone),
                        tuple(sorted(self.members)))


def merge_busy(bookings: Sequence[Booking], *, tolerance: timedelta = timedelta(0)) -> list[BusySpan]:
    """Return the busy spans of every room, sorted by room and then by start."""
    if tolerance < timedelta(0):
        raise ValueError(f"tolerance {tolerance} is negative")
    times = _validate(bookings)

    rooms: dict[str, list[int]] = {}
    for index, booking in enumerate(bookings):
        if times[index][0] != times[index][1]:
            rooms.setdefault(booking.room, []).append(index)

    result: list[BusySpan] = []
    for room in sorted(rooms):
        current = None
        for index in sorted(rooms[room], key=lambda i: times[i][0]):
            start, end = times[index]
            if current is not None and start - current.end <= tolerance:
                current.end = end
                current.members.append(index)
            else:
                if current is not None:
                    result.append(current.close())
                current = _OpenSpan(room, start, end, bookings[index].start.tzinfo, [index])
        result.append(current.close())
    return result


def _validate(bookings: Sequence[Booking]) -> list[tuple[datetime, datetime]]:
    """Check every booking and return its (start, end) in UTC."""
    times = []
    for index, booking in enumerate(bookings):
        for value in (booking.start, booking.end):
            if value.tzinfo is None or value.utcoffset() is None:
                raise ValueError(f"booking {index}: naive datetime {value!r}")
        start, end = booking.start.astimezone(timezone.utc), booking.end.astimezone(timezone.utc)
        if end < start:
            raise ValueError(f"booking {index} ends before it starts")
        times.append((start, end))
    return times
