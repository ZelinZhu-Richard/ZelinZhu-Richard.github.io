"""G1 grader: run model-written code against the hidden tests.

Two processes. The model's program runs in its own Python subprocess (the child), in a fresh
temp folder, with a timeout, a memory limit, blocked sockets and no stdin. The child gets only
the INPUTS of each call. The hidden tests run here, in the parent: each call to candidate(...)
sends the arguments to the child over a private pipe, and the child sends back the return value.
The parent compares it with the expected value. So the program never sees an expected value or a
test, and it cannot forge a "pass": the parent decides.

Values cross the pipe as plain data only (None, bool, int, float, str, list, tuple; dicts for
arguments), so an object whose __eq__ always says True cannot pass. If the program changes an
argument in place, the child sends the new value back, so tests that check for side effects work.

These defences stop accidents and simple tricks. They are NOT a security sandbox: the program
runs as you, so it could still read files on the disk, including g1_tasks.py with the tests.
Run model code only on a disposable machine, such as a Colab VM.

Stdlib only.
"""

from __future__ import annotations

import ast
import builtins
import hashlib
import json
import os
import re
import select
import signal
import subprocess
import sys
import tempfile
import time
import traceback
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass

DEFAULT_TIMEOUT = 5.0  # seconds per program; the reference solutions need well under 1 s
DEFAULT_MEMORY_MB = 4096  # address-space limit (Linux); generous so numpy imports still work

STATUSES = (
    "pass",
    "wrong_answer",      # an assert in the hidden tests failed
    "runtime_error",     # an exception while the tests ran
    "timeout",
    "syntax_error",
    "import_error",      # the solution crashed while loading (top-level code)
    "missing_function",  # the entry point is not defined
    "no_code",           # nothing that looks like the function was found
    "crashed",           # the program died or sent garbage instead of an answer (for example os._exit)
)

_FENCE = re.compile(r"```[ \t]*([A-Za-z0-9_+.-]*)[^\n]*\n(.*?)(?:```|\Z)", re.DOTALL)
_PY_TAGS = {"", "python", "py", "python3"}
_CODE_START = ("def ", "import ", "from ", "class ", "@")


@dataclass(frozen=True)
class GradeResult:
    status: str
    detail: str = ""
    seconds: float = 0.0

    @property
    def passed(self) -> bool:
        return self.status == "pass"


def extract_code(completion: str, entry_point: str, prompt: str = "") -> tuple[str | None, str]:
    """Pull the program out of a chat answer.

    Returns (code, how). how is "function" (a full def was found), "body"
    (only an indented body; the prompt is put in front) or "no_function".
    """
    marker = f"def {entry_point}("
    blocks = [body for tag, body in _FENCE.findall(completion) if tag.lower() in _PY_TAGS]
    chosen = next((b for b in blocks if marker in b), blocks[0] if blocks else None)
    if chosen is None:
        # No code fence: start at the first line that looks like code.
        lines = completion.splitlines()
        start = next((i for i, line in enumerate(lines) if line.startswith(_CODE_START)), None)
        chosen = "\n".join(lines[start:]) if start is not None else completion
    if marker in chosen:
        return chosen.strip("\n") + "\n", "function"
    body_lines = [line for line in chosen.splitlines() if line.strip()]
    if prompt and body_lines and all(line.startswith((" ", "\t")) for line in body_lines):
        return prompt + chosen.strip("\n") + "\n", "body"
    return None, "no_function"


def code_key(task_id: str, code: str) -> str:
    """Cache key: identical programs for the same task are graded once."""
    return hashlib.sha256(f"{task_id}\0{code}".encode()).hexdigest()


MAX_REPLY_BYTES = 8 << 20   # one reply from the child; anything bigger counts as a crash

# The child: load the solution, then answer calls until the parent closes the pipe.
# It never sees the tests or an expected value.
_CHILD = r'''
import importlib.util, json, os, sys

_CFG = json.loads(sys.argv[1])
_requests = os.fdopen(_CFG["req_fd"], "rb")
_reply_fd = _CFG["res_fd"]

def _send(obj):
    data = (json.dumps(obj) + "\n").encode()
    while data:
        data = data[os.write(_reply_fd, data):]

# Soft limits (Linux). A speed bump, not a sandbox.
try:
    import resource
    for _limit, _value in (("RLIMIT_AS", _CFG["memory"]), ("RLIMIT_FSIZE", 16 << 20)):
        try:
            resource.setrlimit(getattr(resource, _limit), (_value, _value))
        except Exception:
            pass  # not supported here (for example RLIMIT_AS on macOS)
except ImportError:
    pass

# Block network use by the solution. Also only a speed bump.
import socket
def _no_network(*args, **kwargs):
    raise OSError("network access is disabled in the G1 grader")
for _name in ("connect", "connect_ex", "sendto", "bind"):
    setattr(socket.socket, _name, _no_network)
socket.getaddrinfo = _no_network
socket.create_connection = _no_network

# Hide the solution's own printing.
_sink = open(os.devnull, "w")
sys.stdout = _sink
sys.stderr = _sink

def _enc(v, depth=0, dicts=False):
    if depth > 50:
        raise TypeError("result is nested too deeply")
    if v is None or type(v) in (bool, int, float, str):
        return v
    if type(v) in (list, tuple):
        return {"L" if type(v) is list else "T": [_enc(x, depth + 1, dicts) for x in v]}
    if dicts and type(v) is dict:
        return {"D": [[_enc(k, depth + 1, dicts), _enc(x, depth + 1, dicts)] for k, x in v.items()]}
    raise TypeError("unexpected result type " + type(v).__name__)

def _dec(v):
    if isinstance(v, dict):
        (tag, items), = v.items()
        if tag == "D":
            return {_dec(k): _dec(x) for k, x in items}
        seq = [_dec(x) for x in items]
        return seq if tag == "L" else tuple(seq)
    return v

try:
    _spec = importlib.util.spec_from_file_location("solution", _CFG["solution"])
    _module = importlib.util.module_from_spec(_spec)
    _spec.loader.exec_module(_module)
except SyntaxError as exc:
    _send({"load": "syntax_error", "detail": repr(exc)[:400]})
    os._exit(3)
except BaseException as exc:
    _send({"load": "import_error", "detail": ("%s: %s" % (type(exc).__name__, exc))[:400]})
    os._exit(4)

_function = getattr(_module, _CFG["entry"], None)
if not callable(_function):
    _send({"load": "missing_function", "detail": _CFG["entry"]})
    os._exit(5)
_send({"load": "ok"})

for _line in _requests:
    _call = json.loads(_line)
    _args, _kwargs = _dec(_call["args"]), _dec(_call["kwargs"])
    try:
        _value = _function(*_args, **_kwargs)
        _reply = {"ok": True, "value": _enc(_value)}
    except BaseException as exc:
        _reply = {"ok": False, "error": [c.__name__ for c in type(exc).__mro__],
                  "detail": str(exc)[:200]}
    try:
        _reply["args"] = _enc(list(_args), dicts=True)
    except TypeError:
        pass
    _send(_reply)
os._exit(0)
'''


class _ChildGone(BaseException):
    # BaseException, so a test's own "except Exception" can never swallow it.
    def __init__(self, status: str, detail: str):
        super().__init__(detail)
        self.status, self.detail = status, detail


def _enc(value, depth: int = 0, dicts: bool = True):
    # Parent side: the arguments a hidden test passes.
    if depth > 50:
        raise TypeError("argument is nested too deeply")
    if value is None or type(value) in (bool, int, float, str):
        return value
    if type(value) in (list, tuple):
        return {"L" if type(value) is list else "T": [_enc(x, depth + 1, dicts) for x in value]}
    if dicts and type(value) is dict:
        return {"D": [[_enc(k, depth + 1), _enc(x, depth + 1)] for k, x in value.items()]}
    raise TypeError("the hidden tests passed an argument that is not plain data: " + type(value).__name__)


def _dec(value, depth: int = 0, dicts: bool = False):
    # Parent side, strict: only plain data comes back. Anything else means a broken child.
    if depth > 60:
        raise _ChildGone("crashed", "reply nested too deeply")
    if value is None or type(value) in (bool, int, float, str):
        return value
    if type(value) is dict and len(value) == 1:
        (tag, items), = value.items()
        if type(items) is list and tag in ("L", "T"):
            seq = [_dec(x, depth + 1, dicts) for x in items]
            return seq if tag == "L" else tuple(seq)
        if type(items) is list and tag == "D" and dicts:
            out = {}
            for pair in items:
                if type(pair) is not list or len(pair) != 2:
                    raise _ChildGone("crashed", "bad dict in reply")
                key = _dec(pair[0], depth + 1, dicts)
                try:
                    out[key] = _dec(pair[1], depth + 1, dicts)
                except TypeError:
                    raise _ChildGone("crashed", "unhashable key in reply") from None
            return out
    raise _ChildGone("crashed", "reply is not plain data")


def _rebuild_error(mro: list, detail: str) -> Exception:
    # The first built-in Exception class in the child's exception hierarchy, so that
    # "except ValueError" in a test still catches a subclass of ValueError.
    for name in mro if type(mro) is list else []:
        cls = getattr(builtins, str(name), None)
        if isinstance(cls, type) and issubclass(cls, Exception):
            try:
                return cls(detail)
            except Exception:
                continue
    first = mro[0] if type(mro) is list and mro else "error"
    return RuntimeError(f"{first}: {detail}")    # SystemExit, KeyboardInterrupt and other non-Exceptions


def _sync(original, new) -> None:
    # Show an in-place change of an argument to the test, as a normal call would.
    if type(original) is list and type(new) is list:
        original[:] = new
    elif type(original) is dict and type(new) is dict:
        original.clear()
        original.update(new)


class _Child:
    def __init__(self, proc, req_fd: int, res_fd: int, deadline: float, timeout: float):
        self.proc, self.req_fd, self.res_fd = proc, req_fd, res_fd
        self.deadline, self.timeout, self.buffer = deadline, timeout, b""
        os.set_blocking(req_fd, False)

    def _remaining(self) -> float:
        left = self.deadline - time.perf_counter()
        if left <= 0:
            raise _ChildGone("timeout", f"no result after {self.timeout:g} s")
        return left

    def send(self, obj) -> None:
        data = (json.dumps(obj) + "\n").encode()
        while data:
            _, writable, _ = select.select([], [self.req_fd], [], self._remaining())
            if writable:
                try:
                    data = data[os.write(self.req_fd, data):]
                except BrokenPipeError:
                    raise _ChildGone("crashed", self.exit_note()) from None

    def receive(self):
        while b"\n" not in self.buffer:
            readable, _, _ = select.select([self.res_fd], [], [], self._remaining())
            if not readable:
                continue
            chunk = os.read(self.res_fd, 65536)
            if not chunk:
                raise _ChildGone("crashed", self.exit_note())
            self.buffer += chunk
            if len(self.buffer) > MAX_REPLY_BYTES:
                raise _ChildGone("crashed", "reply too big")
        line, _, self.buffer = self.buffer.partition(b"\n")
        try:
            return json.loads(line)
        except (json.JSONDecodeError, UnicodeDecodeError):
            raise _ChildGone("crashed", "garbled reply") from None

    def exit_note(self) -> str:
        try:
            code = self.proc.wait(timeout=1)
        except subprocess.TimeoutExpired:
            code = None
        return f"the program exited (exit code {code}) without an answer"

    def call(self, args, kwargs):
        self.send({"args": _enc(list(args)), "kwargs": _enc(dict(kwargs))})
        reply = self.receive()
        if type(reply) is not dict:
            raise _ChildGone("crashed", "garbled reply")
        if "args" in reply:
            new_args = _dec(reply["args"], dicts=True)
            if type(new_args) is list and len(new_args) == len(args):
                for old, new in zip(args, new_args):
                    _sync(old, new)
        if reply.get("ok") is True:
            return _dec(reply.get("value"))
        raise _rebuild_error(reply.get("error"), str(reply.get("detail", ""))[:200])


def _where(exc: BaseException, tests: str) -> str:
    for frame in reversed(traceback.extract_tb(exc.__traceback__)):
        if frame.filename == "<g1-hidden-tests>":
            lines = tests.splitlines()
            if 0 < frame.lineno <= len(lines):
                return "line %d: %s" % (frame.lineno, lines[frame.lineno - 1].strip())
    return ""


def _kill_group(proc: subprocess.Popen) -> None:
    try:
        os.killpg(proc.pid, signal.SIGKILL)
    except (ProcessLookupError, PermissionError, OSError):
        try:
            proc.kill()
        except OSError:
            pass


def run_code(task, code: str, timeout: float = DEFAULT_TIMEOUT,
             memory_mb: int = DEFAULT_MEMORY_MB) -> GradeResult:
    # Run one program against one task's hidden tests (tests in this process, program in a child).
    start = time.perf_counter()
    try:
        ast.parse(code)
    except (SyntaxError, ValueError) as exc:  # ValueError: null bytes in the source
        return GradeResult("syntax_error", str(exc)[:400], 0.0)
    with tempfile.TemporaryDirectory(prefix="g1run-") as work, tempfile.TemporaryFile() as err:
        solution_path = os.path.join(work, "solution.py")
        child_path = os.path.join(work, "child.py")
        with open(solution_path, "w", encoding="utf-8") as fh:
            fh.write(code)
        with open(child_path, "w", encoding="utf-8") as fh:
            fh.write(_CHILD)
        req_r, req_w = os.pipe()
        res_r, res_w = os.pipe()
        config = json.dumps({"req_fd": req_r, "res_fd": res_w, "solution": solution_path,
                             "entry": task.entry_point, "memory": memory_mb * 1024 * 1024})
        env = {
            "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
            "HOME": work,
            "TMPDIR": work,
            "LANG": "C.UTF-8",
            "PYTHONHASHSEED": "0",
            "PYTHONDONTWRITEBYTECODE": "1",
            "OMP_NUM_THREADS": "1",
            "OPENBLAS_NUM_THREADS": "1",
            "MKL_NUM_THREADS": "1",
        }
        try:
            proc = subprocess.Popen(
                [sys.executable, "-I", child_path, config],
                cwd=work, env=env, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=err,
                pass_fds=(req_r, res_w), start_new_session=True,
            )
        finally:
            os.close(req_r)
            os.close(res_w)
        child = _Child(proc, req_w, res_r, start + timeout, timeout)
        try:
            result = _run_tests(task, child)
        finally:
            for fd in (req_w, res_r):
                try:
                    os.close(fd)
                except OSError:
                    pass
            _kill_group(proc)  # also stops any child processes the solution started
            proc.wait()
        if result.status == "crashed":
            err.seek(0)
            tail = err.read().decode("utf-8", "replace")[-300:].strip()
            if tail:
                result = GradeResult("crashed", f"{result.detail}; {tail}", result.seconds)
    return GradeResult(result.status, result.detail, time.perf_counter() - start)


def _run_tests(task, child: _Child) -> GradeResult:
    try:
        hello = child.receive()
        if type(hello) is not dict or "load" not in hello:
            return GradeResult("crashed", "garbled reply")
        if hello["load"] != "ok":
            status = hello["load"] if hello["load"] in STATUSES else "crashed"
            return GradeResult(status, str(hello.get("detail", ""))[:400])

        def candidate(*args, **kwargs):
            return child.call(args, kwargs)

        namespace: dict = {}
        exec(compile(task.tests, "<g1-hidden-tests>", "exec"), namespace)
        try:
            namespace["check"](candidate)
        except AssertionError as exc:
            return GradeResult("wrong_answer", _where(exc, task.tests) or repr(exc))
        except Exception as exc:
            return GradeResult("runtime_error",
                               ("%s: %s %s" % (type(exc).__name__, exc, _where(exc, task.tests))).strip()[:400])
        return GradeResult("pass")
    except _ChildGone as gone:
        return GradeResult(gone.status, gone.detail)


def grade_completion(task, completion: str, timeout: float = DEFAULT_TIMEOUT) -> GradeResult:
    code, how = extract_code(completion, task.entry_point, task.prompt)
    if code is None:
        return GradeResult("no_code", how)
    return run_code(task, code, timeout)


def grade_records(records: list[dict], tasks, timeout: float = DEFAULT_TIMEOUT,
                  workers: int | None = None, progress_every: int = 500) -> list[dict]:
    """Grade sample records (from g1_sample) and return them with results added.

    Identical programs for the same task are run once and the result is
    reused. That saves a lot of time at low temperature. It assumes the hidden
    tests are deterministic, which they are; a program that is close to the
    timeout could still be flaky.
    """
    by_id = {t.task_id: t for t in tasks}
    prepared = []
    jobs: dict[str, tuple] = {}
    for record in records:
        task = by_id[record["task_id"]]
        code, how = extract_code(record["completion"], task.entry_point, task.prompt)
        key = code_key(task.task_id, code) if code is not None else None
        prepared.append((record, how, key))
        if key is not None and key not in jobs:
            jobs[key] = (task, code)
    workers = workers or max(2, os.cpu_count() or 2)
    results: dict[str, GradeResult] = {}
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(run_code, task, code, timeout): key
                   for key, (task, code) in jobs.items()}
        for done, future in enumerate(as_completed(futures), 1):
            results[futures[future]] = future.result()
            if progress_every and done % progress_every == 0:
                print(f"  graded {done}/{len(jobs)} distinct programs")
    graded = []
    for record, how, key in prepared:
        result = results[key] if key is not None else GradeResult("no_code", how)
        graded.append({
            **record,
            "extracted": how,
            "program_id": key[:16] if key else None,
            "status": result.status,
            "passed": result.passed,
            "detail": result.detail,
        })
    return graded


DO_NOTHING = "def {entry}(*args, **kwargs):\n    return None\n"


def validate_task_set(tasks, timeout: float = DEFAULT_TIMEOUT) -> dict:
    """Check the grader before trusting it.

    For every task: the reference must pass, a do-nothing stub must fail, and
    the planted wrong solution must fail. Returns rows plus a summary.
    """
    rows = []
    for task in tasks:
        ref = run_code(task, task.reference, timeout)
        stub = run_code(task, DO_NOTHING.format(entry=task.entry_point), timeout)
        wrong = run_code(task, task.wrong, timeout)
        rows.append({
            "task_id": task.task_id,
            "reference": ref.status,
            "do_nothing": stub.status,
            "wrong": wrong.status,
            "ok": ref.passed and not stub.passed and not wrong.passed,
        })
    good = sum(r["ok"] for r in rows)
    summary = (f"Grader check: {good} of {len(rows)} tasks behave as expected "
               f"(reference passes, do-nothing fails, planted wrong solution fails).")
    bad = [r for r in rows if not r["ok"]]
    if bad:
        summary += "\nProblems: " + "; ".join(
            f"{r['task_id']} (reference={r['reference']}, do_nothing={r['do_nothing']}, wrong={r['wrong']})"
            for r in bad)
    return {"ok": not bad, "rows": rows, "summary": summary}
