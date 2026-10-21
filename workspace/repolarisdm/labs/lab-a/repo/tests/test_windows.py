import pytest

from tallyhub.windows import bucket_start, format_ts, parse_duration

T0 = 1772460000  # 2026-03-02T14:00:00Z


@pytest.mark.parametrize("text, seconds", [("90s", 90), ("5m", 300), ("1h", 3600), ("2d", 172800)])
def test_parse_duration(text, seconds):
    assert parse_duration(text) == seconds


@pytest.mark.parametrize("text", ["", "0m", "5", "m", "1w", "-1h", "1.5h"])
def test_parse_duration_rejects(text):
    with pytest.raises(ValueError):
        parse_duration(text)


def test_bucket_start_is_half_open():
    assert bucket_start(T0, 3600) == T0
    assert bucket_start(T0 + 3599.9, 3600) == T0
    assert bucket_start(T0 + 3600, 3600) == T0 + 3600


def test_daily_buckets_start_at_utc_midnight():
    assert format_ts(bucket_start(T0, 86400)) == "2026-03-02T00:00:00Z"


def test_bucket_start_rejects_zero_width():
    with pytest.raises(ValueError):
        bucket_start(T0, 0)
