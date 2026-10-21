"""Bucket stores. ``open_store`` picks a backend from a URL."""

from .base import Store
from .memory import MemoryStore
from .sqlite import SqliteStore

__all__ = ["MemoryStore", "SqliteStore", "Store", "open_store"]


def open_store(url: str) -> Store:
    """'memory://' -> MemoryStore. 'sqlite:///rel.db' or 'sqlite:////abs.db' -> SqliteStore."""
    if url == "memory://":
        return MemoryStore()
    if url.startswith("sqlite:///"):
        return SqliteStore(url[len("sqlite:///"):])
    raise ValueError(f"unsupported store URL {url!r}; use memory:// or sqlite:///PATH")
