import json

from tallyhub.cli import main

T0 = 1772460000  # 2026-03-02T14:00:00Z


def run(capsys, *argv):
    code = main(list(argv))
    out, err = capsys.readouterr()
    return code, out, err


def test_ingest_then_query_table(tmp_path, capsys):
    db = f"sqlite:///{tmp_path / 'cli.db'}"
    events = tmp_path / "events.txt"
    events.write_text(f"orders:2|c|#shop:berlin|T{T0}\norders:1|c|#shop:berlin|T{T0 + 4000}\n")
    code, out, _ = run(capsys, "--store", db, "ingest", str(events))
    assert (code, out) == (0, "accepted 2, rejected 0, duplicates 0, bucket writes 2\n")
    code, out, _ = run(capsys, "--store", db, "query", "orders", "--window", "1h")
    assert out.splitlines() == [
        "window                series               value",
        "2026-03-02T14:00:00Z  orders{shop=berlin}  2",
        "2026-03-02T15:00:00Z  orders{shop=berlin}  1",
    ]


def test_query_json_with_tag_and_time_range(tmp_path, capsys):
    db = f"sqlite:///{tmp_path / 'cli.db'}"
    events = tmp_path / "events.txt"
    events.write_text("".join(f"orders:1|c|#shop:{s}|T{T0 + 60 * i}\n"
                              for i, s in enumerate(["a", "b", "a", "a"])))
    run(capsys, "--store", db, "ingest", str(events))
    code, out, _ = run(capsys, "--store", db, "query", "orders", "--tag", "shop=a", "--format", "json",
                       "--start", "2026-03-02T14:01:00Z", "--end", str(T0 + 600))
    assert [json.loads(line) for line in out.splitlines()] == [
        {"kind": "counter", "series": "orders{shop=a}", "value": 2.0, "window": "2026-03-02T14:00:00Z"}]


def test_bad_lines_set_exit_code_and_go_to_stderr(tmp_path, capsys):
    events = tmp_path / "events.txt"
    events.write_text("orders:1|c\nnot a metric\n")
    code, out, err = run(capsys, "--store", "memory://", "ingest", str(events))
    assert code == 1
    assert "rejected 1" in out
    assert "line 2:" in err


def test_errors_exit_2(capsys):
    code, _, err = run(capsys, "--store", "redis://x", "metrics")
    assert code == 2
    assert err.startswith("tallyhub: error: unsupported store URL")


def test_metrics_command(tmp_path, capsys):
    db = f"sqlite:///{tmp_path / 'cli.db'}"
    events = tmp_path / "events.txt"
    events.write_text(f"queue.depth:4|g|T{T0}\norders:1|c|T{T0}\n")
    run(capsys, "--store", db, "ingest", str(events))
    assert run(capsys, "--store", db, "metrics")[1] == "orders\tcounter\nqueue.depth\tgauge\n"
