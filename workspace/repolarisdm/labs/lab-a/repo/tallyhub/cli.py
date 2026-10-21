"""Command line: ``tallyhub ingest``, ``tallyhub query`` and ``tallyhub metrics``."""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Iterator
from dataclasses import replace

from . import __version__
from .api import TallyService
from .config import load_config
from .ingest import IngestError
from .parsing import parse_timestamp
from .storage import open_store
from .windows import parse_duration

VALUE_COLUMNS = ("value", "count", "mean", "min", "max")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="tallyhub", description="Event tallies in time windows.")
    parser.add_argument("--version", action="version", version=f"tallyhub {__version__}")
    parser.add_argument("--config", metavar="PATH", help="TOML file with a [tallyhub] table")
    parser.add_argument("--store", metavar="URL", help="overrides store_url (memory:// or sqlite:///PATH)")
    sub = parser.add_subparsers(dest="command", required=True)

    ingest = sub.add_parser("ingest", help="read events from files or stdin")
    ingest.add_argument("files", nargs="*", metavar="FILE", help="input files; none or '-' reads stdin")
    ingest.add_argument("--strict", action="store_true", help="stop at the first bad line")

    query = sub.add_parser("query", help="print one metric per time window")
    query.add_argument("metric")
    query.add_argument("--window", type=parse_duration, default="1h", help="e.g. 5m, 1h, 1d (default 1h)")
    query.add_argument("--start", help="epoch seconds or ISO 8601; first bucket to include")
    query.add_argument("--end", help="epoch seconds or ISO 8601; exclusive")
    query.add_argument("--tag", action="append", default=[], metavar="KEY=VALUE",
                       help="only series with this tag; repeat to require several")
    query.add_argument("--format", choices=("table", "json"), default="table")

    sub.add_parser("metrics", help="list every metric and its kind")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        config = load_config(args.config)
        if args.store:
            config = replace(config, store_url=args.store)
        if getattr(args, "strict", False):
            config = replace(config, strict=True)
        with open_store(config.store_url) as store:
            return COMMANDS[args.command](TallyService(store, config), args)
    except (ValueError, OSError, IngestError) as exc:
        print(f"tallyhub: error: {exc}", file=sys.stderr)
        return 2


def _ingest(service: TallyService, args: argparse.Namespace) -> int:
    report = service.ingest(_read_lines(args.files))
    print(f"accepted {report['accepted']}, rejected {report['rejected']}, "
          f"duplicates {report['duplicates']}, bucket writes {report['bucket_writes']}")
    for error in report["errors"]:
        print(f"  {error}", file=sys.stderr)
    return 1 if report["rejected"] else 0


def _read_lines(files: list[str]) -> Iterator[str]:
    """Lines of every input in order. Line numbers in errors count across inputs."""
    for name in files or ["-"]:
        if name == "-":
            yield from sys.stdin
        else:
            with open(name, encoding="utf-8") as fh:
                yield from fh


def _query(service: TallyService, args: argparse.Namespace) -> int:
    tags = dict(_split_tag(t) for t in args.tag)
    rows = service.query(args.metric, args.window, start=_time_arg(args.start),
                         end=_time_arg(args.end), tags=tags)
    if args.format == "json":
        for row in rows:
            print(json.dumps(row, sort_keys=True))
    else:
        print(_table(rows))
    return 0


def _metrics(service: TallyService, args: argparse.Namespace) -> int:
    for row in service.metrics():
        print(f"{row['metric']}\t{row['kind']}")
    return 0


COMMANDS = {"ingest": _ingest, "query": _query, "metrics": _metrics}


def _split_tag(text: str) -> tuple[str, str]:
    key, sep, value = text.partition("=")
    if not sep or not key:
        raise ValueError(f"bad --tag {text!r}, expected KEY=VALUE")
    return key, value


def _time_arg(text: str | None) -> float | None:
    if text is None:
        return None
    try:
        return float(text)
    except ValueError:
        return parse_timestamp(text)


def _table(rows: list[dict[str, object]]) -> str:
    if not rows:
        return "(no data)"
    columns = [c for c in VALUE_COLUMNS if any(c in row for row in rows)]
    header = ["window", "series", *columns]
    body = [[str(row["window"]), str(row["series"]), *(_cell(row.get(c)) for c in columns)]
            for row in rows]
    widths = [max(len(cell) for cell in col) for col in zip(header, *body)]
    return "\n".join("  ".join(cell.ljust(w) for cell, w in zip(line, widths)).rstrip()
                     for line in (header, *body))


def _cell(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)
