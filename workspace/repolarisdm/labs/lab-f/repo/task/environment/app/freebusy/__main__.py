"""Print the busy spans of every room in a bookings CSV file."""
from __future__ import annotations

import argparse
import sys
from datetime import timedelta

from .csvio import load_bookings
from .merge import merge_busy


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(prog="python3 -m freebusy", description=__doc__)
    parser.add_argument("csv_file", help="bookings CSV with the columns room,start,end,title")
    parser.add_argument(
        "--tolerance",
        type=int,
        default=0,
        metavar="MINUTES",
        help="count free gaps of at most this many minutes as busy (default: 0)",
    )
    args = parser.parse_args(argv)
    try:
        spans = merge_busy(load_bookings(args.csv_file), tolerance=timedelta(minutes=args.tolerance))
    except (OSError, ValueError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    for span in spans:
        print(f"{span.room}\t{span.start.isoformat()}\t{span.end.isoformat()}\t{len(span.sources)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
