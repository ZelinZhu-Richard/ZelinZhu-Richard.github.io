"""Small helpers shared by the tests."""

import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
EXAMPLE_ORDER = REPO / "examples" / "order.csv"


class TempFiles:
    """Write throwaway CSV files into a temporary directory."""

    def __init__(self):
        self._dir = tempfile.TemporaryDirectory()
        self.path = Path(self._dir.name)

    def write(self, name, text):
        target = self.path / name
        target.write_text(text, encoding="utf-8")
        return target

    def cleanup(self):
        self._dir.cleanup()
