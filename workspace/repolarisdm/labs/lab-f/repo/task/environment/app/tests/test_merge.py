import unittest
from datetime import datetime, timezone

from freebusy import Booking, BusySpan, merge_busy

UTC = timezone.utc


def at(hour, minute=0):
    return datetime(2026, 10, 21, hour, minute, tzinfo=UTC)


class MergeBusyTest(unittest.TestCase):
    def test_overlapping_bookings_merge(self):
        spans = merge_busy([Booking("Atlas", at(9), at(10)), Booking("Atlas", at(9, 30), at(11))])
        self.assertEqual(spans, [BusySpan("Atlas", at(9), at(11), (0, 1))])

    def test_touching_bookings_merge(self):
        spans = merge_busy([Booking("Atlas", at(9), at(10)), Booking("Atlas", at(10), at(11))])
        self.assertEqual(spans, [BusySpan("Atlas", at(9), at(11), (0, 1))])

    def test_rooms_are_merged_separately(self):
        spans = merge_busy([Booking("Borealis", at(9), at(10)), Booking("Atlas", at(9, 30), at(10, 30))])
        self.assertEqual(
            spans,
            [BusySpan("Atlas", at(9, 30), at(10, 30), (1,)), BusySpan("Borealis", at(9), at(10), (0,))],
        )

    def test_end_before_start_is_rejected(self):
        with self.assertRaises(ValueError):
            merge_busy([Booking("Atlas", at(10), at(9))])


if __name__ == "__main__":
    unittest.main()
