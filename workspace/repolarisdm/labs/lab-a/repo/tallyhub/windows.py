"""Time windows.

Everything here works on epoch seconds, which are UTC by definition.
Windows are half-open, ``[start, start + width)``, and aligned to the epoch,
so a ``1d`` window always starts at 00:00:00 UTC.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone

_DURATION = re.compile(r"(\d+)([smhd])")
_UNIT_SECONDS = {"s": 1, "m": 60, "h": 3600, "d": 86400}


def parse_duration(text: str) -> int:
    """'90s' -> 90, '5m' -> 300, '1h' -> 3600, '1d' -> 86400."""
    match = _DURATION.fullmatch(text.strip())
    if not match or int(match.group(1)) == 0:
        raise ValueError(f"bad duration {text!r}, expected e.g. 30s, 5m, 1h, 1d")
    return int(match.group(1)) * _UNIT_SECONDS[match.group(2)]


def bucket_start(ts: float, width: int) -> int:
    """Start of the width-second window that contains ts."""
    if width <= 0:
        raise ValueError("width must be positive")
    return int(ts // width) * width


def format_ts(ts: float) -> str:
    """Epoch seconds -> '2026-03-02T14:00:00Z'."""
    return datetime.fromtimestamp(ts, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
