"""CPU smoke test for G2 (agent runs at scale). Run: python3 -m pytest -q labs/colab/tests/test_g2.py

Checks only the CPU-safe parts: the task loads, workspaces are isolated, the reference passes and
do-nothing fails, the grader runner, the agent loop with a scripted fake model, the HTTP client
against a fake OpenAI-compatible server, the GPU plan logic, statistics on known values, the label
schema, and the notebook file itself. Nothing here needs a GPU, torch or vLLM.
"""
from __future__ import annotations

import ast
import json
import os
import re
import subprocess
import sys
import tempfile
import threading
import time
import zipfile
from fractions import Fraction
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from math import comb
from pathlib import Path

import pytest

COLAB = Path(__file__).resolve().parents[1]
LABS = COLAB.parent
sys.path.insert(0, str(COLAB))

import g2_agent  # noqa: E402
import g2_build_notebook  # noqa: E402
import g2_labels  # noqa: E402
import g2_plan  # noqa: E402
import g2_runs  # noqa: E402
import g2_stats  # noqa: E402
import g2_tasks  # noqa: E402

REFERENCE = LABS / "lab-f" / "repo" / "task" / "solution" / "merge.py"
NOTEBOOK = COLAB / "g2-agent-runs.ipynb"
HELPERS = sorted(COLAB.glob("g2_*.py"))
# The same list as the playbook's tests/content.test.mjs. Built from pieces so this file passes it too.
FORBIDDEN = [
    (re.compile("no" + "index", re.I), "robots tag"),
    (re.compile(r"https?://(?:localhost|127\.0\.0\.1):\d+"), "localhost URL with port"),
    (re.compile("/Us" + "ers/"), "local user path"),
    (re.compile("CHRONOS" + "-CANARY"), "private canary"),
    (re.compile("hold" + "out/", re.I), "holdout path"),
    (re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.(?:com|edu|org|net|io)\b"), "email address"),
]


@pytest.fixture()
def task():
    return g2_tasks.lab_f_task(LABS)


def scripted_chat(replies):
    """A fake model: returns the given replies in order and records what it was sent."""
    sent = []

    def chat(messages, seed):
        sent.append((list(messages), seed))
        reply = replies[len(sent) - 1] if len(sent) <= len(replies) else "I am done thinking."
        if isinstance(reply, Exception):
            raise reply
        return reply, {"prompt_tokens": 10, "completion_tokens": 5, "finish_reason": "stop"}

    chat.sent = sent
    return chat


def solving_replies():
    code = REFERENCE.read_text()
    return ['First I read the types.\n<read_file path="freebusy/model.py"/>',
            f'Now the change.\n<write_file path="freebusy/merge.py">\n```python\n{code}```\n</write_file>',
            "Check it.\n<run_tests/>",
            "<finish>Implemented merge_busy; visible tests pass (exit code 0).</finish>"]


# ---------- task, workspace, grading ----------

def test_lab_f_task_loads(task):
    assert task.name == "lab-f/freebusy-merge"
    assert "merge_busy" in task.instruction and "R12" in task.instruction
    assert (task.app_dir / "freebusy" / "merge.py").is_file()
    assert set(task.graders) == {"weak"}
    with pytest.raises(FileNotFoundError):
        g2_tasks.lab_f_task(LABS, strong_tests=LABS / "no-such-folder")


def test_workspace_is_isolated(task):
    root = g2_tasks.make_workspace(task)
    try:
        assert g2_tasks.check_isolation(task, root) == []
        names = {Path(rel).name for rel, _ in g2_tasks.iter_files(root)}
        assert not names & set(g2_tasks.FORBIDDEN_NAMES)
        assert "NotImplementedError" in (root / "freebusy" / "merge.py").read_text()
        assert LABS.resolve() not in root.resolve().parents
        (root / "test.sh").write_text("echo 1\n")
        assert any("test.sh" in p for p in g2_tasks.check_isolation(task, root))
        task.canary = "canary-for-the-smoke-test"
        (root / "notes.txt").write_text("x canary-for-the-smoke-test y")
        assert any("canary" in p for p in g2_tasks.check_isolation(task, root))
    finally:
        task.canary = None
        g2_tasks.shutil.rmtree(root.parent)


def test_reference_passes_and_do_nothing_fails(task):
    root = g2_tasks.make_workspace(task)
    try:
        visible = g2_tasks.run_cmd(task.visible_test_cmd, root, timeout=60)
        assert visible["exit"] != 0  # merge_busy is not implemented yet
        assert g2_tasks.grade(task, root, "weak")["reward"] == 0.0
        g2_tasks.shutil.copy(REFERENCE, root / "freebusy" / "merge.py")
        visible = g2_tasks.run_cmd(task.visible_test_cmd, root, timeout=60)
        assert visible["exit"] == 0, visible["output"]
        result = g2_tasks.grade(task, root, "weak")
        assert result["reward"] == 1.0 and result["passed"], result["log_tail"]
    finally:
        g2_tasks.shutil.rmtree(root.parent)


def test_lab_f_self_check_matches_run_task(task):
    assert g2_tasks.lab_f_self_check(task, LABS) == {"weak": {"do-nothing": 0.0, "reference": 1.0}}


def test_run_task_matrix_command_from_the_notebook(tmp_path):
    """The notebook's step 6 command, run with the weak grader: the counts the Lab F README shows."""
    out = subprocess.run(["bash", str(LABS / "lab-f/repo/run_task.sh"), "--all", "--runs", "1",
                          "--tests", str(LABS / "lab-f/repo/task/tests"), "--out", str(tmp_path)],
                         capture_output=True, text=True, timeout=300)
    assert "false accepts: 5, false rejects: 2, unstable: 0" in out.stdout
    assert "matrix: NOT OK" in out.stdout and out.returncode == 1


def _fake_grader(tmp_path, name, body):
    folder = tmp_path / name
    folder.mkdir()
    (folder / "test.sh").write_text("#!/bin/bash\nmkdir -p \"$LOGS_DIR/verifier\"\n" + body + "\n")
    return folder


def test_grade_reads_every_reward_form(task, tmp_path):
    task.graders = {
        "one": _fake_grader(tmp_path, "one", 'echo 1 > "$LOGS_DIR/verifier/reward.txt"'),
        "zero": _fake_grader(tmp_path, "zero", 'echo 0 > "$LOGS_DIR/verifier/reward.txt"'),
        "none": _fake_grader(tmp_path, "none", "true"),
        "json": _fake_grader(tmp_path, "json", 'echo \'{"reward": 0.5}\' > "$LOGS_DIR/verifier/reward.json"'),
        "junk": _fake_grader(tmp_path, "junk", 'echo yes > "$LOGS_DIR/verifier/reward.txt"'),
        "hang": _fake_grader(tmp_path, "hang", 'echo 1 > "$LOGS_DIR/verifier/reward.txt"; sleep 30'),
        "env": _fake_grader(tmp_path, "env", '[ -z "${HF_TOKEN:-}" ] && [ -f "$APP_DIR/freebusy/merge.py" ] '
                            '&& [ -f "$TESTS_DIR/test.sh" ] && echo 1 > "$LOGS_DIR/verifier/reward.txt"'),
    }
    got = {name: g2_tasks.grade(task, task.app_dir, name, timeout=2) for name in task.graders}
    assert got["one"]["reward"] == 1.0 and got["one"]["passed"]
    assert got["zero"]["reward"] == 0.0 and not got["zero"]["passed"]
    assert got["none"] == {**got["none"], "reward": 0.0, "note": "no reward file"}
    assert got["json"]["reward"] == 0.5 and not got["json"]["passed"]
    assert got["junk"]["reward"] == 0.0 and "unreadable" in got["junk"]["note"]
    assert got["hang"]["timed_out"] and got["hang"]["reward"] == 0.0 and got["hang"]["seconds"] < 10
    assert got["env"]["reward"] == 1.0


def test_private_task_never_stores_grader_output(task, tmp_path):
    task.graders = {"p": _fake_grader(tmp_path, "p", 'echo "hidden test name"; echo 0 > "$LOGS_DIR/verifier/reward.txt"')}
    task.private = True
    assert g2_tasks.grade(task, task.app_dir, "p")["log_tail"] == ""


def test_run_cmd_kills_the_process_group():
    started = time.time()
    res = g2_tasks.run_cmd(["bash", "-c", "sleep 30 & sleep 30; wait"], tempfile.gettempdir(), timeout=1)
    assert res["timed_out"] and time.time() - started < 10


def test_safe_unzip(tmp_path):
    good = tmp_path / "good.zip"
    with zipfile.ZipFile(good, "w") as z:
        z.writestr("tests/test.sh", "echo 1\n")
        z.writestr("tests/test_more.py", "pass\n")
        z.writestr("__MACOSX/tests/test.sh", "junk")
    assert g2_tasks.safe_unzip(good, tmp_path / "out").name == "tests"
    for bad_name in ("../evil/test.sh", "/abs/test.sh"):
        bad = tmp_path / "bad.zip"
        with zipfile.ZipFile(bad, "w") as z:
            z.writestr(bad_name, "x")
        with pytest.raises(ValueError):
            g2_tasks.safe_unzip(bad, tmp_path / "out2")
    empty = tmp_path / "empty.zip"
    with zipfile.ZipFile(empty, "w") as z:
        z.writestr("readme.txt", "no grader")
    with pytest.raises(ValueError):
        g2_tasks.safe_unzip(empty, tmp_path / "out3")


def test_folder_task_requires_layout(tmp_path):
    with pytest.raises(FileNotFoundError):
        g2_tasks.folder_task(tmp_path, name="x", visible_test_cmd=["true"])
    (tmp_path / "env").mkdir()
    (tmp_path / "grader").mkdir()
    (tmp_path / "grader" / "test.sh").write_text("echo 1")
    (tmp_path / "instruction.md").write_text("do it")
    t = g2_tasks.folder_task(tmp_path, name="x", visible_test_cmd=["true"], canary="c")
    assert t.private and t.graders == {"private": tmp_path / "grader"}


# ---------- agent loop ----------

def test_parse_action_variants():
    p = g2_agent.parse_action
    assert p('<read_file path="a/b.py"/>') == {"name": "read_file", "ignored_actions": 0, "path": "a/b.py"}
    w = p("<write_file path='x.py'>\n```python\nprint(1)\n```\n</write_file>")
    assert w["name"] == "write_file" and w["content"] == "print(1)\n"
    assert p("ok <run_tests/>")["name"] == "run_tests"
    assert p("<finish>done</finish>")["message"] == "done"
    assert p("<think>maybe <run_tests/></think> <read_file path='m.py'/>")["name"] == "read_file"
    two = p("<run_tests/> then <finish>x</finish>")
    assert two["name"] == "run_tests" and two["ignored_actions"] == 1
    assert "closing" in p('<write_file path="x.py">\nprint(1)')["error"]
    assert p("no action here")["name"] == "invalid"


def test_safe_path(tmp_path):
    assert g2_agent.safe_path(tmp_path, "freebusy/merge.py") == (tmp_path / "freebusy/merge.py").resolve()
    assert g2_agent.safe_path(tmp_path, "/app/freebusy/merge.py") == (tmp_path / "freebusy/merge.py").resolve()
    assert g2_agent.safe_path(tmp_path, "/app") == tmp_path.resolve()
    for bad in ("../x", "/etc/passwd", "a/../../x", "~/x", "", "/app/../x", "/application/x"):
        with pytest.raises(ValueError):
            g2_agent.safe_path(tmp_path, bad)


def test_agent_end_to_end_with_scripted_model(task, tmp_path):
    chat = scripted_chat(solving_replies())
    cfg = {"seed": 3, "model_id": "fake", "revision": "0" * 40, "temperature": 0.7, "top_p": 0.95,
           "max_turns": 8, "context_tokens": 16384, "reply_tokens": 1536}
    rows = g2_runs.run_many(task, chat, tmp_path / "run", n=1, concurrency=1, cfg=cfg, progress=lambda s: None)
    row = rows[0]
    assert row["valid"] and row["end_reason"] == "finish" and row["turns"] == 4
    assert row["files_changed"] == ["freebusy/merge.py"] and not row["touched_tests"]
    assert row["rewards"] == {"weak": 1.0} and row["passed"] == {"weak": True}
    assert row["last_test_exit"] == 0 and row["seed"] == 300000
    events = g2_runs.load_transcript(tmp_path / "run" / row["transcript"])
    assert [e["type"] for e in events] == ["meta", "prompt", "prompt", "turn", "turn", "turn", "turn",
                                           "end", "diff", "grade"]
    assert "Booking" in events[3]["observation"] and "Exit code: 0" in events[5]["observation"]
    assert "content" not in events[4]["action"] and events[4]["action"]["lines"] > 10
    assert "test_outputs" not in json.dumps(events[:3])  # the agent never sees the grader
    assert chat.sent[1][1] == 300000 * 1000 + 2  # per-turn seed
    # Resume: a second call runs nothing new; a changed setting is refused.
    again = g2_runs.run_many(task, chat, tmp_path / "run", n=1, concurrency=1, cfg=cfg, progress=lambda s: None)
    assert len(again) == 1 and len(chat.sent) == 4
    with pytest.raises(ValueError):
        g2_runs.run_many(task, chat, tmp_path / "run", n=1, concurrency=1, cfg={**cfg, "temperature": 1.0})
    assert "turn 2: write_file freebusy/merge.py" in g2_runs.render_transcript(tmp_path / "run" / row["transcript"])


def test_agent_failure_endings(task, tmp_path):
    def one(replies, **kw):
        root = g2_tasks.make_workspace(task)
        try:
            return g2_agent.run_agent(task, root, scripted_chat(replies), tmp_path / f"t{time.time_ns()}.jsonl",
                                      attempt_id="a", seed=1, **kw)
        finally:
            g2_tasks.shutil.rmtree(root.parent)
    assert one(["blah", "blah", "blah"])["end_reason"] == "format_errors"
    s = one([RuntimeError("HTTP 400: too long")])
    assert s["end_reason"] == "model_error" and s["turns"] == 0
    s = one(['<read_file path="../../etc/passwd"/>'] * 3, max_turns=3)
    assert s["end_reason"] == "max_turns" and s["path_escapes"] == 3
    assert one(["<run_tests/>"], context_tokens=100)["end_reason"] == "context_full"
    s = one(['<write_file path="tests/test_merge.py">\npass\n</write_file>', "<finish>tests pass</finish>"])
    assert s["end_reason"] == "finish" and s["writes"] == 1 and s["test_runs"] == 0


def test_attempt_is_invalid_when_the_workspace_leaks_a_grader(task, tmp_path):
    leaky = tmp_path / "app"
    g2_tasks.shutil.copytree(task.app_dir, leaky)
    (leaky / "test.sh").write_text("echo 1 > reward.txt\n")
    task.app_dir = leaky
    row = g2_runs.run_one(task, scripted_chat([]), tmp_path / "run", 0, {"seed": 0})
    assert row["valid"] is False and "test.sh" in row["invalid_reason"]


class _FakeOpenAI(BaseHTTPRequestHandler):
    bodies = []

    def log_message(self, *args):
        pass

    def _send(self, code, payload):
        data = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        self._send(200, {"data": [{"id": "g2-model"}]})

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        self.bodies.append(body)
        if body["messages"][-1]["content"] == "too long":
            return self._send(400, {"error": "maximum context length exceeded"})
        self._send(200, {"choices": [{"message": {"content": "<run_tests/>"}, "finish_reason": "stop"}],
                         "usage": {"prompt_tokens": 7, "completion_tokens": 3}})


def test_server_chat_and_wait_against_fake_server():
    server = ThreadingHTTPServer(("127.0.0.1", 0), _FakeOpenAI)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_address[1]}/v1"
    try:
        assert g2_plan.wait_for_server(base, timeout_s=10) == ["g2-model"]
        chat = g2_agent.make_server_chat(base, "g2-model", temperature=0.3, top_p=0.9, max_tokens=99,
                                         extra={"chat_template_kwargs": {"enable_thinking": False}})
        text, usage = chat([{"role": "user", "content": "hi"}], 42)
        assert text == "<run_tests/>" and usage == {"prompt_tokens": 7, "completion_tokens": 3, "finish_reason": "stop"}
        body = _FakeOpenAI.bodies[-1]
        assert (body["model"], body["temperature"], body["top_p"], body["max_tokens"], body["seed"]) == \
            ("g2-model", 0.3, 0.9, 99, 42)
        assert body["chat_template_kwargs"] == {"enable_thinking": False} and body["repetition_penalty"] == 1.0
        assert body["top_k"] == 0  # top_k off: the model's own default (20) never applies
        with pytest.raises(RuntimeError, match="HTTP 400"):
            chat([{"role": "user", "content": "too long"}], 1)
    finally:
        server.shutdown()
    dead = subprocess.Popen([sys.executable, "-c", "raise SystemExit(3)"])
    dead.wait()
    with pytest.raises(RuntimeError, match="exited with code 3"):
        g2_plan.wait_for_server(base, dead, timeout_s=5)


class _ScriptedOpenAI(_FakeOpenAI):
    """Answers by attempt (from the per-turn seed): even attempts solve, odd ones write a stub, a005 babbles."""

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        attempt, turn = divmod(body["seed"], 1000)
        if attempt == 5:
            reply = "Let me think about this."
        elif attempt % 2 == 0:
            reply = solving_replies()[turn - 1]
        else:
            stub = "from .model import BusySpan\n\n\ndef merge_busy(bookings, *, tolerance=None):\n    return []\n"
            reply = [f'<write_file path="freebusy/merge.py">\n{stub}</write_file>',
                     "<finish>All tests pass.</finish>"][min(turn, 2) - 1]
        self._send(200, {"choices": [{"message": {"content": reply}, "finish_reason": "stop"}],
                         "usage": {"prompt_tokens": 100, "completion_tokens": 20}})


def test_notebook_flow_with_fake_server(task, tmp_path):
    """Steps 8 to 12 of the notebook on CPU: HTTP client, parallel runs, table, labels, hints."""
    server = ThreadingHTTPServer(("127.0.0.1", 0), _ScriptedOpenAI)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    task.graders["strong"] = task.graders["weak"]  # stands in for your grader; only the plumbing is tested
    try:
        chat = g2_agent.make_server_chat(f"http://127.0.0.1:{server.server_address[1]}/v1", "g2-model")
        cfg = {"seed": 0, "model_id": "fake", "revision": "f" * 40, "temperature": 0.7, "top_p": 0.95,
               "max_turns": 6, "context_tokens": 16384, "reply_tokens": 1536}
        rows = g2_runs.run_many(task, chat, tmp_path / "run", n=8, concurrency=4, cfg=cfg, progress=lambda s: None)
    finally:
        server.shutdown()
    assert [r["attempt"] for r in rows] == [f"a{i:03d}" for i in range(8)] and all(r["valid"] for r in rows)
    assert [r["passed"]["strong"] for r in rows] == [True, False, True, False, True, False, True, False]
    assert rows[5]["end_reason"] == "format_errors" and rows[1]["end_reason"] == "finish"
    table = g2_stats.results_table([r["passed"]["strong"] for r in rows])
    assert table[0]["c"] == 4 and table[0]["pass@k"] == pytest.approx(0.5)
    assert g2_stats.agreement(rows) == {"both pass": 4, "only weak passes": 0, "only strong passes": 0, "both fail": 4}
    hints = {}
    for r in rows:
        if not r["passed"]["strong"]:
            events = g2_runs.load_transcript(tmp_path / "run" / r["transcript"])
            hints[r["attempt"]] = g2_labels.suggest_label(events, r, {"freebusy/merge.py"})
    assert hints["a001"]["mistake"] == "M8" and hints["a001"]["also"] == ["M6"]  # wrote before reading; no tests
    assert hints["a005"]["mistake"] == "other"
    ok, errors = g2_labels.validate_all(list(hints.values()), rows, "strong")
    assert len(ok) == 4 and errors == []


def test_importing_helpers_does_not_import_torch():
    code = "import sys; sys.path.insert(0, %r); import g2_agent, g2_plan, g2_runs; print('torch' in sys.modules)"
    out = subprocess.run([sys.executable, "-c", code % str(COLAB)], capture_output=True, text=True)
    assert out.stdout.strip() == "False", out.stderr


# ---------- GPU plan ----------

@pytest.mark.parametrize("smi, model, dtype, eager, conc", [
    ("Tesla T4, 15360, 7.5", "Qwen/Qwen2.5-Coder-1.5B-Instruct", "half", True, 8),
    ("NVIDIA L4, 23034, 8.9", "Qwen/Qwen2.5-Coder-1.5B-Instruct", "bfloat16", False, 16),
    ("NVIDIA A100-SXM4-40GB, 40960, 8.0", "Qwen/Qwen2.5-Coder-7B-Instruct", "bfloat16", False, 16),
    ("NVIDIA A100-SXM4-80GB, 81920, 8.0", "Qwen/Qwen2.5-Coder-7B-Instruct", "bfloat16", False, 32),
    ("NVIDIA H100 80GB HBM3, 81559, 9.0", "Qwen/Qwen2.5-Coder-7B-Instruct", "bfloat16", False, 32),
])
def test_plan_per_gpu(smi, model, dtype, eager, conc):
    gpu = g2_plan.parse_nvidia_smi(smi + "\n")
    plan = g2_plan.choose_plan(gpu)
    assert (plan.model_id, plan.dtype, plan.enforce_eager, plan.concurrency) == (model, dtype, eager, conc)
    assert plan.attempts >= 20 and len(plan.revision) == 40
    cmd = g2_plan.serve_command(plan, port=8123)
    assert cmd[:3] == ["vllm", "serve", model]
    assert cmd[cmd.index("--dtype") + 1] == dtype and cmd[cmd.index("--revision") + 1] == plan.revision
    assert cmd[cmd.index("--host") + 1] == "127.0.0.1" and cmd[cmd.index("--generation-config") + 1] == "vllm"
    assert ("--enforce-eager" in cmd) == eager
    assert plan.model_id in g2_plan.describe(plan)


def test_plan_refuses_what_does_not_fit():
    assert g2_plan.parse_nvidia_smi("") is None
    with pytest.raises(ValueError, match="No GPU"):
        g2_plan.choose_plan(None)
    t4 = g2_plan.parse_nvidia_smi("Tesla T4, 15360, 7.5")
    assert t4.mem_gb == 15.0 and t4.cc == (7, 5)
    with pytest.raises(ValueError, match="does not fit"):
        g2_plan.choose_plan(t4, "qwen-coder-7b")
    with pytest.raises(ValueError, match="unknown model"):
        g2_plan.choose_plan(t4, "gpt-17")
    with pytest.raises(ValueError, match="compute capability"):
        g2_plan.choose_plan(g2_plan.GpuInfo("Tesla P100", 16.0, (6, 0), "test"))
    mini = g2_plan.choose_plan(t4, "mini-coder-1.7b")
    assert mini.request_extra == {"chat_template_kwargs": {"enable_thinking": False}}


# ---------- statistics ----------

def test_pass_at_k_and_pass_hat_k_known_values():
    assert g2_stats.pass_at_k(50, 10, 1) == pytest.approx(0.2)
    assert g2_stats.pass_at_k(50, 10, 5) == pytest.approx(0.6894, abs=5e-5)
    assert g2_stats.pass_at_k(50, 10, 10) == pytest.approx(0.9175, abs=5e-5)
    assert g2_stats.pass_hat_k(50, 10, 5) == pytest.approx(0.000119, abs=5e-7)
    assert g2_stats.pass_hat_k(50, 49, 5) == pytest.approx(0.90)
    assert g2_stats.pass_hat_k(50, 49, 10) == pytest.approx(0.80)
    assert g2_stats.pass_at_k(20, 0, 5) == 0.0 and g2_stats.pass_hat_k(20, 20, 20) == 1.0
    for bad in ((10, 11, 1), (10, 3, 0), (10, 3, 11)):
        with pytest.raises(ValueError):
            g2_stats.pass_at_k(*bad)


def test_estimators_match_exact_combinatorics():
    n = 20
    for c in range(n + 1):
        for k in range(1, n + 1):
            exact_at = 1 - Fraction(comb(n - c, k), comb(n, k))
            assert g2_stats.pass_at_k(n, c, k) == pytest.approx(float(exact_at), abs=1e-12)
            assert g2_stats.pass_hat_k(n, c, k) == pytest.approx(float(Fraction(comb(c, k), comb(n, k))))
        assert g2_stats.pass_at_k(n, c, 1) == pytest.approx(c / n) == pytest.approx(g2_stats.pass_hat_k(n, c, 1))


def test_wilson_known_values():
    lo, hi = g2_stats.wilson(10, 50)
    assert (round(lo, 3), round(hi, 3)) == (0.112, 0.330)
    assert g2_stats.wilson(0, 50)[0] == 0.0 and round(g2_stats.wilson(0, 50)[1], 3) == 0.071
    assert round(g2_stats.wilson(50, 50)[0], 3) == 0.929 and g2_stats.wilson(50, 50)[1] == 1.0
    assert g2_stats.wilson(0, 20)[1] == pytest.approx(1.96 ** 2 / (20 + 1.96 ** 2))  # about 0.161
    with pytest.raises(ValueError):
        g2_stats.wilson(1, 0)


def test_results_table_and_intervals():
    outcomes = [True] * 10 + [False] * 40
    rows = g2_stats.results_table(outcomes, ks=(1, 5, 10, 100))
    assert [r["k"] for r in rows] == [1, 5, 10]
    five = rows[1]
    assert five["pass@k"] == pytest.approx(0.6894, abs=5e-5)
    lo, hi = g2_stats.wilson(10, 50)
    assert five["pass@k_ci"] == pytest.approx((1 - (1 - lo) ** 5, 1 - (1 - hi) ** 5))
    assert five["pass^k_ci"] == pytest.approx((lo ** 5, hi ** 5))
    for r in rows:
        assert r["pass@k_ci"][0] <= r["pass@k"] <= r["pass@k_ci"][1]
        assert r["pass@k_boot"][0] <= r["pass@k_boot"][1]
    assert rows == g2_stats.results_table(outcomes, ks=(1, 5, 10, 100))  # fixed seed: reproducible
    table = g2_stats.markdown_table(rows, "STRONG")
    assert "Successes: 10 of 50" in table and table.count("\n|") == 2 + len(rows)
    assert "No valid attempts" in g2_stats.markdown_table([], "WEAK")
    frame = g2_stats.frame_line(50, {"model_id": "m", "task": "t", "backend": "vllm", "sandbox": True}, invalid=2)
    assert "Frame: 50 valid attempts (2 invalid" in frame and "backend vllm" in frame and "Sandbox users: on" in frame
    assert g2_stats.sample_size_for_width(0.25, 0.10) == 289


def test_agreement_counts():
    rows = [{"passed": {"weak": w, "strong": s}} for w, s in [(1, 1), (1, 0), (1, 0), (0, 0), (0, 1)]]
    assert g2_stats.agreement(rows) == {"both pass": 1, "only weak passes": 2, "only strong passes": 1,
                                        "both fail": 1}


def test_results_table_stops_at_half_n_and_plug_in_sits_in_its_interval():
    for n, c in [(20, 19), (20, 3), (30, 4), (20, 0), (20, 20)]:
        rows = g2_stats.results_table([True] * c + [False] * (n - c))
        assert [r["k"] for r in rows] == [k for k in (1, 2, 5, 10, 20) if k == 1 or 2 * k <= n]
        for r in rows:
            lo, hi = r["pass^k_ci"]
            assert lo - 1e-12 <= r["pass^k_plugin"] <= hi + 1e-12
            assert r["pass^k_plugin"] == pytest.approx((c / n) ** r["k"])
    # The case from the review: with c < k the unbiased pass^k is 0, below its interval. The table says so.
    row = next(r for r in g2_stats.results_table([True] * 3 + [False] * 17) if r["k"] == 5)
    assert row["pass^k"] == 0.0 and row["pass^k_ci"][0] > 0 and row["pass^k_plugin"] > 0
    assert "unbiased estimate C(c,k)/C(n,k) can fall below it" in g2_stats.markdown_table([row], "X")


# ---------- custody ----------

def _turn_event(n, name, reply, observation):
    return {"type": "turn", "turn": n, "reply": reply, "action": {"name": name}, "observation": observation}


def test_leak_scan_flags_answer_paths_network_and_canary():
    clean = [_turn_event(1, "read_file", '<read_file path="freebusy/model.py"/>', "Content of freebusy/model.py:\nx"),
             _turn_event(2, "run_tests", "<run_tests/>", "Exit code: 0\nOK"),
             _turn_event(3, "finish", "<finish>My solution merges spans.</finish>", "Finished.")]
    assert g2_runs.scan_for_leaks(clean) == []          # the word "solution" alone is fine
    lookup = [_turn_event(1, "read_file", "<read_file path='../solution/merge.py'/>",
                          "Error: path leaves the repository: '../solution/merge.py'")]
    assert "reply mentions '/solution/'" in g2_runs.scan_for_leaks(lookup)[0]
    tool = [_turn_event(1, "run_tests", "<run_tests/>",
                        "Exit code: 1\nPermissionError: [Errno 13] '/content/repo/x'")]
    assert "tool output mentions '/content'" in g2_runs.scan_for_leaks(tool)[0]
    net = [_turn_event(1, "write_file", "<write_file path='freebusy/merge.py'>\nimport urllib.request\n</write_file>",
                       "Wrote 1 lines to freebusy/merge.py.")]
    assert "network use" in g2_runs.scan_for_leaks(net)[0]
    # A path the model asked for and did not get is not tool output; only the reply counts.
    echoed = [_turn_event(1, "read_file", "<read_file path='notes.md'/>", "Error: no such file: lab-f/notes.md")]
    assert g2_runs.scan_for_leaks(echoed) == []
    canary = [_turn_event(1, "finish", "<finish>xyz-canary-123</finish>", "Finished.")]
    assert "canary" in g2_runs.scan_for_leaks(canary, canary="xyz-canary-123")[0]


def test_symlink_out_of_the_workspace_invalidates_the_attempt(task, tmp_path):
    maker = ("import os, unittest\nhere = os.path.dirname(os.path.abspath(__file__))\n"
             "os.symlink(os.path.abspath(os.sep + 'etc'), os.path.join(here, '..', 'freebusy', 'outside'))\n"
             "class T(unittest.TestCase):\n    def test_x(self):\n        pass\n")
    replies = [f'<write_file path="tests/test_link.py">\n{maker}</write_file>', "<run_tests/>",
               "<finish>done</finish>"]
    cfg = {"seed": 0, "max_turns": 5, "context_tokens": 16384, "reply_tokens": 512}
    row = g2_runs.run_one(task, scripted_chat(replies), tmp_path / "run", 0, cfg)
    assert row["valid"] is False and "symlink leaves the workspace: freebusy/outside" in row["invalid_reason"]
    assert not list((tmp_path / "run" / "pending").glob("*.json"))      # graded, so no longer pending


def test_all_agents_finish_before_any_grading(task, tmp_path, monkeypatch):
    log, real_grade = [], g2_runs.grade

    def chat(messages, seed):
        log.append(("chat", time.monotonic()))
        return "<finish>nothing</finish>", {"finish_reason": "stop"}

    def graded(*args, **kwargs):
        log.append(("grade", time.monotonic()))
        return real_grade(*args, **kwargs)

    monkeypatch.setattr(g2_runs, "grade", graded)
    cfg = {"seed": 0, "max_turns": 3, "context_tokens": 16384, "reply_tokens": 512}
    rows = g2_runs.run_many(task, chat, tmp_path / "run", n=4, concurrency=2, cfg=cfg, progress=lambda s: None)
    assert len(rows) == 4 and all(r["valid"] and r["passed"] == {"weak": False} for r in rows)
    last_chat = max(t for kind, t in log if kind == "chat")
    first_grade = min(t for kind, t in log if kind == "grade")
    assert last_chat < first_grade


def test_resume_grades_waiting_attempts_without_rerunning_them(task, tmp_path):
    cfg = {"seed": 0, "max_turns": 3, "context_tokens": 16384, "reply_tokens": 512}
    chat = scripted_chat(["<finish>x</finish>"])
    pending = g2_runs.agent_phase(task, chat, tmp_path / "run", 0, cfg)      # agent done, grading "lost"
    assert pending["pending"] and Path(pending["workspace"]).is_dir()
    rows = g2_runs.run_many(task, chat, tmp_path / "run", n=1, concurrency=1, cfg=cfg, progress=lambda s: None)
    assert len(chat.sent) == 1 and rows[0]["attempt"] == "a000" and rows[0]["rewards"] == {"weak": 0.0}
    assert not Path(pending["workspace"]).exists()


def test_require_sandbox_refuses_to_run_as_you(task, tmp_path):
    if g2_tasks.running_as_root_on_linux():
        pytest.skip("this machine can run sandbox users")
    cfg = {"seed": 0, "require_sandbox": True, "max_turns": 2, "context_tokens": 999, "reply_tokens": 9}
    with pytest.raises(RuntimeError, match="require_sandbox"):
        g2_runs.run_one(task, scripted_chat([]), tmp_path / "run", 0, cfg)
    with pytest.raises(RuntimeError, match="require_sandbox"):
        g2_runs.run_many(task, scripted_chat([]), tmp_path / "many", n=2, concurrency=1, cfg=cfg)
    assert not (tmp_path / "many").exists()                         # nothing saved, nothing to clean up


def test_sandbox_settings_and_guards():
    if not g2_tasks.running_as_root_on_linux():
        assert not g2_tasks.sandbox_for(3).active and g2_tasks.sandbox_for(3).popen_kwargs() == {}
        assert g2_tasks.probe(g2_tasks.sandbox_for(0), ["/"]) == {"sandbox": "inactive"}
    box = g2_tasks.Sandbox(g2_tasks.SANDBOX_UID_BASE + 3)
    assert box.popen_kwargs() == {"user": 50003, "group": 50003, "extra_groups": [], "umask": 0o077}
    assert g2_tasks.kill_uid(0) == 0 and g2_tasks.kill_uid(os.getuid()) == 0 and g2_tasks.kill_uid(None) == 0


def test_pids_of_uid_reads_proc_status(tmp_path):
    for pid, uid, state in [("11", 50007, "S"), ("12", 0, "R"), ("13", 50007, "R"), ("14", 50007, "Z"),
                            ("self", 50007, "R")]:
        (tmp_path / pid).mkdir()
        (tmp_path / pid / "status").write_text(f"Name:\tx\nState:\t{state} (x)\nUid:\t{uid}\t{uid}\t{uid}\t{uid}\n")
    assert sorted(g2_tasks.pids_of_uid(50007, proc=str(tmp_path))) == [11, 13]     # no zombie, no "self"
    assert g2_tasks.pids_of_uid(50007, proc=str(tmp_path / "missing")) == []


def test_remove_owned_deletes_only_that_users_files(tmp_path):
    (tmp_path / "a" / "b").mkdir(parents=True)
    (tmp_path / "a" / "b" / "stash.txt").write_text("hidden tests")
    (tmp_path / "link").symlink_to("/etc")
    assert g2_tasks.remove_owned([tmp_path], 54321) == []               # another user's files stay
    assert (tmp_path / "a" / "b" / "stash.txt").exists() and (tmp_path / "link").is_symlink()
    removed = g2_tasks.remove_owned([tmp_path], os.getuid())
    assert sorted(removed) == sorted([str(tmp_path / "a"), str(tmp_path / "link")])
    assert not (tmp_path / "a").exists() and Path("/etc").is_dir()     # the link went, not its target


def test_lock_lab_f_moves_the_answers_into_the_vault(tmp_path):
    labs = tmp_path / "labs"
    g2_tasks.shutil.copytree(LABS / "lab-f" / "repo", labs / "lab-f" / "repo")
    assert len(g2_tasks.lab_f_answers_in_clone(labs)) == 2
    vault = tmp_path / "vault"
    ref = g2_tasks.lock_lab_f(labs, vault)
    assert ref.read_text() == REFERENCE.read_text() and g2_tasks.lab_f_answers_in_clone(labs) == []
    assert (vault / "lab-f" / "solutions" / "wrong-1" / "solve.sh").is_file()
    assert oct(vault.stat().st_mode & 0o777) == "0o700"
    assert g2_tasks.lock_lab_f(labs, vault) == ref                     # safe to rerun
    assert g2_tasks.lab_f_reference(labs, vault) == ref
    task = g2_tasks.lab_f_task(labs)
    assert g2_tasks.lab_f_self_check(task, labs, reference=ref) == {"weak": {"do-nothing": 0.0, "reference": 1.0}}
    assert g2_tasks.lock_down([tmp_path / "labs", tmp_path / "missing"]) == [str(tmp_path / "labs")]
    assert oct((tmp_path / "labs").stat().st_mode & 0o777) == "0o700"


def test_block_network_reports_what_happened():
    def missing(cmd, **kw):
        raise FileNotFoundError(cmd[0])
    assert g2_tasks.block_network(run=missing) == {"iptables": "failed: FileNotFoundError",
                                                    "ip6tables": "failed: FileNotFoundError"}
    calls = []

    def ok(cmd, **kw):
        calls.append(cmd)
        return subprocess.CompletedProcess(cmd, 1 if "-C" in cmd else 0, "", "")
    assert g2_tasks.block_network(run=ok) == {"iptables": "rule added", "ip6tables": "rule added"}
    assert calls[1][:2] == ["iptables", "-I"] and "--uid-owner" in calls[1] and calls[1][-1] == "REJECT"


def test_reward_and_diff_never_follow_symlinks_or_read_special_files(tmp_path):
    verifier = tmp_path / "verifier"
    verifier.mkdir()
    (tmp_path / "one.txt").write_text("1")
    (verifier / "reward.txt").symlink_to(tmp_path / "one.txt")
    assert g2_tasks.read_reward(verifier)[0] == 0.0
    (verifier / "reward.txt").unlink()
    (verifier / "reward.txt").write_text("1\n")
    assert g2_tasks.read_reward(verifier) == (1.0, "reward.txt")
    before, after = tmp_path / "before", tmp_path / "after"
    before.mkdir(); after.mkdir()
    (after / "link.py").symlink_to("/etc/hosts")
    os.mkfifo(after / "pipe.py")
    diff = g2_tasks.diff_workspaces(before, after)
    assert diff["added"] == [] and diff["symlinks_out"] == ["link.py -> /etc/hosts"]


def test_agent_refuses_to_write_into_a_fifo(task, tmp_path):
    root = g2_tasks.make_workspace(task)
    try:
        os.mkfifo(root / "freebusy" / "trap.py")
        stats = {"writes": 0, "path_escapes": 0}
        out = g2_agent.execute({"name": "write_file", "path": "freebusy/trap.py", "content": "x\n"}, root, task,
                               stats, 5)
        assert "not a regular file" in out
    finally:
        g2_tasks.shutil.rmtree(root.parent)


def test_transformers_fallback_samples_like_the_server(monkeypatch):
    """The fallback with fake torch and transformers modules: same sampling fields, the plan's dtype."""
    import types
    seen = {}

    class FakeTensor(list):
        shape = (1, 3)

        def to(self, device):
            return self

    class FakeTok:
        eos_token_id = 0

        @classmethod
        def from_pretrained(cls, *a, **kw):
            return cls()

        def apply_chat_template(self, messages, **kw):
            return "prompt"

        def __call__(self, text, return_tensors=None):
            return _Batch({"input_ids": FakeTensor([[1, 2, 3]])})

        def decode(self, ids, skip_special_tokens=True):
            return "<finish>ok</finish>"

    class _Batch(dict):
        def to(self, device):
            return self

    class FakeModel:
        @classmethod
        def from_pretrained(cls, *a, **kw):
            seen["dtype"] = kw["dtype"]
            return cls()

        def to(self, device):
            return self

        def eval(self):
            return self

        def generate(self, **kw):
            seen.update({k: v for k, v in kw.items() if k != "input_ids"})
            return [[1, 2, 3, 9, 9]]

    class NoGrad:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

    torch = types.SimpleNamespace(float16="F16", bfloat16="BF16", float32="F32", manual_seed=lambda s: None,
                                  no_grad=NoGrad)
    transformers = types.SimpleNamespace(AutoModelForCausalLM=FakeModel, AutoTokenizer=FakeTok)
    monkeypatch.setitem(sys.modules, "torch", torch)
    monkeypatch.setitem(sys.modules, "transformers", transformers)
    t4 = g2_plan.choose_plan(g2_plan.parse_nvidia_smi("Tesla T4, 15360, 7.5"))
    plan = g2_plan.apply_overrides(t4, {}, "transformers")
    assert plan.concurrency == 1
    chat = g2_agent.make_chat(plan, "transformers", "unused", temperature=0.7, top_p=0.95)
    text, usage = chat([{"role": "user", "content": "hi"}], 5)
    assert text == "<finish>ok</finish>" and usage["completion_tokens"] == 2
    assert seen["dtype"] == "F16" and seen["top_k"] == 0 and seen["repetition_penalty"] == 1.0
    assert (seen["temperature"], seen["top_p"], seen["do_sample"]) == (0.7, 0.95, True)
    l4 = g2_plan.choose_plan(g2_plan.parse_nvidia_smi("NVIDIA L4, 23034, 8.9"))
    g2_agent.make_chat(l4, "transformers", "unused", temperature=0.7, top_p=0.95)
    assert seen["dtype"] == "BF16"
    with pytest.raises(ValueError):
        g2_agent.make_chat(l4, "llama.cpp", "unused", temperature=0.7, top_p=0.95)


def test_plan_overrides():
    plan = g2_plan.choose_plan(g2_plan.parse_nvidia_smi("Tesla T4, 15360, 7.5"))
    g2_plan.apply_overrides(plan, {"gpu_memory_utilization": 0.8, "max_model_len": 8192})
    assert (plan.gpu_memory_utilization, plan.max_model_len, plan.concurrency) == (0.8, 8192, 8)
    for bad in ({"gpu_memory": 1}, {"model_id": "x"}):
        with pytest.raises(ValueError):
            g2_plan.apply_overrides(plan, bad)
    with pytest.raises(ValueError):
        g2_plan.apply_overrides(plan, {}, backend="tgi")


# ---------- labels ----------

ROWS = [{"attempt": "a001", "valid": True, "turns": 5, "passed": {"strong": False}, "last_test_exit": 0},
        {"attempt": "a002", "valid": True, "turns": 4, "passed": {"strong": True}},
        {"attempt": "a003", "valid": False, "turns": 4, "passed": {"strong": False}}]
GOOD = {"attempt": "a001", "first_wrong_turn": 3, "phase": "repair", "mistake": "M5",
        "evidence": "turn 3 writes a merge with the wrong gap rule", "note": "close but different", "labeler": "human"}


def test_label_validation():
    ok, errors = g2_labels.validate_all([GOOD], ROWS, "strong")
    assert ok == [GOOD] and errors == []
    bad = [{**GOOD, "phase": "fix"}, {**GOOD, "mistake": "M11"}, {**GOOD, "first_wrong_turn": 9},
           {**GOOD, "attempt": "a002"}, {**GOOD, "attempt": "a003"}, {**GOOD, "attempt": "a999"},
           {**GOOD, "evidence": ""}, {**GOOD, "mistake": "other", "note": "short"}, {"attempt": "a001"},
           {**GOOD, "labeler": "gpt"}]
    for label in bad:
        assert g2_labels.validate_all([label], ROWS, "strong")[1], label
    ok, errors = g2_labels.validate_all([GOOD, GOOD], ROWS, "strong")
    assert len(ok) == 1 and "twice" in errors[0][2]
    assert set(g2_labels.MISTAKES) == {f"M{i}" for i in range(1, 11)}


def _turn(n, name, reply, observation="", path=None):
    action = {"name": name, **({"path": path} if path else {})}
    return {"type": "turn", "turn": n, "reply": reply, "action": action, "observation": observation}


def test_heuristic_suggestions():
    read = _turn(1, "read_file", "<read_file path='freebusy/model.py'/>", "Content of ...", "freebusy/model.py")
    write = _turn(2, "write_file", "<write_file path='freebusy/merge.py'>\nimport datetime\n</write_file>", "Wrote", "freebusy/merge.py")
    tests_ok = _turn(3, "run_tests", "<run_tests/>", "Exit code: 0\nOK")
    finish = _turn(4, "finish", "<finish>done</finish>", "Finished.")
    diff = {"type": "diff", "changed": ["freebusy/merge.py"], "added": [], "deleted": []}
    row = ROWS[0]
    s = g2_labels.suggest_label([read, write, tests_ok, finish, diff], row, {"freebusy/merge.py"})
    assert (s["mistake"], s["phase"], s["first_wrong_turn"], s["also"]) == ("M5", "repair", 2, [])
    assert not g2_labels.validate_label(s, row, "strong")  # a suggestion is itself a valid label
    no_test = g2_labels.suggest_label([read, write, finish, diff], row, {"freebusy/merge.py"})
    assert no_test["also"] == ["M6"]
    gaming = _turn(2, "write_file", "<write_file path='tests/test_merge.py'>\n</write_file>", "Wrote", "tests/test_merge.py")
    assert g2_labels.suggest_label([read, gaming, finish], row)["mistake"] == "M3"
    numpy = _turn(2, "write_file", "<write_file path='freebusy/merge.py'>\nimport numpy as np\n</write_file>", "", "freebusy/merge.py")
    assert g2_labels.suggest_label([read, numpy, finish], row)["mistake"] == "M1"
    # The string below is fake model output that the heuristic must flag (M10). It is never executed.
    shell = _turn(2, "write_file", "<write_file path='freebusy/merge.py'>\nx = eval(s)\n</write_file>", "", "freebusy/merge.py")
    prose = _turn(2, "write_file", "I will not use eval( here.\n<write_file path='freebusy/merge.py'>\nx = 1\n</write_file>",
                  "", "freebusy/merge.py")
    assert g2_labels.suggest_label([read, prose], row)["mistake"] != "M10"  # prose is not code
    assert g2_labels.suggest_label([read, shell], row)["mistake"] == "M10"
    escape = _turn(1, "read_file", "<read_file path='../solution/merge.py'/>", "Error: path leaves the repository")
    assert g2_labels.suggest_label([escape, write], row)["mistake"] == "M7"
    scope = {"type": "diff", "changed": ["freebusy/merge.py", "freebusy/model.py"], "added": [], "deleted": []}
    assert g2_labels.suggest_label([read, write, scope], row, {"freebusy/merge.py"})["mistake"] == "M4"
    assert g2_labels.suggest_label([write, tests_ok], row)["mistake"] == "M8"
    assert g2_labels.suggest_label([read], {**row, "end_reason": "format_errors"})["mistake"] == "other"
    assert g2_labels.suggest_label([read, write], {**row, "last_test_exit": 1})["mistake"] == "M2"
    cmp = g2_labels.compare([GOOD], [s])
    assert cmp == {"n": 1, "same phase": 1, "same mistake": 1, "same first wrong turn": 0}


# ---------- the notebook ----------

def _code_cells(nb):
    return [c for c in nb["cells"] if c["cell_type"] == "code"]


def _as_python(src):
    """Replace IPython magics (! and % lines) with pass, keeping indentation."""
    return "\n".join(re.sub(r"^(\s*)[!%].*$", r"\1pass", line) for line in src.split("\n"))


def test_notebook_is_valid_and_clean():
    nb = json.loads(NOTEBOOK.read_text(encoding="utf-8"))
    assert nb["nbformat"] == 4 and nb["nbformat_minor"] >= 5
    try:
        import nbformat
        nbformat.validate(nbformat.reads(NOTEBOOK.read_text(encoding="utf-8"), as_version=4))
    except ImportError:
        pass
    meta = nb["metadata"]
    assert meta["accelerator"] == "GPU" and meta["colab"]["gpuType"] == "T4"
    assert meta["kernelspec"]["name"] == "python3"
    ids = [c["id"] for c in nb["cells"]]
    assert len(set(ids)) == len(ids) and all(re.fullmatch(r"[A-Za-z0-9_-]{1,64}", i) for i in ids)
    for cell in _code_cells(nb):
        src = "".join(cell["source"])
        assert cell["outputs"] == [] and cell["execution_count"] is None
        ast.parse(_as_python(src))
        assert len(src.split("\n")) <= 20, f"code cell {cell['id']} is too long"
        for line in src.split("\n"):
            if "pip install" in line:
                pkgs = [t for t in line.split("pip install", 1)[1].split() if not t.startswith("-")]
                assert pkgs and all("==" in p for p in pkgs), line


def test_notebook_first_cell_and_required_parts():
    nb = json.loads(NOTEBOOK.read_text(encoding="utf-8"))
    first = nb["cells"][0]
    head = "".join(first["source"])
    assert first["cell_type"] == "markdown" and head.startswith("# G2")
    for need in ("**Goal.**", "Polaris", "Time and GPU budget", "T4", "L4", "A100", "Done when",
                 g2_build_notebook.HONEST, "20 or more graded attempts", "Five failed attempts"):
        assert need in head, need
    assert g2_build_notebook.HONEST == ("Written and CPU-smoke-tested by an automated build on 2026-10-20. "
                                        "Never run on a GPU. Expect to fix version issues; pin what works and note it.")
    text = NOTEBOOK.read_text(encoding="utf-8")
    assert ("git clone --depth 1 --filter=blob:none --sparse https://github.com/ZelinZhu-Richard/"
            "ZelinZhu-Richard.github.io repo && cd repo && git sparse-checkout set workspace/repolarisdm/labs") in text
    assert "nvidia-smi" in text and "matrix: OK" in text and "lab_f_self_check" in text
    modules = set()
    for cell in _code_cells(nb):
        for node in ast.walk(ast.parse(_as_python("".join(cell["source"])))):
            if isinstance(node, ast.Import):
                modules |= {a.name for a in node.names if a.name.startswith("g2_")}
            elif isinstance(node, ast.Name) and node.id.startswith("g2_"):
                modules.add(node.id)
    assert {"g2_plan", "g2_tasks", "g2_agent", "g2_runs", "g2_stats", "g2_labels"} <= modules
    for module in modules:
        assert (COLAB / f"{module}.py").is_file(), module
    install = next(i for i, c in enumerate(_code_cells(nb)) if "pip install" in "".join(c["source"]))
    assert not any("import torch" in "".join(c["source"]) for c in _code_cells(nb)[:install])


def test_notebook_settings_survive_a_restart_and_custody_cells_exist():
    nb = json.loads(NOTEBOOK.read_text(encoding="utf-8"))
    code = ["".join(c["source"]) for c in _code_cells(nb)]
    settings = next(c for c in code if "RUN_NAME" in c and "MODEL_KEY" in c)
    assert "choose_plan(g2_plan.detect_gpu(), MODEL_KEY)" in settings and "PLAN_OVERRIDES" in settings
    assert "{BACKEND}" in settings                                   # the backend is part of the run name
    install = next(i for i, c in enumerate(code) if "pip install" in c)
    assert code.index(settings) > install                             # after the restart
    joined = "\n".join(code)
    assert "lock_lab_f" in joined and "lock_down" in joined and "probe(" in joined
    assert '"require_sandbox": True' in joined and '"backend": BACKEND' in joined
    assert joined.index("lock_lab_f") < joined.index("run_one(") < joined.index("run_many(")
    text = NOTEBOOK.read_text(encoding="utf-8")
    assert "drive.mount" not in text and "(not 5.17.0)" not in text and "under Tools" not in text
    assert 'glob.glob("/content/repo/workspace/repolarisdm/labs/*/_key")' in joined


def test_notebook_matches_its_builder():
    assert NOTEBOOK.read_text(encoding="utf-8") == g2_build_notebook.render()


def test_no_forbidden_strings_secrets_or_answer_key():
    for path in [NOTEBOOK, *HELPERS, Path(__file__)]:
        text = path.read_text(encoding="utf-8")
        for rx, name in FORBIDDEN:
            assert not rx.search(text), f"{path.name} contains {name}: {rx.search(text).group(0)}"
        assert not re.search(r"hf_[A-Za-z0-9]{20,}", text), f"{path.name} looks like it holds a token"
    for path in [NOTEBOOK, *HELPERS]:
        text = path.read_text(encoding="utf-8")
        assert "_key/" not in text and "def merge_busy" not in text, path.name
