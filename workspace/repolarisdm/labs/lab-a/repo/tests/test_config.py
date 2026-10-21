from pathlib import Path

import pytest

from tallyhub.config import Config, load_config

EXAMPLE = Path(__file__).resolve().parent.parent / "tallyhub.example.toml"


def test_defaults():
    cfg = load_config(env={})
    assert cfg == Config()
    assert cfg.resolution_seconds == 60


def test_example_config_matches_the_defaults():
    assert load_config(EXAMPLE, env={}) == Config()


def test_file_then_env_override(tmp_path):
    path = tmp_path / "tallyhub.toml"
    path.write_text('[tallyhub]\nstore_url = "memory://"\nbatch_size = 50\n')
    cfg = load_config(path, env={"TALLYHUB_BATCH_SIZE": "7", "TALLYHUB_STRICT": "yes"})
    assert (cfg.store_url, cfg.batch_size, cfg.strict) == ("memory://", 7, True)


def test_unknown_keys_are_rejected(tmp_path):
    path = tmp_path / "tallyhub.toml"
    path.write_text("[tallyhub]\nresolution = 30\n")
    with pytest.raises(ValueError, match="unknown config keys: resolution"):
        load_config(path, env={})


@pytest.mark.parametrize("env", [
    {"TALLYHUB_RESOLUTION_SECONDS": "0"},
    {"TALLYHUB_BATCH_SIZE": "ten"},
    {"TALLYHUB_DEDUP_CACHE_SIZE": "-1"},
])
def test_bad_values_are_rejected(env):
    with pytest.raises(ValueError):
        load_config(env=env)


def test_wrong_types_in_file_are_rejected(tmp_path):
    path = tmp_path / "tallyhub.toml"
    path.write_text('[tallyhub]\nbatch_size = "50"\n')
    with pytest.raises(ValueError, match="batch_size must be int"):
        load_config(path, env={})
