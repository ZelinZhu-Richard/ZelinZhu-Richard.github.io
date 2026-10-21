"""Merge room bookings into busy spans by grouping linked bookings.

Two bookings in the same room are linked when the free time between them is
at most the tolerance. A busy span is a connected group of linked bookings.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from itertools import combinations
from typing import Sequence

from .model import Booking, BusySpan


def merge_busy(bookings: Sequence[Booking], *, tolerance: timedelta = timedelta(0)) -> list[BusySpan]:
    """Return the busy spans of every room, sorted by room and then by start."""
    if tolerance < timedelta(0):
        raise ValueError("negative tolerance: %s" % tolerance)

    starts, ends, live = {}, {}, []
    for index, booking in enumerate(bookings):
        if not (_is_aware(booking.start) and _is_aware(booking.end)):
            raise ValueError("booking #%d has a naive datetime" % index)
        # Compare in UTC: values that share one tzinfo object compare by wall clock.
        starts[index], ends[index] = booking.start.astimezone(timezone.utc), booking.end.astimezone(timezone.utc)
        if ends[index] < starts[index]:
            raise ValueError("booking #%d is invalid: end < start" % index)
        if ends[index] > starts[index]:
            live.append(index)

    parent = {index: index for index in live}

    def find(index: int) -> int:
        while parent[index] != index:
            parent[index] = parent[parent[index]]
            index = parent[index]
        return index

    for a, b in combinations(live, 2):
        if bookings[a].room != bookings[b].room:
            continue
        if starts[b] - ends[a] <= tolerance and starts[a] - ends[b] <= tolerance:
            parent[find(a)] = find(b)

    groups: dict[int, list[int]] = {}
    for index in live:
        groups.setdefault(find(index), []).append(index)

    spans = []
    for members in groups.values():
        members.sort()
        first = min(members, key=lambda i: starts[i])
        last = max(members, key=lambda i: ends[i])
        spans.append(BusySpan(room=bookings[first].room, start=bookings[first].start,
                              end=bookings[last].end, sources=tuple(members)))
    spans.sort(key=lambda span: (span.room, span.start.astimezone(timezone.utc)))
    return spans


def _is_aware(value: datetime) -> bool:
    return value.tzinfo is not None and value.utcoffset() is not None
