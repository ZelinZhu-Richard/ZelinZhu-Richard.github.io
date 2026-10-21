"""Turn raw input lines into Event objects.

Two formats are accepted, one event per line:

JSON::

    {"metric": "http.requests", "kind": "counter", "value": 1,
     "ts": "2026-03-02T14:05:00Z", "tags": {"route": "/login"}, "id": "e-17"}

tally (statsd style)::

    http.requests:1|c|@0.5|#route:/login,status:200|T1772460300

Kind codes in tally lines: ``c`` counter, ``g`` gauge, ``ms`` timer.
``@rate`` is a client-side sample rate; counters are scaled up by 1/rate.
``T`` carries epoch seconds. Without a timestamp the event gets ``now()``.
"""

from __future__ import annotations

import json
import math
import re
import time
from collections.abc import Callable
from datetime import datetime, timezone

from .model import Event, Kind, SeriesKey, tag_key

METRIC_NAME = re.compile(r"[A-Za-z][A-Za-z0-9_.\-]{0,199}")
KIND_CODES = {"c": Kind.COUNTER, "g": Kind.GAUGE, "ms": Kind.TIMER}

Clock = Callable[[], float]


class ParseError(ValueError):
    """A line could not be turned into an Event."""


def parse_timestamp(raw: object) -> float:
    """Return epoch seconds (UTC) for an epoch number or an ISO 8601 string."""
    if isinstance(raw, bool):
        raise ParseError("timestamp must be a number or an ISO 8601 string")
    if isinstance(raw, (int, float)):
        ts = float(raw)
    elif isinstance(raw, str):
        text = raw.strip()
        if text.endswith("Z"):
            text = text[:-1]
        try:
            # Producers send milliseconds we do not need; keep whole seconds.
            dt = datetime.strptime(text[:19], "%Y-%m-%dT%H:%M:%S")
        except ValueError:
            raise ParseError(f"bad timestamp {raw!r}") from None
        ts = dt.replace(tzinfo=timezone.utc).timestamp()
    else:
        raise ParseError(f"bad timestamp {raw!r}")
    if not math.isfinite(ts) or ts < 0:
        raise ParseError(f"timestamp out of range: {raw!r}")
    return ts


def parse_line(line: str, now: Clock = time.time) -> Event:
    text = line.strip()
    if text.startswith("{"):
        return _parse_json(text, now)
    return _parse_tally(text, now)


def _number(raw: object, what: str) -> float:
    if isinstance(raw, bool):
        raise ParseError(f"{what} must be a number")
    try:
        value = float(raw)
    except (TypeError, ValueError):
        raise ParseError(f"{what} must be a number, got {raw!r}") from None
    if not math.isfinite(value):
        raise ParseError(f"{what} must be finite")
    return value


def _metric(raw: object) -> str:
    if not isinstance(raw, str) or not METRIC_NAME.fullmatch(raw):
        raise ParseError(f"bad metric name {raw!r}")
    return raw


def _scaled(kind: Kind, value: float, rate: float) -> float:
    if not 0 < rate <= 1:
        raise ParseError(f"sample rate must be in (0, 1], got {rate}")
    if kind is Kind.COUNTER:
        value = value / rate
    return value


def _parse_json(text: str, now: Clock) -> Event:
    try:
        obj = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ParseError(f"invalid JSON: {exc.msg}") from None
    if not isinstance(obj, dict):
        raise ParseError("expected a JSON object")
    try:
        kind = Kind(obj.get("kind", "counter"))
    except ValueError:
        raise ParseError(f"unknown kind {obj.get('kind')!r}") from None
    tags = obj.get("tags") or {}
    if not isinstance(tags, dict):
        raise ParseError("tags must be an object")
    value = _scaled(kind, _number(obj.get("value", 1), "value"),
                    _number(obj.get("rate", 1), "rate"))
    ts = parse_timestamp(obj["ts"]) if "ts" in obj else now()
    event_id = obj.get("id")
    return Event(SeriesKey(_metric(obj.get("metric")), kind, tag_key(tags)),
                 value, ts, None if event_id is None else str(event_id))


def _parse_tally(text: str, now: Clock) -> Event:
    head, *parts = text.split("|")
    name, sep, raw_value = head.partition(":")
    if not sep or not parts:
        raise ParseError("expected <metric>:<value>|<kind>")
    kind = KIND_CODES.get(parts[0])
    if kind is None:
        raise ParseError(f"unknown kind code {parts[0]!r}")
    rate, tags, ts = 1.0, {}, None
    for part in parts[1:]:
        if part.startswith("@"):
            rate = _number(part[1:], "rate")
        elif part.startswith("#"):
            tags = _parse_tags(part[1:])
        elif part.startswith("T"):
            ts = parse_timestamp(_number(part[1:], "timestamp"))
        else:
            raise ParseError(f"unknown field {part!r}")
    value = _scaled(kind, _number(raw_value, "value"), rate)
    return Event(SeriesKey(_metric(name), kind, tag_key(tags)),
                 value, now() if ts is None else ts)


def _parse_tags(text: str) -> dict[str, str]:
    tags = {}
    for item in filter(None, text.split(",")):
        key, sep, value = item.partition(":")
        if not sep or not key:
            raise ParseError(f"bad tag {item!r}, expected key:value")
        tags[key] = value
    return tags
