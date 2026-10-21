from tallyhub.aggregate import Aggregate, aggregate_events, rollup
from tallyhub.model import Event, Kind, SeriesKey

T0 = 1772460000  # 2026-03-02T14:00:00Z
LATENCY = SeriesKey("db.query", Kind.TIMER)


def test_merge_combines_every_field():
    a = Aggregate.of(10.0, T0)
    b = Aggregate.of(4.0, T0 + 5)
    assert a.merge(b) == Aggregate(count=2, total=14.0, min=4.0, max=10.0, last=4.0, last_ts=T0 + 5)


def test_gauge_keeps_newest_value_whatever_the_merge_order():
    old, new = Aggregate.of(1.0, T0), Aggregate.of(2.0, T0 + 1)
    assert old.merge(new).last == 2.0
    assert new.merge(old).last == 2.0


def test_reports_per_kind():
    agg = Aggregate.of(10.0, T0).merge(Aggregate.of(20.0, T0 + 1))
    assert agg.report(Kind.COUNTER) == {"value": 30.0}
    assert agg.report(Kind.GAUGE) == {"value": 20.0}
    assert agg.report(Kind.TIMER) == {"count": 2, "mean": 15.0, "min": 10.0, "max": 20.0}


def test_aggregate_events_buckets_by_resolution():
    events = [Event(LATENCY, v, T0 + dt) for v, dt in [(5, 0), (7, 59), (9, 60)]]
    buckets = aggregate_events(events, 60)
    assert sorted(t for _, t in buckets) == [T0, T0 + 60]
    assert buckets[(LATENCY, T0)].count == 2


def test_rollup_matches_direct_aggregation():
    events = [Event(LATENCY, float(i % 7), T0 + i * 13) for i in range(1000)]
    minute = aggregate_events(events, 60)
    hourly = rollup([(t, agg) for (_, t), agg in minute.items()], 3600)
    direct = {t: agg for (_, t), agg in aggregate_events(events, 3600).items()}
    assert hourly == direct
