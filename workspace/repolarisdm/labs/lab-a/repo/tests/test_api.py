import pytest

T0 = 1772460000  # 2026-03-02T14:00:00Z


def test_hourly_counter_query(service):
    service.ingest([f"orders:1|c|T{T0 + dt}" for dt in (0, 1800, 3599, 3600)])
    assert service.query("orders", "1h") == [
        {"window": "2026-03-02T14:00:00Z", "series": "orders", "kind": "counter", "value": 3.0},
        {"window": "2026-03-02T15:00:00Z", "series": "orders", "kind": "counter", "value": 1.0},
    ]


def test_iso_and_epoch_inputs_land_in_the_same_window(service):
    service.ingest(['{"metric": "orders", "ts": "2026-03-02T14:10:00Z"}', f"orders:1|c|T{T0 + 900}"])
    [row] = service.query("orders", "1h")
    assert row["value"] == 2.0


def test_timer_query_reports_stats(service):
    service.ingest([f"db.query:{v}|ms|T{T0 + i}" for i, v in enumerate([10, 20, 60])])
    [row] = service.query("db.query", "5m")
    assert (row["count"], row["mean"], row["min"], row["max"]) == (3, 30.0, 10.0, 60.0)


def test_tag_filter_and_one_row_per_series(service):
    service.ingest([f"hits:1|c|#route:/a,code:200|T{T0}", f"hits:1|c|#route:/b|T{T0}"])
    assert [r["series"] for r in service.query("hits", "1h")] == ["hits{code=200,route=/a}", "hits{route=/b}"]
    assert [r["series"] for r in service.query("hits", "1h", tags={"route": "/b"})] == ["hits{route=/b}"]


def test_start_and_end_select_base_buckets(service):
    service.ingest([f"orders:1|c|T{T0 + 600 * i}" for i in range(6)])
    [row] = service.query("orders", "1h", start=T0 + 600, end=T0 + 1800)
    assert row["value"] == 2.0


def test_window_must_be_a_multiple_of_resolution(service):
    with pytest.raises(ValueError, match="multiple"):
        service.query("orders", "90s")


def test_metrics(service):
    service.ingest([f"orders:1|c|T{T0}", f"queue.depth:3|g|T{T0}"])
    assert service.metrics() == [{"metric": "orders", "kind": "counter"},
                                 {"metric": "queue.depth", "kind": "gauge"}]
