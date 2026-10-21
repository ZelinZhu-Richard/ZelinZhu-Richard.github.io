import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from freebusy import load_bookings
from freebusy.csvio import parse_timestamp

SAMPLE = Path(__file__).resolve().parents[1] / "data" / "sample_bookings.csv"


class ParseTimestampTest(unittest.TestCase):
    def test_offset_is_kept(self):
        value = parse_timestamp("2026-10-21T09:00:00+02:00")
        self.assertEqual(value.utcoffset(), timedelta(hours=2))

    def test_z_means_utc(self):
        self.assertEqual(parse_timestamp("2026-10-21T07:00:00Z"), datetime(2026, 10, 21, 7, tzinfo=timezone.utc))

    def test_missing_offset_is_rejected(self):
        with self.assertRaises(ValueError):
            parse_timestamp("2026-10-21T09:00:00")


class LoadBookingsTest(unittest.TestCase):
    def test_sample_file_loads(self):
        bookings = load_bookings(SAMPLE)
        self.assertEqual(len(bookings), 8)
        self.assertEqual([b.room for b in bookings[:3]], ["Atlas", "Atlas", "Borealis"])
        self.assertEqual(bookings[0].title, "Standup and planning")

    def test_bad_row_names_the_line(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "bad.csv"
            path.write_text(
                "room,start,end,title\nAtlas,2026-10-21T09:00:00+02:00,soon,Standup\n", encoding="utf-8"
            )
            with self.assertRaisesRegex(ValueError, r"bad\.csv:2:"):
                load_bookings(path)


if __name__ == "__main__":
    unittest.main()
