"""Data types shared by the freebusy modules."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime


@dataclass
class Booking:
    """One reservation of a room.

    The booking covers the half-open interval [start, end): it includes the
    start instant and excludes the end instant.
    """

    room: str
    start: datetime
    end: datetime
    title: str = ""


@dataclass(frozen=True)
class BusySpan:
    """A stretch of time in which a room is busy without a break.

    ``sources`` holds the positions (0-based) of the input bookings that make
    up the span, in ascending order.
    """

    room: str
    start: datetime
    end: datetime
    sources: tuple[int, ...]
