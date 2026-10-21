"""Merge room bookings into busy spans.

This module has no I/O. The CLI (``python3 -m freebusy``) and other callers
pass in bookings they loaded with :mod:`freebusy.csvio`.
"""
from __future__ import annotations

from datetime import timedelta
from typing import Sequence

from .model import Booking, BusySpan


def merge_busy(bookings: Sequence[Booking], *, tolerance: timedelta = timedelta(0)) -> list[BusySpan]:
    """Return the busy spans of every room, sorted by room and then by start."""
    raise NotImplementedError("merge_busy is not implemented yet")
