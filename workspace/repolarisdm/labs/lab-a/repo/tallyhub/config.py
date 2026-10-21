"""Configuration.

Values come from three layers, later layers win:

1. the defaults on ``Config``;
2. an optional TOML file with a ``[tallyhub]`` table;
3. ``TALLYHUB_<FIELD>`` environment variables, e.g. ``TALLYHUB_STORE_URL``.
"""

from __future__ import annotations

import os
import tomllib
from collections.abc import Mapping
from dataclasses import dataclass, fields, replace

ENV_PREFIX = "TALLYHUB_"


@dataclass(frozen=True)
class Config:
    store_url: str = "sqlite:///tallyhub.db"
    resolution_seconds: int = 60
    max_line_bytes: int = 8192
    dedup_cache_size: int = 10_000
    batch_size: int = 500
    strict: bool = False

    def __post_init__(self) -> None:
        for f in fields(self):
            value = getattr(self, f.name)
            expected = type(getattr(Config, f.name))
            if expected is int and isinstance(value, bool) or not isinstance(value, expected):
                raise ValueError(f"{f.name} must be {expected.__name__}, got {value!r}")
        for name in ("resolution_seconds", "max_line_bytes", "batch_size"):
            if getattr(self, name) <= 0:
                raise ValueError(f"{name} must be positive")
        if self.dedup_cache_size < 0:
            raise ValueError("dedup_cache_size must be >= 0 (0 turns dedup off)")


def _coerce(raw: str, current: object) -> object:
    if isinstance(current, bool):
        return raw.strip().lower() in {"1", "true", "yes", "on"}
    if isinstance(current, int):
        try:
            return int(raw)
        except ValueError:
            raise ValueError(f"expected an integer, got {raw!r}") from None
    return raw


def load_config(path: str | os.PathLike[str] | None = None,
                env: Mapping[str, str] | None = None) -> Config:
    """Build a Config from defaults, an optional TOML file and the environment."""
    env = os.environ if env is None else env
    cfg = Config()
    if path is not None:
        with open(path, "rb") as fh:
            section = tomllib.load(fh).get("tallyhub", {})
        unknown = set(section) - {f.name for f in fields(Config)}
        if unknown:
            raise ValueError(f"unknown config keys: {', '.join(sorted(unknown))}")
        cfg = replace(cfg, **section)
    overrides = {}
    for f in fields(Config):
        key = ENV_PREFIX + f.name.upper()
        if key in env:
            overrides[f.name] = _coerce(env[key], getattr(cfg, f.name))
    return replace(cfg, **overrides) if overrides else cfg
