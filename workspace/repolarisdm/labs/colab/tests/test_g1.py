"""CPU smoke test for G1 (pass@k is a distribution).

No GPU, torch or vLLM needed. It checks the task set, the grader, the
statistics, the GPU plan logic, the sampling bookkeeping, the report and the
notebook file. The model calls themselves are NOT tested here.

Run from labs/colab:
    python -m pip install -r tests/requirements-g1.txt     (pytest, matplotlib, nbformat)
    python -m pytest -q -p no:cacheprovider tests/test_g1.py
"""

from __future__ import annotations

import ast
import itertools
import json
import math
import os
import random
import re
import sys
import time
from collections import Counter
from datetime import date, timedelta
from fractions import Fraction
from pathlib import Path

import pytest

LAB = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(LAB))

import g1_gpu  # noqa: E402
import g1_grade  # noqa: E402
import g1_make_notebook  # noqa: E402
import g1_report  # noqa: E402
import g1_sample  # noqa: E402
import g1_stats  # noqa: E402
import g1_tasks  # noqa: E402

TASKS = g1_tasks.load_tasks()
BY_ID = {t.task_id: t for t in TASKS}
NOTEBOOK = LAB / "g1-pass-at-k.ipynb"


def fn(task_id: str):
    """Load a reference solution in-process (trusted code written for this lab)."""
    task = BY_ID[task_id]
    namespace: dict = {}
    exec(compile(task.reference, task.task_id, "exec"), namespace)
    return namespace[task.entry_point]


def raises(func, exc, *args) -> bool:
    try:
        func(*args)
    except exc:
        return True
    return False


# --------------------------------------------------------------------------- task set

def test_task_set_shape():
    assert len(TASKS) == 20
    assert len({t.entry_point for t in TASKS}) == 20
    for task in TASKS:
        assert task.difficulty in {"easy", "medium", "hard"}
        assert g1_tasks.count_asserts(task.tests) >= 10, task.task_id
        prompt_fn = ast.parse(task.prompt + "    pass\n").body[0]
        assert isinstance(prompt_fn, ast.FunctionDef) and prompt_fn.name == task.entry_point
        assert ast.get_docstring(prompt_fn), task.task_id
        ref_fn = next(n for n in ast.parse(task.reference).body
                      if isinstance(n, ast.FunctionDef) and n.name == task.entry_point)
        assert [a.arg for a in ref_fn.args.args] == [a.arg for a in prompt_fn.args.args]
        assert "def check(candidate)" in task.tests
        assert "check(" not in task.prompt and "assert" not in task.prompt
        assert task.wrong_note


def test_canary_is_in_the_file_but_never_in_a_prompt():
    source = (LAB / "g1_tasks.py").read_text(encoding="utf-8")
    assert re.search(r"canary GUID [0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
                     g1_tasks.CANARY)
    assert g1_tasks.CANARY in source
    for task in TASKS:
        message = g1_sample.build_messages(task)[0]["content"]
        assert g1_tasks.CANARY not in message
        assert task.tests not in message and task.reference not in message


@pytest.mark.parametrize("task", TASKS, ids=lambda t: t.task_id)
def test_reference_passes_in_process(task):
    namespace: dict = {}
    exec(compile(task.reference, "ref", "exec"), namespace)
    tests: dict = {}
    exec(compile(task.tests, "tests", "exec"), tests)
    tests["check"](namespace[task.entry_point])


def test_grader_accepts_references_and_rejects_stub_and_wrong():
    result = g1_grade.validate_task_set(TASKS)
    assert result["ok"], result["summary"]
    for row in result["rows"]:
        assert row["reference"] == "pass"
        assert row["do_nothing"] != "pass"
        assert row["wrong"] != "pass"


# --------------------------------------------- independent oracles (task validity)

def _longest_balanced_subsequence(s: str) -> int:
    pairs = {")": "(", "]": "[", "}": "{"}
    best = 0
    for mask in range(1 << len(s)):
        stack, ok, length = [], True, 0
        for i, ch in enumerate(s):
            if not mask >> i & 1:
                continue
            length += 1
            if ch in "([{":
                stack.append(ch)
            elif stack and stack[-1] == pairs[ch]:
                stack.pop()
            else:
                ok = False
                break
        if ok and not stack:
            best = max(best, length)
    return best


def test_oracle_bracket_insertions():
    f = fn("g1-03-bracket-insertions")
    rng = random.Random(3)
    for _ in range(300):
        s = "".join(rng.choice("()[]{}") for _ in range(rng.randint(0, 9)))
        # Fewest insertions = length - longest balanced subsequence.
        assert f(s) == len(s) - _longest_balanced_subsequence(s), s


def test_oracle_balanced_ab():
    f = fn("g1-12-balanced-ab")
    rng = random.Random(12)
    for _ in range(400):
        s = "".join(rng.choice("abc") for _ in range(rng.randint(0, 14)))
        brute = max([j - i for i in range(len(s) + 1) for j in range(i, len(s) + 1)
                     if s[i:j].count("a") == s[i:j].count("b")])
        assert f(s) == brute, s


def test_oracle_next_palindrome():
    f = fn("g1-16-next-palindrome")
    for n in range(0, 3000):
        m = n + 1
        while str(m) != str(m)[::-1]:
            m += 1
        assert f(n) == m, n


def test_oracle_kth_pair_sum():
    f = fn("g1-14-kth-pair-sum")
    rng = random.Random(14)
    for _ in range(200):
        a = sorted(rng.randint(-9, 9) for _ in range(rng.randint(1, 6)))
        b = sorted(rng.randint(-9, 9) for _ in range(rng.randint(1, 6)))
        sums = sorted(x + y for x in a for y in b)
        k = rng.randint(1, len(sums))
        assert f(a, b, k) == sums[k - 1]


def test_oracle_merge_windows():
    f = fn("g1-05-merge-windows")
    rng = random.Random(5)
    for _ in range(300):
        windows = [(rng.randint(-5, 15), rng.randint(-5, 15)) for _ in range(rng.randint(0, 6))]
        gap = rng.randint(0, 3)
        cells = sorted({t for s, e in windows for t in range(s, e)})
        expected, run = [], []
        for t in cells:
            if run and t - run[-1] - 1 > gap:
                expected.append((run[0], run[-1] + 1))
                run = []
            run.append(t)
        if run:
            expected.append((run[0], run[-1] + 1))
        assert f(windows, gap) == expected, (windows, gap)


def test_oracle_rotate_ring():
    f = fn("g1-08-rotate-ring")
    rng = random.Random(8)

    def one_step(grid):  # move every ring value one cell clockwise, by hand
        rows, cols = len(grid), len(grid[0])
        out = [row[:] for row in grid]
        for c in range(1, cols):
            out[0][c] = grid[0][c - 1]
        for r in range(1, rows):
            out[r][cols - 1] = grid[r - 1][cols - 1]
        for c in range(cols - 2, -1, -1):
            out[rows - 1][c] = grid[rows - 1][c + 1]
        for r in range(rows - 2, -1, -1):
            out[r][0] = grid[r + 1][0]
        return out

    for _ in range(100):
        rows, cols = rng.randint(2, 5), rng.randint(2, 5)
        grid = [[rng.randint(0, 99) for _ in range(cols)] for _ in range(rows)]
        ring = 2 * (rows + cols) - 4
        k = rng.randint(0, 2 * ring)
        expected = grid
        for _ in range(k):
            expected = one_step(expected)
        assert f(grid, k) == expected
        assert f(grid, k - ring) == expected  # negative k = the other direction


def test_oracle_nth_weekday():
    f = fn("g1-02-nth-weekday")
    rng = random.Random(2)
    for _ in range(300):
        year, month = rng.randint(1990, 2040), rng.randint(1, 12)
        weekday, n = rng.randint(0, 6), rng.choice([1, 2, 3, 4, 5, -1])
        day, found = date(year, month, 1), []
        while day.month == month:
            if day.weekday() == weekday:
                found.append(day.isoformat())
            day += timedelta(days=1)
        expected = found[-1] if n == -1 else (found[n - 1] if n <= len(found) else None)
        assert f(year, month, weekday, n) == expected


def test_oracle_count_climbs():
    f = fn("g1-11-count-climbs")
    rng = random.Random(11)

    def brute(position, n, steps, bad):
        if position in bad or position > n:
            return 0
        if position == n:
            return 1
        return sum(brute(position + s, n, steps, bad) for s in steps)

    for _ in range(200):
        n = rng.randint(0, 12)
        steps = rng.sample(range(1, 5), rng.randint(1, 3))
        bad = set(rng.sample(range(0, 13), rng.randint(0, 3)))
        assert f(n, steps, sorted(bad)) == brute(0, n, steps, bad)


def test_oracle_strict_roman():
    f = fn("g1-15-strict-roman")
    table = [(1000, "M"), (900, "CM"), (500, "D"), (400, "CD"), (100, "C"), (90, "XC"),
             (50, "L"), (40, "XL"), (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I")]
    canonical = {}
    for value in range(1, 4000):
        rest, out = value, ""
        for v, sym in table:
            while rest >= v:
                out, rest = out + sym, rest - v
        canonical[out] = value
        assert f(out) == value
    for length in range(1, 4):
        for letters in itertools.product("IVXLCDM", repeat=length):
            text = "".join(letters)
            if text not in canonical:
                assert raises(f, ValueError, text), text


def test_oracle_compress_ranges_round_trip():
    f = fn("g1-01-compress-ranges")
    rng = random.Random(1)
    for _ in range(300):
        nums = [rng.randint(-8, 8) for _ in range(rng.randint(0, 12))]
        text = f(nums)
        back = set()
        for part in filter(None, text.split(",")):
            if ".." in part:
                lo, hi = (int(x) for x in part.split(".."))
                assert hi - lo >= 2
                back.update(range(lo, hi + 1))
            else:
                back.add(int(part))
        assert back == set(nums)


def _expand_oracle(pattern: str) -> str:
    def flat(text: str) -> str:
        return "".join(ch * (int(num) if num else 1) for ch, num in re.findall(r"([a-z])(\d*)", text))

    inner = re.compile(r"\(([a-z0-9]*)\)(\d*)")
    while "(" in pattern:
        pattern = inner.sub(lambda m: flat(m.group(1)) * (int(m.group(2)) if m.group(2) else 1),
                            pattern, count=1)
    return flat(pattern)


def test_oracle_expand_groups():
    f = fn("g1-04-expand-groups")
    rng = random.Random(4)

    def make(depth: int) -> str:
        out = []
        for _ in range(rng.randint(0, 3)):
            count = rng.choice(["", "", "0", "1", "2", "3", "11"])
            if depth < 2 and rng.random() < 0.4:
                out.append("(" + make(depth + 1) + ")" + count)
            else:
                out.append(rng.choice("abc") + count)
        return "".join(out)

    for _ in range(400):
        pattern = make(0)
        assert f(pattern) == _expand_oracle(pattern), pattern


def test_oracle_wrap_words_properties():
    f = fn("g1-19-wrap-words")
    rng = random.Random(19)
    for _ in range(300):
        words = ["".join(rng.choice("xyz") for _ in range(rng.randint(1, 9)))
                 for _ in range(rng.randint(0, 8))]
        text = rng.choice([" ", "  ", "\n", "\t"]).join(words)
        width = rng.randint(1, 8)
        lines = f(text, width)
        assert all(0 < len(line) <= width for line in lines)
        assert "".join(line.replace(" ", "") for line in lines) == "".join(words)
        for first, second in zip(lines, lines[1:]):  # greedy: the next piece did not fit
            assert len(first) + 1 + len(second.split(" ")[0]) > width


def test_oracle_compare_versions_is_consistent():
    f = fn("g1-09-compare-versions")
    rng = random.Random(9)

    def version() -> str:
        release = ".".join(str(rng.randint(0, 11)) for _ in range(rng.randint(1, 3)))
        if rng.random() < 0.5:
            release += "-" + rng.choice(["alpha", "beta", "rc"]) + rng.choice(["", "0", "1", "2", "10"])
        return release

    for _ in range(500):
        a, b = version(), version()
        assert f(a, a) == 0
        assert f(a, b) == -f(b, a)
        release, _, tag = a.partition("-")
        padded = release + ".0" + ("-" + tag if tag else "")
        assert f(padded, a) == 0  # trailing zeros never matter
        if tag:
            assert f(a, release) == -1  # a tag is lower than no tag


def test_oracle_rpn_fraction():
    f = fn("g1-20-rpn-fraction")
    rng = random.Random(20)

    def tree(depth):
        if depth == 0 or rng.random() < 0.3:
            v = rng.randint(-9, 9)
            return Fraction(v), [str(v)]
        op = rng.choice("+-*/")
        va, ta = tree(depth - 1)
        vb, tb = tree(depth - 1)
        if op == "/" and vb == 0:
            return va, ta
        value = {"+": va + vb, "-": va - vb, "*": va * vb, "/": va / vb if vb else None}[op]
        return value, ta + tb + [op]

    for _ in range(300):
        value, tokens = tree(4)
        expected = str(value.numerator) if value.denominator == 1 else f"{value.numerator}/{value.denominator}"
        assert f(tokens) == expected, tokens


def test_oracle_parse_duration():
    f = fn("g1-07-parse-duration")
    rng = random.Random(7)
    seconds = {"d": 86400, "h": 3600, "m": 60, "s": 1}
    for _ in range(300):
        parts = [(rng.randint(0, 120), rng.choice("dhms")) for _ in range(rng.randint(1, 5))]
        text = " " * rng.randint(0, 2) + "".join(
            f"{num}{unit}" + " " * rng.randint(0, 2) for num, unit in parts)
        assert f(text) == sum(num * seconds[unit] for num, unit in parts), text


def test_oracle_top_words():
    f = fn("g1-06-top-words")
    rng = random.Random(6)
    for _ in range(300):
        words = [rng.choice(["a", "A", "b", "B", "c", "dd", "Dd"]) for _ in range(rng.randint(0, 10))]
        k = rng.randint(-1, 5)
        counts = Counter(w.lower() for w in words)
        order = list(dict.fromkeys(w.lower() for w in words))  # first-appearance order
        expected = sorted(order, key=lambda w: -counts[w])[:max(k, 0)]  # stable sort keeps ties
        assert f(words, k) == expected


def test_oracle_torus_islands():
    f = fn("g1-10-torus-islands")
    rng = random.Random(10)
    for _ in range(300):
        rows, cols = rng.randint(1, 5), rng.randint(1, 5)
        grid = ["".join(rng.choice("#..") for _ in range(cols)) for _ in range(rows)]
        parent = {}

        def find(x):
            while parent[x] != x:
                parent[x] = parent[parent[x]]
                x = parent[x]
            return x

        land = [(r, c) for r in range(rows) for c in range(cols) if grid[r][c] == "#"]
        for cell in land:
            parent[cell] = cell
        for r, c in land:
            for nr, nc in (((r + 1) % rows, c), (r, (c + 1) % cols)):
                if grid[nr][nc] == "#":
                    parent[find((r, c))] = find((nr, nc))
        assert f(grid) == len({find(cell) for cell in land}), grid


def test_oracle_dependency_layers_properties():
    f = fn("g1-17-dependency-layers")
    rng = random.Random(17)
    names = list("abcdefg")
    for _ in range(300):
        order = rng.sample(names, rng.randint(1, 7))
        deps = {}
        for i, task in enumerate(order):
            if rng.random() < 0.8:
                deps[task] = rng.sample(order[:i], rng.randint(0, i)) if i else []
        layers = f(deps)
        level = {t: i for i, layer in enumerate(layers) for t in layer}
        assert all(layer == sorted(layer) for layer in layers)
        everyone = set(deps) | {r for reqs in deps.values() for r in reqs}
        assert set(level) == everyone
        for task, reqs in deps.items():
            assert all(level[r] < level[task] for r in reqs)
            if level[task] > 0:
                assert max(level[r] for r in reqs) == level[task] - 1
        if len(order) >= 2:  # add a back edge to make a cycle
            cyclic = {k: list(v) for k, v in deps.items()}
            cyclic.setdefault(order[0], []).append(order[-1])
            cyclic.setdefault(order[-1], []).append(order[0])
            assert raises(f, ValueError, cyclic)


# --------------------------------------------------------------------------- grader

def test_extract_code_variants():
    task = BY_ID["g1-18-window-spreads"]
    ref = task.reference
    fenced = f"Here you go:\n```python\n{ref}```\nThis works."
    assert g1_grade.extract_code(fenced, task.entry_point)[1] == "function"
    two = f"```python\nprint('helper')\n```\n\n```python\n{ref}```"
    code, how = g1_grade.extract_code(two, task.entry_point)
    assert how == "function" and "def window_spreads(" in code and "helper" not in code
    plain = f"Sure. The function is below.\n{ref}"
    code, how = g1_grade.extract_code(plain, task.entry_point)
    assert how == "function" and code.startswith("def window_spreads(")
    unclosed = f"```python\n{ref}"  # cut off at max_tokens before the closing fence
    assert g1_grade.extract_code(unclosed, task.entry_point)[1] == "function"
    body = "```\n    if width < 1:\n        raise ValueError('w')\n    return []\n```"
    code, how = g1_grade.extract_code(body, task.entry_point, task.prompt)
    assert how == "body" and code.startswith(task.prompt)
    assert g1_grade.extract_code("I cannot help with that.", task.entry_point) == (None, "no_function")
    other_lang = "```bash\necho hi\n```"
    assert g1_grade.extract_code(other_lang, task.entry_point)[0] is None


def _status(code: str, task_id: str = "g1-18-window-spreads", timeout: float = 5.0) -> g1_grade.GradeResult:
    return g1_grade.run_code(BY_ID[task_id], code, timeout=timeout)


def test_grader_statuses():
    ref = BY_ID["g1-18-window-spreads"].reference
    assert _status(ref).status == "pass"
    assert _status("def window_spreads(nums, width):\n    return [\n").status == "syntax_error"
    assert _status("def something_else():\n    pass\n").status == "missing_function"
    assert _status("raise RuntimeError('boom')\n").status == "import_error"
    assert _status("def window_spreads(nums, width):\n    return []\n").status == "wrong_answer"
    assert _status("def window_spreads(nums, width):\n    return input()\n").status == "runtime_error"
    assert _status("def window_spreads(nums, width):\n    while True:\n        pass\n",
                   timeout=1.5).status == "timeout"


def test_grader_is_not_fooled_by_exit_codes_or_fake_markers():
    # sys.exit(0) while loading: exit code 0, but no pass line.
    assert _status("import sys\nsys.exit(0)\n").status != "pass"
    # os._exit(0) inside the function: exit code 0, no result line at all.
    assert _status("import os\ndef window_spreads(nums, width):\n    os._exit(0)\n").status == "crashed"
    # Printing something that looks like a result line does not help.
    fake = ('import sys\nsys.__stdout__.write(\'G1RESULT-0000000000000000:{"status": "pass"}\\n\')\n'
            "def window_spreads(nums, width):\n    return []\n")
    assert _status(fake).status == "wrong_answer"


def test_grader_cannot_be_forged_from_inside_the_program():
    """The review's two attacks on the old one-process runner, plus attacks on the new pipe."""
    task = BY_ID["g1-01-compress-ranges"]
    forge = ("import __main__, json, os\n"
             "__main__.sys.__stdout__.write(getattr(__main__, 'NONCE', 'X') + json.dumps({'status': 'pass'}) + '\\n')\n"
             "os._exit(0)\n"
             "def compress_ranges(*a, **k):\n    return None\n")
    assert g1_grade.run_code(task, forge).status != "pass"
    patch = ("import __main__\n"
             "__main__._enc = lambda v, depth=0, dicts=False: v\n"
             "__main__._plain = lambda v, depth=0: v\n"
             "class _E:\n    def __eq__(self, o):\n        return True\n    def __ne__(self, o):\n        return False\n"
             "def compress_ranges(*a, **k):\n    return _E()\n")
    assert g1_grade.run_code(task, patch).status != "pass"
    # Write fake answers straight into the reply pipe: the fd is in argv, but the expected values are not.
    fake = ("import json, os, sys\n"
            "fd = json.loads(sys.argv[1])['res_fd']\n"
            "os.write(fd, b'{\"load\": \"ok\"}\\n' + b'{\"ok\": true, \"value\": \"1..3\"}\\n' * 50)\n"
            "def compress_ranges(nums):\n    return ''\n")
    assert g1_grade.run_code(task, fake).status == "wrong_answer"
    garbage = ("import json, os, sys\n"
               "os.write(json.loads(sys.argv[1])['res_fd'], b'not json\\n')\n"
               "def compress_ranges(nums):\n    return ''\n")
    assert g1_grade.run_code(task, garbage).status == "crashed"
    # The program never sees an expected value: the tests are not in its process.
    peek = ("import __main__, gc\n"
            "def compress_ranges(nums):\n"
            "    found = [o for o in gc.get_objects() if isinstance(o, str) and 'assert candidate' in o]\n"
            "    if found:\n        raise SystemExit(found[0])\n"
            "    return ''\n")
    assert g1_grade.run_code(task, peek).status == "wrong_answer"


def test_grader_keeps_side_effects_and_exception_types():
    rotate = BY_ID["g1-08-rotate-ring"]
    mutating = rotate.reference.replace("def rotate_ring", "def _ok") + (
        "\ndef rotate_ring(grid, k):\n    out = _ok(grid, k)\n    grid[0][0] = 99\n    return out\n")
    result = g1_grade.run_code(rotate, mutating)
    assert result.status == "wrong_answer" and "square ==" in result.detail
    duration = BY_ID["g1-07-parse-duration"]
    subclass = "class ParseError(ValueError):\n    pass\n" + duration.reference.replace("raise ValueError", "raise ParseError")
    assert g1_grade.run_code(duration, subclass).status == "pass"
    leaves = ("def window_spreads(nums, width):\n    raise SystemExit(0)\n")
    assert g1_grade.run_code(BY_ID["g1-18-window-spreads"], leaves).status != "pass"


def test_grader_rejects_always_equal_objects():
    hack = ("class Anything:\n    def __eq__(self, other):\n        return True\n"
            "def window_spreads(nums, width):\n    if width < 1:\n        raise ValueError\n"
            "    return Anything()\n")
    result = _status(hack)
    assert result.status == "runtime_error" and "unexpected result type" in result.detail


def test_grader_blocks_network_and_hides_prints():
    ref = BY_ID["g1-18-window-spreads"].reference.replace("def window_spreads", "def _real")
    code = (ref + "\nimport socket\n"
            "def window_spreads(nums, width):\n"
            "    print('noise ' * 1000)\n"
            "    try:\n"
            "        socket.getaddrinfo('example.invalid', 80)\n"
            "    except OSError as exc:\n"
            "        if 'disabled in the G1 grader' in str(exc):\n"
            "            return _real(nums, width)\n"
            "    return None\n")
    assert _status(code).status == "pass"


def test_timeout_kills_child_processes(tmp_path):
    pid_file = tmp_path / "child.pid"
    code = ("import subprocess, sys, time\n"
            "def window_spreads(nums, width):\n"
            "    child = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(60)'])\n"
            f"    open({str(pid_file)!r}, 'w').write(str(child.pid))\n"
            "    while True:\n"
            "        time.sleep(0.05)\n")
    assert _status(code, timeout=2.0).status == "timeout"
    pid = int(pid_file.read_text())
    for _ in range(40):
        try:
            os.kill(pid, 0)
        except ProcessLookupError:
            break
        time.sleep(0.05)
    else:
        os.kill(pid, 9)
        pytest.fail("the child process survived the timeout")


def test_grade_records_runs_each_distinct_program_once(monkeypatch):
    task = BY_ID["g1-06-top-words"]
    calls = []
    real = g1_grade.run_code

    def counting(t, code, timeout=g1_grade.DEFAULT_TIMEOUT):
        calls.append(code)
        return real(t, code, timeout)

    monkeypatch.setattr(g1_grade, "run_code", counting)
    good = f"```python\n{task.reference}```"
    bad = f"```python\n{task.wrong}```"
    records = [{"task_id": task.task_id, "temperature": 0.2, "sample_index": i,
                "completion": good if i % 3 else bad} for i in range(9)]
    records.append({"task_id": task.task_id, "temperature": 0.2, "sample_index": 9,
                    "completion": "no code here"})
    graded = g1_grade.grade_records(records, TASKS, workers=2)
    assert len(calls) == 2
    assert [r["passed"] for r in graded] == [bool(i % 3) for i in range(9)] + [False]
    assert graded[-1]["status"] == "no_code"
    assert graded[1]["program_id"] == graded[2]["program_id"] != graded[0]["program_id"]


# --------------------------------------------------------------------------- statistics

def test_pass_at_k_known_values():
    assert g1_stats.pass_at_k(50, 10, 1) == pytest.approx(0.20)
    assert round(g1_stats.pass_at_k(50, 10, 5), 4) == 0.6894
    assert round(g1_stats.pass_at_k(50, 10, 10), 4) == 0.9175
    assert g1_stats.pass_at_k(50, 0, 10) == 0.0
    assert g1_stats.pass_at_k(50, 50, 1) == 1.0
    assert g1_stats.pass_at_k(50, 45, 10) == 1.0  # fewer than k failures exist


def test_pass_hat_k_known_values():
    assert round(g1_stats.pass_hat_k(50, 10, 5), 6) == 0.000119
    assert g1_stats.pass_hat_k(50, 49, 5) == pytest.approx(0.90)
    assert g1_stats.pass_hat_k(50, 49, 10) == pytest.approx(0.80)
    assert g1_stats.pass_hat_k(50, 4, 5) == 0.0
    assert g1_stats.pass_hat_k(50, 50, 10) == 1.0


def test_pass_metrics_match_brute_force_enumeration():
    n = 6
    for c in range(n + 1):
        outcomes = [1] * c + [0] * (n - c)
        for k in range(1, n + 1):
            subsets = list(itertools.combinations(outcomes, k))
            at_least_one = sum(any(s) for s in subsets) / len(subsets)
            all_pass = sum(all(s) for s in subsets) / len(subsets)
            assert g1_stats.pass_at_k(n, c, k) == pytest.approx(at_least_one)
            assert g1_stats.pass_hat_k(n, c, k) == pytest.approx(all_pass)
            assert g1_stats.pass_at_k(n, c, k) == pytest.approx(1 - math.comb(n - c, k) / math.comb(n, k))


def test_pass_metrics_reject_bad_input():
    with pytest.raises(ValueError):
        g1_stats.pass_at_k(5, 6, 1)
    with pytest.raises(ValueError):
        g1_stats.pass_at_k(5, 2, 6)
    with pytest.raises(ValueError):
        g1_stats.pass_hat_k(5, 2, 0)
    with pytest.raises(ValueError):
        g1_stats.wilson(1, 0)


def test_wilson_known_values():
    def r3(pair):
        return tuple(round(x, 3) for x in pair)

    assert r3(g1_stats.wilson(10, 50)) == (0.112, 0.330)
    assert r3(g1_stats.wilson(0, 50)) == (0.0, 0.071)
    assert r3(g1_stats.wilson(50, 50)) == (0.929, 1.0)
    assert r3(g1_stats.wilson(14, 20)) == (0.481, 0.855)  # Chapter 9 example
    assert r3(g1_stats.wilson(4, 5)) == (0.376, 0.964)    # Chapter 9 self-check


def test_percentile():
    values = [0.0, 1.0, 2.0, 3.0, 4.0]
    assert g1_stats.percentile(values, 0) == 0.0
    assert g1_stats.percentile(values, 50) == 2.0
    assert g1_stats.percentile(values, 100) == 4.0
    assert g1_stats.percentile(values, 12.5) == pytest.approx(0.5)


def test_cluster_bootstrap():
    fns = {"pass@1": lambda n, c: g1_stats.pass_at_k(n, c, 1)}
    assert g1_stats.cluster_bootstrap([(50, 50)] * 20, fns, draws=200) == {"pass@1": (1.0, 1.0)}
    counts = [(50, c) for c in (0, 0, 5, 10, 20, 25, 30, 40, 50, 50)]
    first = g1_stats.cluster_bootstrap(counts, fns, draws=500, seed=7)
    assert first == g1_stats.cluster_bootstrap(counts, fns, draws=500, seed=7)
    lo, hi = first["pass@1"]
    estimate = sum(c / n for n, c in counts) / len(counts)
    assert lo < estimate < hi
    narrow = g1_stats.cluster_bootstrap(counts, fns, draws=500, seed=7, within=False)["pass@1"]
    assert narrow[1] - narrow[0] <= hi - lo + 0.02


def test_paired_difference_beats_comparing_two_intervals():
    """Two temperatures on the same 20 problems of very different difficulty. B is 6 points better on every
    problem. The two separate intervals overlap, but the paired interval is clearly above 0."""
    n = 200
    base = [0.05 + 0.045 * i for i in range(20)]
    per_a = {f"p{i}": (n, round(p * n)) for i, p in enumerate(base)}
    per_b = {f"p{i}": (n, round((p + 0.06) * n)) for i, p in enumerate(base)}
    fn = lambda n_, c_: g1_stats.pass_at_k(n_, c_, 1)  # noqa: E731
    paired = g1_stats.paired_difference(per_a, per_b, fn, draws=1000, seed=1)
    expected = sum(c for _, c in per_b.values()) / (20 * n) - sum(c for _, c in per_a.values()) / (20 * n)
    assert paired["estimate"] == pytest.approx(expected) and paired["problems"] == 20
    assert 0 < paired["lo"] < paired["estimate"] < paired["hi"]
    sep = {name: g1_stats.cluster_bootstrap(list(per.values()), {"pass@1": fn}, draws=1000, seed=1)["pass@1"]
           for name, per in (("a", per_a), ("b", per_b))}
    assert sep["b"][0] < sep["a"][1]                                    # the separate intervals overlap
    same = g1_stats.paired_difference(per_a, per_a, fn, draws=300, seed=1)
    assert same["estimate"] == 0 and same["lo"] < 0 < same["hi"]
    with pytest.raises(ValueError):
        g1_stats.paired_difference({"x": (10, 1)}, {"y": (10, 1)}, fn)


def _fake_graded(rates: dict[float, list[float]], n: int, seed: int = 0) -> list[dict]:
    rng = random.Random(seed)
    graded = []
    for t, per_problem in rates.items():
        for p_index, p in enumerate(per_problem):
            passes = round(p * n)
            order = [True] * passes + [False] * (n - passes)
            rng.shuffle(order)
            for i, ok in enumerate(order):
                graded.append({"task_id": f"p{p_index:02d}", "temperature": t, "sample_index": i,
                               "passed": ok, "status": "pass" if ok else "wrong_answer",
                               "model_id": "fake/model", "finish_reason": "stop",
                               "completion": f"{p_index}-{i % 7}", "program_id": f"{p_index}-{i % 7}"})
    return graded


def test_summarize_and_single_run_study():
    rates = {0.2: [0.0, 0.2, 0.5, 1.0, 0.9] * 4, 1.0: [0.0, 0.1, 0.3, 0.8, 0.6] * 4}
    graded = _fake_graded(rates, n=50)
    summary = g1_stats.summarize(graded, bootstrap=400)
    assert summary["temperatures"] == [0.2, 1.0]
    block = summary["by_temperature"][0.2]
    assert block["problems"] == 20 and block["samples"] == 1000
    assert block["never_solved"] == 4 and block["always_solved"] == 4
    assert block["metrics"]["pass@1"]["estimate"] == pytest.approx(0.52)
    assert set(block["metrics"]) == {"pass@1", "pass@5", "pass@10", "pass^5", "pass^10"}
    for metric in block["metrics"].values():
        assert metric["lo"] <= metric["estimate"] <= metric["hi"]
    assert block["per_problem"]["p01"]["c"] == 10
    single = g1_stats.single_run_study(summary, runs=3000, seed=1)
    mean = sum(single["scores"][0.2]) / 3000
    assert mean == pytest.approx(0.52, abs=0.02)
    pair = single["pairs"][0]
    assert 0 < pair["wrong_order"] < 0.5 and 0 < pair["tie"] < 0.5
    small = g1_stats.summarize(g1_stats.subsample(graded, 10), bootstrap=100)
    assert small["by_temperature"][0.2]["n_min"] == 10


def test_save_summary(tmp_path):
    summary = g1_stats.summarize(_fake_graded({0.6: [0.5] * 3}, n=10), bootstrap=50)
    path = tmp_path / "summary.json"
    g1_stats.save_summary(summary, str(path))
    data = json.loads(path.read_text())
    assert "0.6" in data["by_temperature"]


# --------------------------------------------------------------------------- GPU plan

T4 = g1_gpu.GpuInfo("Tesla T4", 15360 / 1024, (7, 5))
L4 = g1_gpu.GpuInfo("NVIDIA L4", 23034 / 1024, (8, 9))
A100_40 = g1_gpu.GpuInfo("NVIDIA A100-SXM4-40GB", 40960 / 1024, (8, 0))
A100_80 = g1_gpu.GpuInfo("NVIDIA A100-SXM4-80GB", 81920 / 1024, (8, 0))
H100 = g1_gpu.GpuInfo("NVIDIA H100 80GB HBM3", 81559 / 1024, (9, 0))


def test_parse_nvidia_smi():
    gpus = g1_gpu.parse_nvidia_smi("Tesla T4, 15360, 7.5\n")
    assert gpus == [g1_gpu.GpuInfo("Tesla T4", 15.0, (7, 5))]
    assert not gpus[0].native_bf16
    old_driver = g1_gpu.parse_nvidia_smi("NVIDIA L4, 23034\n")
    assert old_driver[0].compute_capability == (8, 9) and old_driver[0].native_bf16
    assert g1_gpu.parse_nvidia_smi("") == []
    assert g1_gpu.parse_nvidia_smi("No devices were found") == []


def test_plans_per_gpu():
    t4 = g1_gpu.choose_plan(T4, "vllm")
    assert (t4.model_size, t4.dtype, t4.enforce_eager, t4.max_model_len) == ("1.5b", "half", True, 2048)
    l4 = g1_gpu.choose_plan(L4, "vllm")
    assert (l4.model_size, l4.dtype, l4.enforce_eager) == ("1.5b", "bfloat16", False)
    for gpu in (A100_40, A100_80, H100):
        plan = g1_gpu.choose_plan(gpu, "vllm")
        assert (plan.model_size, plan.dtype) == ("7b", "bfloat16")
    assert g1_gpu.choose_plan(A100_80, "vllm", model_size="1.5b").model_id.endswith("1.5B-Instruct")
    with pytest.raises(ValueError):
        g1_gpu.choose_plan(T4, "vllm", model_size="7b")
    tight = g1_gpu.choose_plan(L4, "transformers", model_size="7b")
    assert tight.hf_batch == 25 and any("Tight fit" in n for n in tight.notes)
    with pytest.raises(RuntimeError):
        g1_gpu.choose_plan(None, "vllm")
    text = g1_gpu.format_plan(t4)
    assert "Qwen/Qwen2.5-Coder-1.5B-Instruct" in text and "half" in text


def test_pick_backend():
    assert g1_gpu.pick_backend(T4) == "vllm"
    assert g1_gpu.pick_backend(T4, prefer="transformers") == "transformers"
    assert g1_gpu.pick_backend(g1_gpu.GpuInfo("Tesla P100", 16.0, (6, 0))) == "transformers"
    with pytest.raises(RuntimeError):
        g1_gpu.pick_backend(None)
    with pytest.raises(ValueError):
        g1_gpu.pick_backend(T4, prefer="tensorflow")


def test_install_pins_are_exact_and_backend_round_trips(tmp_path):
    for pins in g1_gpu.INSTALL_PINS.values():
        for pin in pins:
            assert re.fullmatch(r"[A-Za-z0-9_.-]+==[0-9][0-9A-Za-z.+-]*", pin), pin
    assert "vllm==0.31.0" in g1_gpu.INSTALL_PINS["vllm"]
    path = str(tmp_path / "backend.txt")
    g1_gpu.save_backend("transformers", path)
    assert g1_gpu.load_backend(path) == "transformers"
    with pytest.raises(RuntimeError):
        g1_gpu.load_backend(str(tmp_path / "missing.txt"))
    for spec in g1_gpu.MODELS.values():
        assert re.fullmatch(r"[0-9a-f]{40}", spec.revision)


# --------------------------------------------------------------------------- sampling bookkeeping

class FakeSampler:
    """Stands in for a model: returns the reference, the wrong solution or junk."""

    backend = "fake"
    model_id = "fake/model"
    revision = "0" * 40

    def __init__(self):
        self.calls = 0

    def sample(self, tasks, temperature, n, max_tokens, seeds, instruction=g1_sample.INSTRUCTION):
        self.calls += 1
        records = []
        for task, seed in zip(tasks, seeds):
            rng = random.Random(seed)
            p_good = rng.uniform(0.0, 1.0 - temperature / 2)
            for i in range(n):
                roll = rng.random()
                if roll < p_good:
                    text = f"```python\n{task.reference}```"
                elif roll < 0.95:
                    text = f"Answer:\n```python\n{task.wrong}```"
                else:
                    text = "Sorry, I am not sure."
                records.append({"task_id": task.task_id, "temperature": temperature,
                                "sample_index": i, "seed": seed + i, "completion": text,
                                "finish_reason": "stop" if roll < 0.97 else "length", "n_tokens": 100})
        return records


def test_build_messages_and_seeds():
    message = g1_sample.build_messages(TASKS[0])
    assert len(message) == 1 and message[0]["role"] == "user"
    assert TASKS[0].prompt in message[0]["content"] and "```python" in message[0]["content"]
    seeds = [g1_sample.task_seed(1234, t, i) + s for t in range(3) for i in range(20) for s in range(50)]
    assert len(seeds) == len(set(seeds))


def test_run_sweep_saves_and_resumes(tmp_path):
    sampler = FakeSampler()
    records = g1_sample.run_sweep(sampler, TASKS[:3], (0.2, 1.0), 4, 64, tmp_path)
    assert len(records) == 24 and sampler.calls == 2
    assert {r["model_id"] for r in records} == {"fake/model"}
    files = sorted(p.name for p in tmp_path.iterdir())
    assert files == ["samples_main_t0.20.jsonl", "samples_main_t1.00.jsonl"]
    again = g1_sample.run_sweep(sampler, TASKS[:3], (0.2, 1.0), 4, 64, tmp_path)
    assert sampler.calls == 2 and again == records
    g1_sample.run_sweep(sampler, TASKS[:3], (0.2,), 4, 128, tmp_path)  # new setting -> resample
    assert sampler.calls == 3
    g1_sample.run_sweep(sampler, TASKS[:3], (0.2,), 4, 128, tmp_path, instruction="other")
    assert sampler.calls == 4


def test_pipeline_end_to_end_on_cpu(tmp_path):
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    sampler = FakeSampler()
    records = g1_sample.run_sweep(sampler, TASKS, (0.2, 0.6, 1.0), 12, 512, tmp_path)
    graded = g1_grade.grade_records(records, TASKS, timeout=5.0)
    assert len(graded) == 3 * 20 * 12
    for record in graded:  # the fake model's reference answers pass, everything else fails
        assert record["passed"] == (BY_ID[record["task_id"]].reference in record["completion"])
    summary = g1_stats.summarize(graded, bootstrap=300)
    temperature_table = g1_report.markdown_table(g1_report.temperature_rows(summary))
    assert temperature_table.count("\n") == 4 and "pass@10" in temperature_table and "pass^5" in temperature_table
    problem_table = g1_report.markdown_table(g1_report.problem_rows(summary, TASKS))
    assert problem_table.count("\n") == 21 and "g1-20-rpn-fraction" in problem_table
    assert "pass" in g1_report.status_table(graded)
    assert "distinct programs" in g1_report.sanity_notes(graded)
    single = g1_stats.single_run_study(summary, runs=500)
    assert "wrong order" in g1_report.single_run_text(single)
    paired = g1_stats.compare_temperatures(summary, metrics=("pass@1", "pass@10"), draws=200)
    assert len(paired) == 6 and {r["metric"] for r in paired} == {"pass@1", "pass@10"}
    assert "reading" in g1_report.markdown_table(g1_report.paired_rows(paired))
    facts = g1_report.interpretation_facts(summary, single, paired)
    assert facts.startswith("1. Best pass@1") and "Frame:" in facts and "paired, same 20 problems" in facts
    assert "overlap" not in facts
    fig = g1_report.plot_pass_vs_temperature(summary)
    fig.savefig(tmp_path / "plot.png", dpi=80)
    fig2 = g1_report.plot_single_runs(single, summary)
    fig2.savefig(tmp_path / "single.png", dpi=80)
    plt.close("all")
    assert (tmp_path / "plot.png").stat().st_size > 10_000
    assert (tmp_path / "single.png").stat().st_size > 5_000


# --------------------------------------------------------------------------- notebook

def _notebook() -> dict:
    return json.loads(NOTEBOOK.read_text(encoding="utf-8"))


def _code_cells(nb: dict) -> list[str]:
    return ["".join(c["source"]) for c in nb["cells"] if c["cell_type"] == "code"]


def test_notebook_is_valid_nbformat_v4_without_outputs():
    import nbformat

    nb = nbformat.read(str(NOTEBOOK), as_version=4)
    nbformat.validate(nb)
    raw = _notebook()
    assert raw["nbformat"] == 4 and raw["nbformat_minor"] == 5
    assert raw["metadata"]["kernelspec"]["name"] == "python3"
    assert raw["metadata"]["accelerator"] == "GPU"
    assert raw["metadata"]["colab"]["gpuType"] == "T4"
    ids = [c["id"] for c in raw["cells"]]
    assert len(ids) == len(set(ids))
    for cell in raw["cells"]:
        assert re.fullmatch(r"[A-Za-z0-9_-]{1,64}", cell["id"])
        if cell["cell_type"] == "code":
            assert cell["outputs"] == [] and cell["execution_count"] is None
        else:
            assert "outputs" not in cell


def test_notebook_is_up_to_date_with_its_generator():
    assert NOTEBOOK.read_text(encoding="utf-8") == g1_make_notebook.render()


def test_notebook_header_cell():
    first = _notebook()["cells"][0]
    assert first["cell_type"] == "markdown"
    text = "".join(first["source"])
    assert text.startswith("# G1")
    for needed in ("**Goal.**", "Polaris", "Time and GPU budget", "T4", "**Done when:**",
                   g1_make_notebook.HONEST_LABEL, g1_make_notebook.COLAB_URL):
        assert needed in text, needed
    assert g1_make_notebook.HONEST_LABEL == (
        "Written and CPU-smoke-tested by an automated build on 2026-10-20. Never run on a GPU. "
        "Expect to fix version issues; pin what works and note it.")
    assert g1_make_notebook.COLAB_URL == (
        "https://colab.research.google.com/github/ZelinZhu-Richard/ZelinZhu-Richard.github.io/"
        "blob/main/workspace/repolarisdm/labs/colab/g1-pass-at-k.ipynb")


def test_notebook_code_cells():
    cells = _code_cells(_notebook())
    joined = "\n".join(cells)
    assert ("git clone --depth 1 --filter=blob:none --sparse "
            "https://github.com/ZelinZhu-Richard/ZelinZhu-Richard.github.io repo && cd repo && "
            "git sparse-checkout set workspace/repolarisdm/labs") in joined
    assert not any(line.strip().startswith("!cd") for line in joined.splitlines())
    first_smi = next(i for i, c in enumerate(cells) if "nvidia-smi" in c or "detect_gpu" in c)
    first_torch = next(i for i, c in enumerate(cells) if "import torch" in c or "make_sampler" in c)
    assert first_smi < first_torch
    assert "get_device_properties" in joined
    assert "pip install" not in joined.replace('"pip", "install", "-q", *pins', "")
    assert "userdata" not in joined and "HF_TOKEN" not in joined
    for cell in cells:
        python = "\n".join(line for line in cell.splitlines() if not line.lstrip().startswith(("%", "!")))
        ast.parse(python)
        assert len(cell.splitlines()) <= 25, cell[:60]


def test_notebook_uses_only_real_helper_functions():
    modules = {name: sys.modules[name] for name in
               ("g1_gpu", "g1_tasks", "g1_grade", "g1_sample", "g1_stats", "g1_report")}
    for cell in _code_cells(_notebook()):
        python = "\n".join(line for line in cell.splitlines() if not line.lstrip().startswith(("%", "!")))
        for node in ast.walk(ast.parse(python)):
            if isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name) \
                    and node.value.id in modules:
                assert hasattr(modules[node.value.id], node.attr), f"{node.value.id}.{node.attr}"
            if isinstance(node, ast.Import):
                for alias in node.names:
                    if alias.name.startswith("g1_"):
                        assert (LAB / f"{alias.name}.py").exists()


# --------------------------------------------------------------------------- publishing hygiene

def test_no_forbidden_strings_in_g1_files():
    files = sorted(LAB.glob("g1_*.py")) + [NOTEBOOK, Path(__file__), LAB / "tests" / "requirements-g1.txt"]
    patterns = [
        re.escape("/" + "Users/"),
        re.escape("/private" + "/tmp"),
        "hold" + "out",
        "no" + "index",
        "CHRONOS-" + "CANARY",
        r"local" + r"host:\d",
        r"127\.0\.0\.1" + r":\d",
        r"[A-Za-z0-9._%+-]+" + "@" + r"[A-Za-z0-9-]+\.[A-Za-z]{2,}",
    ]
    for path in files:
        text = path.read_text(encoding="utf-8")
        for pattern in patterns:
            assert not re.search(pattern, text, flags=re.IGNORECASE), (path.name, pattern)
