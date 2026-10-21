import pytest

from tallyhub.api import TallyService
from tallyhub.config import Config
from tallyhub.storage import MemoryStore, SqliteStore

T0 = 1772460000  # 2026-03-02T14:00:00Z


@pytest.fixture
def config():
    return Config(store_url="memory://")


@pytest.fixture
def clock():
    return lambda: float(T0 + 300)


@pytest.fixture(params=["memory", "sqlite"])
def store(request, tmp_path):
    s = MemoryStore() if request.param == "memory" else SqliteStore(str(tmp_path / "t.db"))
    yield s
    s.close()


@pytest.fixture
def service(store, config, clock):
    return TallyService(store, config, now=clock)
