"""Read bookings from CSV exports of the room calendar."""
from __future__ import annotations

import csv
from datetime import datetime
from pathlib import Path
from typing import Union

from .model import Booking

REQUIRED_COLUMNS = ("room", "start", "end")


def parse_timestamp(text: str) -> datetime:
    """Parse an ISO 8601 timestamp that carries a UTC offset.

    A trailing "Z" means UTC. A timestamp without an offset is rejected,
    because a wall-clock time alone does not name an instant.
    """
    text = text.strip()
    if text.endswith(("Z", "z")):
        text = text[:-1] + "+00:00"
    value = datetime.fromisoformat(text)
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError(f"timestamp has no UTC offset: {text!r}")
    return value


def load_bookings(path: Union[str, Path]) -> list[Booking]:
    """Load bookings from a CSV file with the columns room,start,end[,title]."""
    bookings = []
    with open(path, newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        missing = [name for name in REQUIRED_COLUMNS if name not in (reader.fieldnames or [])]
        if missing:
            raise ValueError(f"{path}: missing columns: {', '.join(missing)}")
        for row in reader:
            try:
                booking = Booking(
                    room=row["room"].strip(),
                    start=parse_timestamp(row["start"]),
                    end=parse_timestamp(row["end"]),
                    title=(row.get("title") or "").strip(),
                )
            except ValueError as error:
                raise ValueError(f"{path}:{reader.line_num}: {error}") from None
            bookings.append(booking)
    return bookings
