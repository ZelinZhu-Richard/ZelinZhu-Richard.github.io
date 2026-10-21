"""G2 helper: tasks, isolated workspaces, sandbox users, custody, and Harbor-style grading.

Pure standard library. CPU-safe. Used by g2-agent-runs.ipynb and tests/test_g2.py.

A task here is:
- an instruction (the prompt the agent reads),
- a pristine app folder (the agent works on a fresh copy of it),
- a command that runs the visible tests,
- one or more graders: folders with a Harbor-style tests/test.sh that writes
  a reward to $LOGS_DIR/verifier/reward.txt (or reward.json).

Grading mirrors labs/lab-f/repo/run_task.sh in local mode: copy the app, then copy
the tests in only after the agent is done, run test.sh, read the reward.

Custody (who can read what). Model-written code must never see an answer or a grader.
On Colab the notebook runs as root, and this module then:
- runs every command of attempt i (visible tests, grader) as its own unprivileged user,
  uid and gid SANDBOX_UID_BASE + i, with no extra groups and a private TMPDIR;
- after lock_down(["/content"]), that user cannot read /content at all: not the clone,
  not the answers moved there by lock_lab_f(), not your uploaded grader, not the run folders;
- kills every process of that user after each command, so nothing keeps running between turns;
- gives the finished workspace back to root before grading, and grades a copy of it;
- deletes every file that user left in /tmp, /var/tmp and /dev/shm after grading.
g2_runs.run_many grades only after ALL agent phases have finished, so code that runs during
grading (and can read the copied tests) cannot pass them to a later attempt.

Outside Colab (for example the CPU smoke tests on a Mac) the process is not root, so there is
no sandbox user: model-written code runs as you. Sandbox.active says which case you are in.
Even on Colab this is not a security sandbox: the kernel, the GPU and (unless
block_network() works) the network are shared. Never run this on a machine that holds secrets.
"""
from __future__ import annotations

import difflib
import hashlib
import json
import os
import shutil
import signal
import stat
import subprocess
import sys
import tempfile
import time
import zipfile
from dataclasses import dataclass, field
from pathlib import Path

IGNORE_NAMES = ("__pycache__", "*.pyc", ".git", ".pytest_cache")
# Files that must never be inside an agent workspace (grader and solution files).
FORBIDDEN_NAMES = ("test.sh", "test_outputs.py", "solve.sh", "reward.txt", "reward.json")

SANDBOX_UID_BASE = 50000          # attempt i runs as uid = gid = 50000 + i (no /etc/passwd entry needed)
SANDBOX_UID_SPAN = 10000
SHARED_TMP_DIRS = ("/tmp", "/var/tmp", "/dev/shm")
MAX_READ_BYTES = 1 << 20          # never read more than this from a file the model could have made


@dataclass
class TaskSpec:
    name: str
    instruction: str
    app_dir: Path
    visible_test_cmd: list
    graders: dict = field(default_factory=dict)  # grader name -> folder that holds test.sh
    canary: str | None = None  # a string that must never appear in a workspace or reply
    private: bool = False  # True: never store grader output (it can reveal hidden tests)


# --------------------------------------------------------------------------- sandbox users

def running_as_root_on_linux() -> bool:
    return sys.platform.startswith("linux") and hasattr(os, "geteuid") and os.geteuid() == 0


@dataclass(frozen=True)
class Sandbox:
    """The user that runs one attempt's model-written code. uid None = no sandbox (code runs as you)."""
    uid: int | None = None

    @property
    def active(self) -> bool:
        return self.uid is not None

    def popen_kwargs(self) -> dict:
        if not self.active:
            return {}
        return {"user": self.uid, "group": self.uid, "extra_groups": [], "umask": 0o077}

    def give(self, path) -> None:
        """Make a folder tree belong to the sandbox user (never follows symlinks)."""
        if self.active:
            chown_tree(path, self.uid, self.uid)

    def take_back(self, path) -> None:
        """Make a folder tree belong to root again, and close its top folder to everyone else."""
        if self.active:
            self.stop()
            chown_tree(path, 0, 0)
            os.chmod(path, 0o700)

    def stop(self) -> int:
        """Kill every process of the sandbox user. Returns how many signals were sent."""
        return kill_uid(self.uid) if self.active else 0

    def clean_shared_tmp(self) -> list:
        """Delete what the sandbox user left in /tmp, /var/tmp and /dev/shm."""
        if not self.active:
            return []
        self.stop()
        return remove_owned(SHARED_TMP_DIRS, self.uid)


def sandbox_for(index: int) -> Sandbox:
    """The sandbox user for attempt `index`: active only when this process is root on Linux."""
    if running_as_root_on_linux():
        return Sandbox(SANDBOX_UID_BASE + index % SANDBOX_UID_SPAN)
    return Sandbox()


SELF_CHECK_SANDBOX_INDEX = SANDBOX_UID_SPAN - 1   # the harness self-check uses its own user


def chown_tree(path, uid, gid) -> None:
    path = Path(path)
    os.chown(path, uid, gid, follow_symlinks=False)
    for dirpath, dirnames, filenames in os.walk(path):
        for name in dirnames + filenames:
            os.chown(os.path.join(dirpath, name), uid, gid, follow_symlinks=False)


def pids_of_uid(uid, proc="/proc") -> list:
    """Live process ids whose real uid is `uid` (Linux /proc). Zombies are skipped: they hold nothing.

    Empty where /proc does not exist (macOS).
    """
    out = []
    try:
        names = os.listdir(proc)
    except OSError:
        return out
    for name in names:
        if not name.isdigit():
            continue
        try:
            with open(os.path.join(proc, name, "status"), encoding="utf-8", errors="replace") as handle:
                state, owner = "", None
                for line in handle:
                    if line.startswith("State:"):
                        state = line.split()[1]
                    elif line.startswith("Uid:"):
                        owner = int(line.split()[1])
                        break
            if owner == uid and state not in ("Z", "X"):
                out.append(int(name))
        except (OSError, ValueError, IndexError):
            continue
    return out


def kill_uid(uid, rounds=10) -> int:
    """SIGKILL every process of a sandbox uid, until none is left. Refuses real users' uids."""
    if uid is None or not SANDBOX_UID_BASE <= uid < SANDBOX_UID_BASE + SANDBOX_UID_SPAN:
        return 0
    sent = 0
    for _ in range(rounds):
        pids = pids_of_uid(uid)
        if not pids:
            break
        for pid in pids:
            try:
                os.kill(pid, signal.SIGKILL)
                sent += 1
            except (ProcessLookupError, PermissionError):
                pass
        time.sleep(0.05)
    return sent


def remove_owned(roots, uid) -> list:
    """Delete every file and folder owned by `uid` under the given roots. Never follows symlinks."""
    removed = []
    stack = [str(r) for r in roots]
    while stack:
        folder = stack.pop()
        try:
            entries = list(os.scandir(folder))
        except OSError:
            continue
        for entry in entries:
            try:
                info = entry.stat(follow_symlinks=False)
            except OSError:
                continue
            is_dir = stat.S_ISDIR(info.st_mode)
            if info.st_uid == uid:
                try:
                    if is_dir:
                        shutil.rmtree(entry.path)
                    else:
                        os.unlink(entry.path)
                    removed.append(entry.path)
                except OSError:
                    pass
            elif is_dir:
                stack.append(entry.path)
    return removed


# --------------------------------------------------------------------------- custody

def lock_lab_f(labs_dir, vault) -> Path:
    """Move Lab F's answers out of the clone into a root-only vault. Safe to call twice.

    Moves lab-f/repo/task/solution (the reference) and lab-f/repo/solutions (alt and wrong
    solutions). Run it after the Lab F matrix (run_task.sh needs them) and before any attempt.
    Returns the path of the reference merge.py inside the vault.
    """
    labs_dir, vault = Path(labs_dir), Path(vault)
    target = vault / "lab-f"
    target.mkdir(parents=True, exist_ok=True)
    os.chmod(vault, 0o700)
    for rel in ("task/solution", "solutions"):
        src = labs_dir / "lab-f" / "repo" / rel
        dst = target / rel.replace("/", "-")
        if src.exists():
            if dst.exists():
                shutil.rmtree(dst)
            shutil.move(str(src), str(dst))
    reference = target / "task-solution" / "merge.py"
    if not reference.is_file():
        raise FileNotFoundError(f"no reference solution in {target}; was the clone complete?")
    return reference


def lab_f_answers_in_clone(labs_dir) -> list:
    """Answer folders that are still inside the clone (empty after lock_lab_f)."""
    repo = Path(labs_dir) / "lab-f" / "repo"
    return [str(p) for p in (repo / "task" / "solution", repo / "solutions") if p.exists()]


def lock_down(paths) -> list:
    """chmod 0700 each existing path, so only root can enter it. Returns the paths changed."""
    done = []
    for path in paths:
        if os.path.exists(path):
            os.chmod(path, 0o700)
            done.append(str(path))
    return done


NETWORK_RULE = ["OUTPUT", "-m", "owner", "--uid-owner",
                f"{SANDBOX_UID_BASE}-{SANDBOX_UID_BASE + SANDBOX_UID_SPAN - 1}", "-j", "REJECT"]


def block_network(run=subprocess.run) -> dict:
    """Try to reject all network traffic of the sandbox users with iptables (IPv4 and IPv6).

    Colab's container may not allow it. The result says what happened; probe() checks it.
    """
    results = {}
    for tool in ("iptables", "ip6tables"):
        try:
            present = run([tool, "-C", *NETWORK_RULE], capture_output=True, text=True, timeout=30)
            if present.returncode == 0:
                results[tool] = "rule already present"
                continue
            out = run([tool, "-I", *NETWORK_RULE], capture_output=True, text=True, timeout=30)
            results[tool] = "rule added" if out.returncode == 0 else f"failed: {(out.stderr or out.stdout).strip()[:200]}"
        except (FileNotFoundError, subprocess.TimeoutExpired) as error:
            results[tool] = f"failed: {type(error).__name__}"
    return results


PROBE = r'''
import json, os, socket, sys
paths, host = json.loads(sys.argv[1]), sys.argv[2]
out = {}
for p in paths:
    try:
        if os.path.isdir(p):
            os.listdir(p)
        else:
            open(p, "rb").read(1)
        out[p] = "READABLE"
    except OSError:
        out[p] = "blocked"
try:
    socket.create_connection((host, 443), timeout=5).close()
    out["network"] = "OPEN"
except OSError:
    out["network"] = "blocked"
print(json.dumps(out))
'''


def probe(sandbox: Sandbox, paths, host="github.com") -> dict:
    """Run a small program AS the sandbox user: can it read these paths, can it reach the network?

    Returns {path: "blocked" | "READABLE", "network": "blocked" | "OPEN"}, or {"sandbox": "inactive"}.
    """
    if not sandbox.active:
        return {"sandbox": "inactive"}
    home = Path(tempfile.mkdtemp(prefix="g2-probe-"))
    try:
        sandbox.give(home)
        res = run_cmd(["python3", "-I", "-c", PROBE, json.dumps([str(p) for p in paths]), host], home,
                      timeout=60, env=minimal_env(home), sandbox=sandbox)
    finally:
        sandbox.stop()
        shutil.rmtree(home, ignore_errors=True)
    try:
        return json.loads(res["output"].strip().splitlines()[-1])
    except (ValueError, IndexError):
        return {"probe": f"failed: {res['output'][-300:]}"}


# --------------------------------------------------------------------------- tasks

def lab_f_task(labs_dir, strong_tests=None) -> TaskSpec:
    """The Lab F task (freebusy-merge). 'weak' is the grader shipped with the lab.

    'strong' is the grader YOU wrote in Lab F. This repo does not contain it.
    """
    task_dir = Path(labs_dir) / "lab-f" / "repo" / "task"
    graders = {"weak": task_dir / "tests"}
    if strong_tests is not None:
        graders["strong"] = Path(strong_tests)
    for name, folder in graders.items():
        if not (Path(folder) / "test.sh").is_file():
            raise FileNotFoundError(f"grader '{name}' has no test.sh in {folder}")
    return TaskSpec(
        name="lab-f/freebusy-merge",
        instruction=(task_dir / "instruction.md").read_text(encoding="utf-8"),
        app_dir=task_dir / "environment" / "app",
        visible_test_cmd=["python3", "-m", "unittest", "discover", "-s", "tests", "-v"],
        graders=graders,
    )


def folder_task(root, *, name, visible_test_cmd, canary=None) -> TaskSpec:
    """A task you bring yourself (for example your private Chronos task).

    Layout of root: instruction.md, env/ (the repo the agent starts from), grader/test.sh.
    """
    root = Path(root)
    for need in ("instruction.md", "env", "grader/test.sh"):
        if not (root / need).exists():
            raise FileNotFoundError(f"{root} is missing {need}")
    return TaskSpec(
        name=name,
        instruction=(root / "instruction.md").read_text(encoding="utf-8"),
        app_dir=root / "env",
        visible_test_cmd=list(visible_test_cmd),
        graders={"private": root / "grader"},
        canary=canary,
        private=True,
    )


def minimal_env(home, **extra) -> dict:
    """A small environment for model-written code: no tokens, no proxies, fixed hash seed.

    TMPDIR is home/tmp when that folder exists (a private temp folder per attempt).
    """
    home = Path(home)
    private_tmp = home / "tmp"
    env = {
        "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
        "HOME": str(home),
        "LANG": "C.UTF-8",
        "PYTHONDONTWRITEBYTECODE": "1",
        "PYTHONHASHSEED": "0",
        "TMPDIR": str(private_tmp) if private_tmp.is_dir() else tempfile.gettempdir(),
    }
    env.update({k: str(v) for k, v in extra.items()})
    return env


def run_cmd(cmd, cwd, *, timeout, env=None, tail_chars=4000, sandbox: Sandbox | None = None) -> dict:
    """Run cmd with a hard timeout, as the sandbox user when there is one.

    Kills the whole process group on timeout, then every process of the sandbox user.
    Output goes to a temp file, not a pipe, so an endless print loop cannot fill memory.
    """
    sandbox = sandbox or Sandbox()
    started = time.time()
    with tempfile.TemporaryFile() as out:
        proc = subprocess.Popen(
            cmd, cwd=str(cwd), env=env or minimal_env(Path(cwd).parent),
            stdout=out, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, start_new_session=True,
            **sandbox.popen_kwargs(),
        )
        timed_out = False
        try:
            proc.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            timed_out = True
        try:  # also kill leftovers that model-written code started in the background
            os.killpg(proc.pid, signal.SIGKILL)
        except (ProcessLookupError, PermissionError):
            pass
        sandbox.stop()  # and daemons that left the process group (setsid)
        proc.wait()
        out.seek(0, os.SEEK_END)
        size = out.tell()
        out.seek(max(0, size - tail_chars * 4))
        text = out.read().decode("utf-8", "replace")[-tail_chars:]
    return {"exit": proc.returncode, "timed_out": timed_out, "output": text,
            "seconds": round(time.time() - started, 2)}


def make_workspace(task: TaskSpec, sandbox: Sandbox | None = None) -> Path:
    """Copy the pristine app into a new temp folder. Returns the repo root the agent sees.

    The parent folder is the attempt's HOME; parent/tmp is its private TMPDIR.
    With a sandbox, the whole folder belongs to the sandbox user.
    """
    parent = Path(tempfile.mkdtemp(prefix="g2-ws-"))
    root = parent / "repo"
    shutil.copytree(task.app_dir, root, ignore=shutil.ignore_patterns(*IGNORE_NAMES))
    (parent / "tmp").mkdir()
    if sandbox is not None:
        sandbox.give(parent)
    return root


def iter_files(root):
    """Regular files under root, as (relative path, Path). Symlinks and special files are skipped."""
    root = Path(root)
    found = []
    for dirpath, dirnames, filenames in os.walk(root):          # never follows symlinked folders
        dirnames[:] = [d for d in dirnames if d not in ("__pycache__", ".git", ".pytest_cache")]
        for name in filenames:
            path = Path(dirpath) / name
            if path.suffix != ".pyc" and not path.is_symlink() and path.is_file():
                found.append((path.relative_to(root).as_posix(), path))
    yield from sorted(found)


def symlinks_leaving(root) -> list:
    """Symlinks under root whose target is outside root (a way to smuggle files in or out)."""
    root = Path(root).resolve()
    out = []
    for dirpath, dirnames, filenames in os.walk(root):
        for name in dirnames + filenames:
            path = Path(dirpath) / name
            if path.is_symlink():
                target = Path(os.path.realpath(path))
                if target != root and root not in target.parents:
                    out.append(f"{path.relative_to(root).as_posix()} -> {os.readlink(path)}")
    return out


def check_isolation(task: TaskSpec, root) -> list:
    """Problems that would make an attempt invalid before it starts (empty list = fine)."""
    problems = []
    for rel, path in iter_files(root):
        if Path(rel).name in FORBIDDEN_NAMES:
            problems.append(f"grader or solution file in workspace: {rel}")
        if task.canary and task.canary.encode() in path.read_bytes():
            problems.append(f"canary found in workspace file: {rel}")
    if (Path(root) / ".git").exists():
        problems.append("workspace has git history (an agent could mine it)")
    problems += [f"symlink leaves the workspace: {s}" for s in symlinks_leaving(root)]
    return problems


def _read_limited(path, limit=MAX_READ_BYTES) -> bytes | None:
    """Read a regular file without following a symlink. None if it is not one or is too big."""
    try:
        fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0))
    except OSError:
        return None
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_size > limit:
            return None
        return os.read(fd, limit)
    finally:
        os.close(fd)


def diff_workspaces(pristine, root, max_chars=20000) -> dict:
    """What the agent changed: changed/added/deleted files and a unified diff of text files."""
    before = {rel: path for rel, path in iter_files(pristine)}
    after = {rel: path for rel, path in iter_files(root)}

    def content(path):
        data = _read_limited(path)
        return b"[file too big or unreadable]\n" if data is None else data
    changed = [r for r in sorted(before.keys() & after.keys()) if content(before[r]) != content(after[r])]
    added, deleted = sorted(after.keys() - before.keys()), sorted(before.keys() - after.keys())
    patch = []
    for rel in changed + added + deleted:
        old = content(before[rel]).decode("utf-8", "replace").splitlines(True) if rel in before else []
        new = content(after[rel]).decode("utf-8", "replace").splitlines(True) if rel in after else []
        patch.extend(difflib.unified_diff(old, new, f"a/{rel}", f"b/{rel}"))
    text = "".join(patch)
    return {"changed": changed, "added": added, "deleted": deleted, "symlinks_out": symlinks_leaving(root),
            "patch": text[:max_chars], "patch_truncated": len(text) > max_chars}


def read_reward(verifier_dir) -> tuple:
    """(reward, note). Missing or unreadable reward means 0, as in run_task.sh.

    The code under test could replace these files, so they are read without following
    symlinks and only up to a small size.
    """
    verifier_dir = Path(verifier_dir)
    txt, js = verifier_dir / "reward.txt", verifier_dir / "reward.json"
    try:
        if txt.exists() or txt.is_symlink():
            data = _read_limited(txt, 4096)
            if data is None:
                return 0.0, "unreadable reward file: not a small regular file"
            if data.strip():
                return float(data.decode("utf-8", "replace").strip()), "reward.txt"
        if js.exists() or js.is_symlink():
            data = _read_limited(js, 65536)
            if data is None:
                return 0.0, "unreadable reward file: not a small regular file"
            return float(json.loads(data)["reward"]), "reward.json"
    except (ValueError, KeyError, TypeError, json.JSONDecodeError) as error:
        return 0.0, f"unreadable reward file: {error}"
    return 0.0, "no reward file"


def _copy_tests_read_only(src, dst) -> None:
    """Copy a grader folder. It stays root-owned: code under test may read it, never change it."""
    shutil.copytree(src, dst, symlinks=False)
    for dirpath, dirnames, filenames in os.walk(dst):
        os.chmod(dirpath, 0o755)
        for name in filenames:
            path = os.path.join(dirpath, name)
            os.chmod(path, 0o755 if os.stat(path).st_mode & 0o111 else 0o644)   # keep "executable"


def grade(task: TaskSpec, root, grader: str, *, timeout=180, sandbox: Sandbox | None = None) -> dict:
    """Run one grader on a copy of the agent's final workspace, as the sandbox user if there is one."""
    sandbox = sandbox or Sandbox()
    tests_dir = Path(task.graders[grader])
    work = Path(tempfile.mkdtemp(prefix="g2-grade-"))
    try:
        os.chmod(work, 0o711)
        shutil.copytree(root, work / "app", symlinks=True, ignore=shutil.ignore_patterns(*IGNORE_NAMES))
        _copy_tests_read_only(tests_dir, work / "tests")
        (work / "logs" / "verifier").mkdir(parents=True)
        (work / "tmp").mkdir()
        for part in ("app", "logs", "tmp"):
            sandbox.give(work / part)
        env = minimal_env(work, APP_DIR=work / "app", TESTS_DIR=work / "tests", LOGS_DIR=work / "logs")
        res = run_cmd(["bash", str(work / "tests" / "test.sh")], work / "app", timeout=timeout, env=env,
                      sandbox=sandbox)
        reward, note = read_reward(work / "logs" / "verifier")
        if res["timed_out"]:
            reward, note = 0.0, "grader timed out"
        checks_file = work / "logs" / "verifier" / "checks.json"
        checks = None
        if (checks_file.exists() or checks_file.is_symlink()) and not task.private:
            data = _read_limited(checks_file)
            try:
                checks = json.loads(data) if data is not None else "unreadable checks.json"
            except json.JSONDecodeError:
                checks = "unreadable checks.json"
    finally:
        sandbox.stop()
        shutil.rmtree(work, ignore_errors=True)
    return {"grader": grader, "reward": reward, "passed": reward >= 1.0 - 1e-9, "note": note,
            "timed_out": res["timed_out"], "seconds": res["seconds"], "sandbox": sandbox.active,
            "log_tail": "" if task.private else res["output"][-3000:], "checks": checks}


def lab_f_reference(labs_dir, vault=None) -> Path:
    """The public reference merge.py: in the clone before lock_lab_f, in the vault after it."""
    in_clone = Path(labs_dir) / "lab-f" / "repo" / "task" / "solution" / "merge.py"
    if in_clone.is_file():
        return in_clone
    if vault is not None:
        in_vault = Path(vault) / "lab-f" / "task-solution" / "merge.py"
        if in_vault.is_file():
            return in_vault
    raise FileNotFoundError("Lab F reference not found in the clone or the vault")


def lab_f_self_check(task: TaskSpec, labs_dir, reference=None) -> dict:
    """Grade do-nothing and the lab's public reference through THIS harness, for every grader.

    Every grader must give do-nothing 0 and the reference 1 here, as run_task.sh does.
    If not, the harness grades differently from the lab, and no result can be trusted.
    On Colab this also proves that the graders work when run as a sandbox user.
    """
    reference = Path(reference) if reference else lab_f_reference(labs_dir)
    sandbox = sandbox_for(SELF_CHECK_SANDBOX_INDEX)
    root = make_workspace(task, sandbox)
    try:
        nothing = {name: grade(task, root, name, sandbox=sandbox)["reward"] for name in task.graders}
        shutil.copy(reference, root / "freebusy" / "merge.py")
        ref = {name: grade(task, root, name, sandbox=sandbox)["reward"] for name in task.graders}
    finally:
        shutil.rmtree(root.parent, ignore_errors=True)
        sandbox.clean_shared_tmp()
    return {name: {"do-nothing": nothing[name], "reference": ref[name]} for name in task.graders}


def safe_unzip(zip_path, dest) -> Path:
    """Unzip an uploaded grader. Refuse absolute paths, '..' and symlinks.

    Returns the shallowest folder that contains test.sh.
    """
    dest = Path(dest)
    dest.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path) as archive:
        for info in archive.infolist():
            parts = Path(info.filename).parts
            if info.filename.startswith(("/", "\\")) or ".." in parts or (parts and ":" in parts[0]):
                raise ValueError(f"unsafe path in zip: {info.filename}")
            if (info.external_attr >> 16) & 0o170000 == 0o120000:
                raise ValueError(f"symlink in zip: {info.filename}")
        archive.extractall(dest)
    found = sorted(dest.rglob("test.sh"), key=lambda p: len(p.parts))
    found = [p for p in found if "__MACOSX" not in p.parts]
    if not found:
        raise ValueError(f"no test.sh inside {zip_path}")
    return found[0].parent


def sha256_dir(folder) -> str:
    """One hash for a grader folder, so every result names the exact grader it used."""
    digest = hashlib.sha256()
    for rel, path in iter_files(folder):
        digest.update(rel.encode() + b"\0" + path.read_bytes() + b"\0")
    return digest.hexdigest()[:16]
