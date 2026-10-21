"""Task checks for merge_busy."""
import os
import sys
import unittest
from datetime import datetime, timezone

APP_DIR = os.environ.get("APP_DIR", "/app")
sys.path.insert(0, APP_DIR)

from freebusy import Booking, load_bookings, merge_busy  # noqa: E402

SAMPLE = os.path.join(APP_DIR, "data", "sample_bookings.csv")
UTC = timezone.utc


class MergeBusyOutputTest(unittest.TestCase):
    def test_sample_file_matches_the_example(self):
        spans = merge_busy(load_bookings(SAMPLE))
        got = [(s.room, s.start.isoformat(), s.end.isoformat(), s.sources) for s in spans]
        self.assertEqual(
            got,
            [
                ("Atlas", "2026-10-21T09:00:00+02:00", "2026-10-21T11:00:00+02:00", (0, 1)),
                ("Atlas", "2026-10-21T13:00:00+02:00", "2026-10-21T15:00:00+02:00", (3, 6)),
                ("Borealis", "2026-10-21T09:15:00+02:00", "2026-10-21T09:45:00+02:00", (2,)),
                ("Borealis", "2026-10-21T11:00:00+02:00", "2026-10-21T12:15:00+02:00", (5,)),
                ("Cirrus", "2026-10-21T16:00:00+02:00", "2026-10-21T17:30:00+02:00", (7,)),
            ],
        )

    def test_far_apart_bookings_stay_separate(self):
        first = Booking("Atlas", datetime(2026, 10, 21, 8, tzinfo=UTC), datetime(2026, 10, 21, 9, tzinfo=UTC))
        second = Booking("Atlas", datetime(2026, 10, 21, 15, tzinfo=UTC), datetime(2026, 10, 21, 16, tzinfo=UTC))
        spans = merge_busy([first, second])
        self.assertEqual([s.sources for s in spans], [(0,), (1,)])

    def test_end_before_start_is_rejected(self):
        bad = Booking("Atlas", datetime(2026, 10, 21, 10, tzinfo=UTC), datetime(2026, 10, 21, 9, tzinfo=UTC))
        with self.assertRaisesRegex(ValueError, "ends before it starts"):
            merge_busy([bad])


if __name__ == "__main__":
    unittest.main()
