import pytest

from tallyhub.model import Kind
from tallyhub.parsing import ParseError, parse_line, parse_timestamp

T0 = 1772460000  # 2026-03-02T14:00:00Z


def now():
    return 1234.0


def test_json_line():
    e = parse_line('{"metric": "http.requests", "kind": "counter", "value": 2, '
                   '"ts": "2026-03-02T14:05:00Z", "tags": {"route": "/login"}, "id": 17}', now)
    assert e.series.metric == "http.requests"
    assert e.series.kind is Kind.COUNTER
    assert e.series.tags == (("route", "/login"),)
    assert (e.value, e.ts, e.event_id) == (2.0, T0 + 300, "17")


def test_json_defaults_to_counter_of_one_at_now():
    e = parse_line('{"metric": "jobs.done"}', now)
    assert (e.series.kind, e.value, e.ts, e.event_id) == (Kind.COUNTER, 1.0, 1234.0, None)


def test_tally_line_with_rate_tags_and_timestamp():
    e = parse_line(f"http.requests:3|c|@0.5|#route:/login,status:200|T{T0}", now)
    assert e.value == 6.0
    assert e.ts == T0
    assert e.series.tags == (("route", "/login"), ("status", "200"))


def test_tally_tag_values_may_contain_colons():
    e = parse_line("cache.hits:1|c|#url:https://example.test/a", now)
    assert dict(e.series.tags) == {"url": "https://example.test/a"}


def test_sample_rate_only_scales_counters():
    assert parse_line("db.query:40|ms|@0.25", now).value == 40.0
    assert parse_line("queue.depth:7|g|@0.5", now).value == 7.0
    assert parse_line('{"metric": "a", "value": 1, "rate": 0.1}', now).value == pytest.approx(10.0)


def test_tag_order_does_not_change_the_series():
    a = parse_line("x:1|c|#b:2,a:1", now)
    b = parse_line('{"metric": "x", "tags": {"a": "1", "b": "2"}}', now)
    assert a.series == b.series


@pytest.mark.parametrize("line", [
    "no-value|c",
    "x:1",
    "x:1|q",
    "x:abc|c",
    "x:1|c|@0",
    "x:1|c|@1.5",
    "x:1|c|#novalue",
    "x:1|c|zzz",
    "9lives:1|c",
    '{"metric": "x", "kind": "histogram"}',
    '{"metric": "x", "tags": ["a"]}',
    '{"metric": "x", "value": true}',
    '{"metric": "x"',
    "[1, 2]",
])
def test_bad_lines_raise_parse_error(line):
    with pytest.raises(ParseError):
        parse_line(line, now)


def test_timestamp_epoch_numbers():
    assert parse_timestamp(T0) == T0
    assert parse_timestamp(T0 + 0.5) == T0 + 0.5


def test_timestamp_iso_utc():
    assert parse_timestamp("2026-03-02T14:05:00Z") == T0 + 300


def test_timestamp_iso_fraction_is_truncated():
    assert parse_timestamp("2026-03-02T14:05:00.750Z") == T0 + 300


@pytest.mark.parametrize("raw", ["yesterday", "2026-13-02T14:05:00Z", -5, True, None, float("nan")])
def test_bad_timestamps(raw):
    with pytest.raises(ParseError):
        parse_timestamp(raw)
