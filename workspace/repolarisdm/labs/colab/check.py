#!/usr/bin/env python3
"""Self-check for the Colab GPU labs in labs/colab. Standard library only, Python 3.9+.

Usage:
  python3 labs/colab/check.py [--no-pytest] [--require-pytest] [--strict-keys] [--timeout S] [--verbose]

For every labs/colab/*.ipynb it checks that:
  1. the file is JSON in nbformat v4 (cells, types, sources, unique cell ids),
     and no cell has saved outputs or execution counts (no saved widget state either);
  2. the first cell is markdown with a title, a goal tied to Polaris, a time and GPU budget,
     "Done when" and the exact honest label;
  3. every "pip install" (shell, %pip, or a subprocess list) installs only name==version pins
     (or a requirements file, whose lines are checked when the file is in this folder);
  4. it contains no secrets or tokens, and never prints a Colab secret;
  5. it contains no absolute local paths (home folders, macOS temp folders, Windows user folders);
  6. it detects the GPU (nvidia-smi or torch.cuda.get_device_properties, in the notebook or in a
     helper module it imports) and gets the lab files with a shallow, sparse clone;
  7. right after the clone it deletes any answer-key folder (labs/*/_key) that was pushed by mistake;
  8. if it runs model-written code (G1, G2, G3), it never mentions mounting Google Drive.
It also checks lab.json, that README.md links every notebook on Colab, that tests/requirements-*.txt
are pinned, that no other file here holds a secret or a local path, and that no answer-key folder
(_key) is inside labs/colab. Answer keys in the other labs/*/ folders are listed as a note: during the
build they live there until they are moved to your local answer-key store. With --strict-keys (use it
before you publish) any labs/*/_key folder is a FAIL, like the site's own publish-time test.
Last, it runs pytest on tests/ (one file at a time) with $LAB_PYTHON, else python3, if that Python
has pytest. Without pytest the step is skipped, unless you pass --require-pytest.

Every result is one PASS or FAIL line. Exit code 0 when nothing fails, 1 when anything fails,
2 on bad usage. Nothing here needs a GPU, and nothing here downloads anything.
"""
from __future__ import annotations

import argparse
import ast
import json
import os
import re
import shlex
import shutil
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
LAB_ID = "colab"
REPO_URL = "https://github.com/ZelinZhu-Richard/ZelinZhu-Richard.github.io"
COLAB_PREFIX = ("https://colab.research.google.com/github/ZelinZhu-Richard/ZelinZhu-Richard.github.io"
                "/blob/main/workspace/repolarisdm/labs/colab/")
SPARSE_PATH = "workspace/repolarisdm/labs"
HONEST_LABEL = ("Written and CPU-smoke-tested by an automated build on 2026-10-20. Never run on a GPU. "
                "Expect to fix version issues; pin what works and note it.")
ROWS = {f"M{i}" for i in range(1, 11)}
STEPS = {f"S{i}" for i in range(16)}
LAB_FIELDS = {"id": str, "title": str, "language": str, "time": str, "trains": list, "covers": list}
CELL_ID = re.compile(r"^[a-zA-Z0-9_-]{1,64}$")

# name==version, optional extras. No wildcards, no ranges, no URLs.
PIN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*(\[[A-Za-z0-9._,-]+\])?==[0-9][A-Za-z0-9.+!_-]*$")
FLAGS_WITH_ARG = {"-r", "--requirement", "-c", "--constraint", "-i", "--index-url", "--extra-index-url",
                  "-f", "--find-links", "-t", "--target", "--python", "-p", "--prefix", "--root"}
FILE_FLAGS = {"-r", "--requirement", "-c", "--constraint"}
SHELL_PIP = re.compile(r"\bpip3?\s+install\b(?P<rest>.*)")
SHELL_STOP = re.compile(r"&&|\|\||;|\||`|\)|\s#")

# Token shapes. The character classes keep these source lines from matching themselves.
SECRET_PATTERNS = [
    ("Hugging Face token", re.compile(r"\bhf_[A-Za-z0-9]{30,}")),
    ("sk- style API key", re.compile(r"\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}")),
    ("GitHub token", re.compile(r"\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{20,}")),
    ("Google API key", re.compile(r"\bAIza[0-9A-Za-z_-]{35}")),
    ("AWS access key", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("Slack token", re.compile(r"\bxox[abprs]-[A-Za-z0-9-]{10,}")),
    ("private key block", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
    ("hard-coded credential", re.compile(
        r"""(?i)\b(?:hf_token|hugging_face_hub_token|api[_-]?key|access[_-]?token|auth[_-]?token|"""
        r"""secret|password|passwd)\b["']?\s*[:=]\s*["'](?!(?:EMPTY|dummy|none|null|changeme)["'])"""
        r"""(?!<)[^"'\s]{8,}["']""")),
    ("token passed to login()", re.compile(r"""\blogin\(\s*(?:token\s*=\s*)?["'][^"']{8,}["']""")),
]
# Absolute paths on someone's own machine. Colab paths (/content, /root) are fine.
LOCAL_PATH_PATTERNS = [
    ("home folder path", re.compile(r"/(?:Users|home)/[A-Za-z0-9._-]+/")),
    ("macOS temp path", re.compile(r"/private/(?:tmp|var)/\S|/var/(?:folders)/")),
    ("Windows user path", re.compile(r"\b[A-Za-z]:\\+(?:Users|Documents and Settings)\\")),
    ("mounted volume path", re.compile(r"/Volumes/[A-Za-z0-9]")),
    ("file:// URL", re.compile(r"file:/{3}")),
]
PRIVATE_CANARY_WORD = "CHRONOS" + "-CANARY"      # split so this file never contains the word
SECRET_PRINT = re.compile(r"\b(?:print|display|pprint|echo|logging\.\w+|logger\.\w+)\b.*"
                          r"(?:userdata\.get\(|\$\{?HF_TOKEN|environ(?:\.get\(|\[)\s*[\"']HF_TOKEN)")
SCAN_SUFFIXES = {".py", ".md", ".json", ".txt", ".ipynb", ".csv", ".toml", ".cfg", ".sh"}
SKIP_DIRS = {"__pycache__", ".pytest_cache", ".ipynb_checkpoints", ".venv", "venv", ".git"}
KEY_GUARD = ('glob.glob("/content/repo/workspace/repolarisdm/labs/*/_key")', "shutil.rmtree(key_dir)")
RUNS_MODEL_CODE = ("g1-", "g2-", "g3-")   # notebooks that execute model-written code


class Report:
    def __init__(self, verbose: bool) -> None:
        self.passed = 0
        self.failed: list[str] = []
        self.verbose = verbose

    def check(self, ok: bool, what: str, detail: str = "") -> bool:
        if ok:
            self.passed += 1
            print(f"PASS {what}" + (f" ({detail})" if detail and self.verbose else ""))
        else:
            self.failed.append(what)
            print(f"FAIL {what}" + (f" ({detail})" if detail else ""))
        return ok

    def note(self, text: str) -> None:
        print(f"  note: {text}")


def rel(path: Path) -> str:
    try:
        return str(path.relative_to(HERE))
    except ValueError:
        return path.name


def source_text(cell: dict) -> str:
    src = cell.get("source", "")
    return "".join(src) if isinstance(src, list) else str(src)


def squash(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


# --------------------------------------------------------------------------- structure

def check_structure(nb: object, name: str, rep: Report) -> bool:
    problems = []
    if not isinstance(nb, dict):
        return rep.check(False, f"{name}: nbformat v4 structure", "top level is not an object")
    if nb.get("nbformat") != 4:
        problems.append(f"nbformat is {nb.get('nbformat')!r}, not 4")
    minor = nb.get("nbformat_minor")
    if not isinstance(minor, int):
        problems.append("nbformat_minor missing")
    if not isinstance(nb.get("metadata"), dict):
        problems.append("metadata missing")
    cells = nb.get("cells")
    if not isinstance(cells, list) or not cells:
        problems.append("no cells")
        cells = []
    ids = []
    for i, cell in enumerate(cells):
        if not isinstance(cell, dict):
            problems.append(f"cell {i} is not an object")
            continue
        kind = cell.get("cell_type")
        if kind not in ("code", "markdown", "raw"):
            problems.append(f"cell {i} has cell_type {kind!r}")
        src = cell.get("source")
        if not (isinstance(src, str) or (isinstance(src, list) and all(isinstance(s, str) for s in src))):
            problems.append(f"cell {i} source is not a string or a list of strings")
        if not isinstance(cell.get("metadata"), dict):
            problems.append(f"cell {i} has no metadata object")
        if isinstance(minor, int) and minor >= 5:
            cid = cell.get("id")
            if not isinstance(cid, str) or not CELL_ID.match(cid):
                problems.append(f"cell {i} has no valid id (required from nbformat 4.5)")
            ids.append(cid)
    dupes = sorted({c for c in ids if isinstance(c, str) and ids.count(c) > 1})
    if dupes:
        problems.append(f"duplicate cell ids {dupes[:3]}")
    return rep.check(not problems, f"{name}: valid nbformat v4 JSON ({len(cells)} cells, 4.{minor})",
                     "; ".join(problems[:5]))


def check_no_outputs(nb: dict, name: str, rep: Report) -> None:
    problems = []
    for i, cell in enumerate(nb.get("cells", [])):
        if cell.get("cell_type") == "code":
            if "outputs" not in cell or cell.get("outputs") != []:
                problems.append(f"cell {i} has outputs" if cell.get("outputs") else f"cell {i} lacks 'outputs': []")
            if "execution_count" not in cell or cell.get("execution_count") is not None:
                problems.append(f"cell {i} execution_count is {cell.get('execution_count', 'missing')!r}")
        else:
            for key in ("outputs", "execution_count"):
                if key in cell:
                    problems.append(f"{cell.get('cell_type')} cell {i} has '{key}'")
    if "widgets" in nb.get("metadata", {}):
        problems.append("metadata.widgets holds saved widget state")
    rep.check(not problems, f"{name}: no saved outputs or execution counts", "; ".join(problems[:5]))


# --------------------------------------------------------------------------- first cell

def check_first_cell(nb: dict, name: str, rep: Report) -> None:
    cells = nb.get("cells", [])
    first = cells[0] if cells else {}
    text = source_text(first)
    lines = [ln for ln in text.splitlines() if ln.strip()]
    flat = squash(text)
    problems = []
    if first.get("cell_type") != "markdown":
        problems.append("first cell is not markdown")
    if not lines or not lines[0].startswith("# "):
        problems.append("no '# ' title on the first line")
    if not re.search(r"\bGoal\b", text):
        problems.append("no 'Goal'")
    if "Polaris" not in text:
        problems.append("goal is not tied to Polaris (no 'Polaris')")
    if not (re.search(r"(?i)\b(?:time|budget)\b", text) and "GPU" in text
            and re.search(r"\d\s*(?:min|minutes|h|hours?)\b", text)):
        problems.append("no time and GPU budget (needs 'time' or 'budget', 'GPU' and a duration)")
    if "T4" not in text:
        problems.append("budget does not mention the T4 (Colab's free-tier GPU)")
    if "Done when" not in text:
        problems.append("no 'Done when'")
    if HONEST_LABEL not in flat:
        problems.append("the exact honest label is missing")
    rep.check(not problems, f"{name}: first cell has title, goal, budget, 'Done when' and the honest label",
              "; ".join(problems))


# --------------------------------------------------------------------------- pip pins

def requirement_lines(path: Path) -> list[str]:
    out = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.split(" #")[0].strip()
        if line and not line.startswith("#"):
            out.append(line)
    return out


def check_spec_tokens(tokens: list[str], where: str, problems: list[str], notes: list[str]) -> int:
    """Check pip arguments. Returns the number of packages seen."""
    count, i = 0, 0
    while i < len(tokens):
        tok = tokens[i]
        if tok.startswith("-"):
            flag = tok.split("=", 1)[0]
            arg = tok.split("=", 1)[1] if "=" in tok else (tokens[i + 1] if i + 1 < len(tokens) else "")
            if flag in FILE_FLAGS:
                req = (HERE / arg) if arg and not arg.startswith(("<", "$", "{")) else None
                if req is not None and req.is_file():
                    bad = [ln for ln in requirement_lines(req) if not PIN.match(ln)]
                    if bad:
                        problems.append(f"{where}: {arg} has unpinned lines {bad[:3]}")
                    count += 1
                else:
                    count += 1
                    notes.append(f"{where}: '{flag} {arg}' installs from a file outside this folder; "
                                 "its pins are not checked here")
            if flag in FLAGS_WITH_ARG and "=" not in tok:
                i += 1
            i += 1
            continue
        count += 1
        if not PIN.match(tok):
            problems.append(f"{where}: '{tok}' is not pinned as name==version")
        i += 1
    if count == 0:
        problems.append(f"{where}: 'pip install' with no package")
    return count


def shell_pip_problems(line: str, where: str, problems: list[str], notes: list[str],
                       prose: bool = False) -> int:
    """Check every `pip install` on one line. In prose (markdown), a bare mention with no
    arguments, like "every `pip install` is pinned", is not a command and is skipped."""
    seen = 0
    for m in SHELL_PIP.finditer(line):
        rest = SHELL_STOP.split(m.group("rest"), maxsplit=1)[0]
        try:
            tokens = shlex.split(rest, posix=True)
        except ValueError:
            tokens = rest.split()
        if prose and not tokens:
            continue
        seen += 1
        check_spec_tokens(tokens, where, problems, notes)
    return seen


def parse_cell(src: str) -> ast.AST | None:
    """Parse a code cell as Python, with IPython magics and shell lines replaced by `pass`."""
    lines = []
    for line in src.splitlines():
        stripped = line.lstrip()
        if stripped.startswith(("!", "%")):
            lines.append(line[: len(line) - len(stripped)] + "pass")
        else:
            lines.append(line)
    try:
        return ast.parse("\n".join(lines))
    except SyntaxError:
        return None


def literal_strings(node: ast.AST) -> list[str] | None:
    """Strings in a literal list/tuple/set/dict-values expression, or None if it is not a literal."""
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return [node.value]
    if isinstance(node, (ast.List, ast.Tuple, ast.Set)):
        out: list[str] = []
        for elt in node.elts:
            got = literal_strings(elt.value if isinstance(elt, ast.Starred) else elt)
            if got is None:
                return None
            out += got
        return out
    if isinstance(node, ast.Dict):
        out = []
        for val in node.values:
            got = literal_strings(val)
            if got is None:
                return None
            out += got
        return out
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
        left, right = literal_strings(node.left), literal_strings(node.right)
        return None if left is None or right is None else left + right
    return None


def module_constant(module: str, attr: str) -> ast.AST | None:
    path = HERE / f"{module}.py"
    if not re.match(r"^[A-Za-z_]\w*$", module) or not path.is_file():
        return None
    try:
        tree = ast.parse(path.read_text(encoding="utf-8"))
    except SyntaxError:
        return None
    found = None
    for stmt in tree.body:
        if isinstance(stmt, ast.Assign) and any(isinstance(t, ast.Name) and t.id == attr for t in stmt.targets):
            found = stmt.value
        elif isinstance(stmt, ast.AnnAssign) and isinstance(stmt.target, ast.Name) and stmt.target.id == attr:
            found = stmt.value
    return found


def resolve(node: ast.AST, trees: list[ast.AST], depth: int = 0) -> list[str] | None:
    """Resolve a pip argument expression to its strings, following names into this folder's modules."""
    if depth > 6:
        return None
    direct = literal_strings(node)
    if direct is not None:
        return direct
    if isinstance(node, ast.Starred):
        return resolve(node.value, trees, depth + 1)
    if isinstance(node, ast.Subscript):           # PINS[backend]: every value of PINS must be pinned
        return resolve(node.value, trees, depth + 1)
    if isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name):
        value = module_constant(node.value.id, node.attr)
        return None if value is None else resolve(value, trees, depth + 1)
    if isinstance(node, ast.Name):
        values = []
        for tree in trees:
            for sub in ast.walk(tree):
                if isinstance(sub, ast.Assign) and any(isinstance(t, ast.Name) and t.id == node.id
                                                       for t in sub.targets):
                    values.append(sub.value)
        if not values:
            return None
        out: list[str] = []
        for value in values:
            got = resolve(value, trees, depth + 1)
            if got is None:
                return None
            out += got
        return out
    return None


def python_pip_calls(tree: ast.AST, trees: list[ast.AST], where: str, problems: list[str],
                     notes: list[str]) -> int:
    seen = 0
    for call in ast.walk(tree):
        if not isinstance(call, ast.Call):
            continue
        items: list[ast.AST] = []
        for arg in call.args:
            items += list(arg.elts) if isinstance(arg, (ast.List, ast.Tuple)) else [arg]
        consts = [it.value if isinstance(it, ast.Constant) else None for it in items]
        if "install" not in consts:
            continue
        k = consts.index("install")
        if not any(c in ("pip", "pip3") for c in consts[:k]):
            continue
        seen += 1
        tokens: list[str] = []
        for it in items[k + 1:]:
            got = resolve(it, trees)
            if got is None:
                problems.append(f"{where}: cannot see what a pip install argument holds "
                                f"({ast.dump(it)[:60]}); use a literal list of name==version pins")
                tokens = []
                break
            tokens += got
        else:
            check_spec_tokens(tokens, where, problems, notes)
    return seen


def check_pins(nb: dict, name: str, rep: Report) -> None:
    problems: list[str] = []
    notes: list[str] = []
    cells = nb.get("cells", [])
    trees = []
    for cell in cells:
        if cell.get("cell_type") == "code":
            tree = parse_cell(source_text(cell))
            if tree is not None:
                trees.append(tree)
    installs = 0
    for i, cell in enumerate(cells):
        src = source_text(cell)
        where = f"cell {i}"
        prose = cell.get("cell_type") != "code"
        for line in src.splitlines():
            installs += shell_pip_problems(line, where, problems, notes, prose=prose)
        if cell.get("cell_type") == "code":
            tree = parse_cell(src)
            if tree is None:
                if re.search(r"""["']pip3?["']""", src) and re.search(r"""["']install["']""", src):
                    problems.append(f"{where}: cannot parse this cell to check its pip install")
                continue
            installs += python_pip_calls(tree, trees, where, problems, notes)
    for text in notes:
        rep.note(f"{name}: {text}")
    rep.check(not problems and installs > 0,
              f"{name}: every pip install is pinned with == ({installs} install command(s))",
              "; ".join(problems[:5]) if problems else ("no pip install found" if not installs else ""))


# --------------------------------------------------------------------------- secrets and paths

def scan_text(text: str, canary_word: bool = True) -> list[str]:
    """Secret shapes in text. canary_word=False for test files, which may list the word to forbid it."""
    hits = []
    for label, pattern in SECRET_PATTERNS:
        m = pattern.search(text)
        if m:
            hits.append(f"{label}: '{m.group(0)[:12]}...'")
    if canary_word and PRIVATE_CANARY_WORD in text:
        hits.append("the private capstone canary word")
    return hits


def scan_paths(text: str) -> list[str]:
    hits = []
    for label, pattern in LOCAL_PATH_PATTERNS:
        m = pattern.search(text)
        if m:
            hits.append(f"{label}: '{m.group(0)[:40]}'")
    return hits


def notebook_text(nb: dict) -> str:
    parts = [source_text(c) for c in nb.get("cells", [])]
    parts.append(json.dumps(nb.get("metadata", {})))
    parts += [json.dumps(c.get("metadata", {})) for c in nb.get("cells", [])]
    return "\n".join(parts)


def check_secrets(nb: dict, raw: str, name: str, rep: Report) -> None:
    hits = scan_text(notebook_text(nb)) + scan_text(raw)
    secret_vars = set()
    for cell in nb.get("cells", []):
        if cell.get("cell_type") == "code":
            secret_vars |= set(re.findall(r"\b([A-Za-z_]\w*)\s*=\s*userdata\.get\(", source_text(cell)))
    for i, cell in enumerate(nb.get("cells", [])):
        if cell.get("cell_type") != "code":
            continue
        for line in source_text(cell).splitlines():
            code = line.split("#", 1)[0]
            if SECRET_PRINT.search(code):
                hits.append(f"cell {i} prints a secret: {line.strip()[:60]}")
            for var in secret_vars:
                if re.search(rf"\b(?:print|display|pprint)\s*\(.*\b{re.escape(var)}\b", code):
                    hits.append(f"cell {i} prints '{var}', which holds a Colab secret")
    rep.check(not hits, f"{name}: no secrets or tokens, and no secret is printed", "; ".join(sorted(set(hits))[:5]))


def check_paths(nb: dict, raw: str, name: str, rep: Report) -> None:
    hits = scan_paths(notebook_text(nb)) + scan_paths(raw)
    rep.check(not hits, f"{name}: no absolute local paths", "; ".join(sorted(set(hits))[:5]))


# --------------------------------------------------------------------------- GPU check and clone

def helper_sources(code: str) -> str:
    """Source of this folder's helper modules that the notebook imports (gN_*.py)."""
    names = set(re.findall(r"^\s*(?:import|from)\s+(g\d_\w+)", code, re.M))
    for group in re.findall(r"^\s*import\s+([\w, ]+)$", code, re.M):
        names |= {n.strip() for n in group.split(",") if re.match(r"^g\d_\w+$", n.strip())}
    out = []
    for module in sorted(names):
        path = HERE / f"{module}.py"
        if path.is_file():
            out.append(path.read_text(encoding="utf-8"))
    return "\n".join(out)


def check_gpu_and_clone(nb: dict, name: str, rep: Report) -> None:
    code = "\n".join(source_text(c) for c in nb.get("cells", []) if c.get("cell_type") == "code")
    helpers = helper_sources(code)
    both = code + "\n" + helpers
    detects = any(s in both for s in ("nvidia-smi", "get_device_properties"))
    dtypes = "bfloat16" in both and any(s in both for s in ("float16", '"half"', "'half'", "float32"))
    rep.check(detects and dtypes, f"{name}: detects the GPU and picks a precision for it",
              ("no nvidia-smi or torch.cuda.get_device_properties in the notebook or its helpers; " if not detects
               else "") + ("no bfloat16 / float16 choice found" if not dtypes else ""))
    problems = []
    if "clone" in code:
        for needle in ("--depth", "--filter=blob:none", "--sparse", REPO_URL, "sparse-checkout", SPARSE_PATH):
            if needle not in code:
                problems.append(f"clone code lacks {needle!r}")
        if not re.search(r"""--depth["',\s=]+1\b""", code):
            problems.append("clone is not --depth 1")
    else:
        problems.append("no git clone of the lab files")
    rep.check(not problems, f"{name}: gets the lab files with a shallow, sparse clone", "; ".join(problems))
    rep.check(all(k in code for k in KEY_GUARD), f"{name}: deletes any pushed answer keys right after the clone",
              f"no {KEY_GUARD[0]} ... {KEY_GUARD[1]} in a code cell")
    if name.startswith(RUNS_MODEL_CODE):
        text = "\n".join(source_text(c) for c in nb.get("cells", []))
        rep.check("drive.mount" not in text, f"{name}: runs model code, so it never mounts Google Drive",
                  "found drive.mount")


# --------------------------------------------------------------------------- folder-level checks

def check_lab_json(rep: Report) -> None:
    path = HERE / "lab.json"
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        rep.check(False, "lab.json is valid JSON", str(exc))
        return
    problems = []
    if not isinstance(data, dict):
        rep.check(False, "lab.json is an object")
        return
    for key, kind in LAB_FIELDS.items():
        if not isinstance(data.get(key), kind):
            problems.append(f"field {key!r} is not a {kind.__name__}")
    if data.get("id") != LAB_ID:
        problems.append(f"id is {data.get('id')!r}, not {LAB_ID!r}")
    bad_rows = [r for r in data.get("covers") or [] if r not in ROWS]
    bad_steps = [s for s in data.get("trains") or [] if s not in STEPS]
    if bad_rows:
        problems.append(f"covers has non-rows {bad_rows}")
    if bad_steps:
        problems.append(f"trains has non-steps {bad_steps}")
    rep.check(not problems, f"lab.json has id, title, language, time, trains and covers "
              f"(covers {data.get('covers')}, trains {data.get('trains')})", "; ".join(problems))


def check_readme(notebooks: list[Path], rep: Report) -> None:
    path = HERE / "README.md"
    if not rep.check(path.is_file(), "README.md exists"):
        return
    text = path.read_text(encoding="utf-8")
    missing = [nb.name for nb in notebooks if COLAB_PREFIX + nb.name not in text]
    rep.check(not missing, f"README.md links all {len(notebooks)} notebooks on Colab", f"missing {missing}")
    problems: list[str] = []
    notes: list[str] = []
    for n, line in enumerate(text.splitlines(), 1):
        shell_pip_problems(line, f"README.md line {n}", problems, notes, prose=True)
    rep.check(not problems, "README.md: every pip install is pinned with ==", "; ".join(problems[:5]))


def check_requirements(rep: Report) -> None:
    files = sorted((HERE / "tests").glob("requirements*.txt"))
    bad = []
    for path in files:
        bad += [f"{rel(path)}: {ln}" for ln in requirement_lines(path) if not PIN.match(ln)]
    rep.check(not bad, f"tests/requirements*.txt are pinned with == ({len(files)} file(s))", "; ".join(bad[:5]))


def check_answer_keys(rep: Report, strict: bool) -> None:
    inside = sorted(rel(p) for p in HERE.rglob("_key") if not any(d in p.parts for d in SKIP_DIRS))
    rep.check(not inside, "no answer-key folder (_key) inside labs/colab", f"found {inside}")
    others = sorted(p for p in HERE.parent.glob("*/_key") if p.parent != HERE)
    names = [f"{p.parent.name}/_key" for p in others]
    if strict:
        rep.check(not others, "no answer-key folder in any labs/*/ (publish check)",
                  f"move {names} to your local answer-key store before you publish")
    elif others:
        rep.note(f"answer keys still inside labs/: {names}. Fine during the build; move them before you "
                 "publish (check.py --strict-keys fails on them, as the site's publish test does). "
                 "Every notebook deletes such folders after its clone, but they must never reach GitHub.")


def check_other_files(rep: Report) -> None:
    secret_hits, path_hits, count = [], [], 0
    for dirpath, dirnames, filenames in os.walk(HERE):
        dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIRS)
        for fname in sorted(filenames):
            path = Path(dirpath) / fname
            if path.suffix not in SCAN_SUFFIXES or path.suffix == ".ipynb":
                continue
            try:
                text = path.read_text(encoding="utf-8")
            except (OSError, UnicodeDecodeError):
                continue
            count += 1
            is_test = path.name.startswith("test_") or path.name == "check.py"
            secret_hits += [f"{rel(path)}: {h}" for h in scan_text(text, canary_word=not is_test)]
            path_hits += [f"{rel(path)}: {h}" for h in scan_paths(text)]
    rep.check(not secret_hits, f"no secrets or tokens in the other {count} text files here", "; ".join(secret_hits[:5]))
    rep.check(not path_hits, f"no absolute local paths in the other {count} text files here", "; ".join(path_hits[:5]))


# --------------------------------------------------------------------------- pytest

def find_python() -> tuple[str | None, str]:
    env = os.environ.get("LAB_PYTHON")
    if env:
        exe = shutil.which(env) or (env if Path(env).is_file() else None)
        return exe, f"LAB_PYTHON={env}"
    exe = shutil.which("python3")
    return (exe, "python3 on PATH") if exe else (sys.executable, "this Python")


def run_pytest(rep: Report, timeout: int, require: bool, verbose: bool) -> None:
    tests = sorted((HERE / "tests").glob("test_*.py"))
    if not tests:
        rep.check(False, "tests/ has smoke tests")
        return
    exe, how = find_python()
    if exe is None:
        rep.check(False, "LAB_PYTHON points to a Python", how)
        return
    probe = subprocess.run([exe, "-c", "import sys, pytest; print(sys.version.split()[0], pytest.__version__)"],
                           capture_output=True, text=True)
    if probe.returncode != 0:
        msg = (f"pytest is not importable with {exe} ({how}). Set LAB_PYTHON to a Python with pytest, "
               "see README.md")
        if require:
            rep.check(False, "a Python with pytest is available", msg)
        else:
            print(f"SKIP smoke tests: {msg}")
        return
    py_version, pytest_version = probe.stdout.split()
    print(f"  smoke tests with {how}: Python {py_version}, pytest {pytest_version}")
    env = dict(os.environ, PYTHONDONTWRITEBYTECODE="1")
    for test in tests:
        cmd = [exe, "-m", "pytest", "-q", "-p", "no:cacheprovider", str(test.relative_to(HERE))]
        start = time.monotonic()
        try:
            res = subprocess.run(cmd, cwd=HERE, env=env, capture_output=True, text=True, timeout=timeout)
        except subprocess.TimeoutExpired:
            rep.check(False, f"pytest {rel(test)}", f"no result after {timeout} s")
            continue
        secs = time.monotonic() - start
        lines = [ln for ln in res.stdout.strip().splitlines() if ln.strip()]
        summary = lines[-1].strip("= ") if lines else "no output"
        ok = res.returncode == 0
        rep.check(ok, f"pytest {rel(test)}: {summary}", f"exit {res.returncode}, {secs:.0f} s")
        if not ok or verbose:
            tail = (res.stdout + res.stderr).rstrip().splitlines()[-30:]
            for line in tail:
                print(f"  | {line}")


# --------------------------------------------------------------------------- main

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--no-pytest", action="store_true", help="skip the CPU smoke tests")
    parser.add_argument("--require-pytest", action="store_true", help="fail if no Python with pytest is found")
    parser.add_argument("--strict-keys", action="store_true",
                        help="fail if any labs/*/_key answer-key folder exists (use before publishing)")
    parser.add_argument("--timeout", type=int, default=900, help="seconds per test file (default 900)")
    parser.add_argument("--verbose", action="store_true", help="print details and pytest output")
    args = parser.parse_args()
    rep = Report(args.verbose)

    notebooks = sorted(HERE.glob("*.ipynb"))
    print(f"== labs/colab: {len(notebooks)} notebook(s)")
    rep.check(len(notebooks) >= 1, "at least one notebook is here")
    for path in notebooks:
        name = path.name
        try:
            raw = path.read_text(encoding="utf-8")
            nb = json.loads(raw)
        except (OSError, UnicodeDecodeError, ValueError) as exc:
            rep.check(False, f"{name}: valid JSON", str(exc))
            continue
        if not check_structure(nb, name, rep):
            continue
        check_no_outputs(nb, name, rep)
        check_first_cell(nb, name, rep)
        check_pins(nb, name, rep)
        check_secrets(nb, raw, name, rep)
        check_paths(nb, raw, name, rep)
        check_gpu_and_clone(nb, name, rep)

    print("\n== folder")
    check_lab_json(rep)
    check_readme(notebooks, rep)
    check_requirements(rep)
    check_other_files(rep)
    check_answer_keys(rep, args.strict_keys)

    if args.no_pytest:
        print("\n== smoke tests: skipped (--no-pytest)")
    else:
        print("\n== smoke tests (CPU only; nothing here runs a GPU)")
        run_pytest(rep, args.timeout, args.require_pytest, args.verbose)

    print(f"\ncolab: {rep.passed} PASS, {len(rep.failed)} FAIL")
    print("ALL OK" if not rep.failed else "FAILED: " + "; ".join(rep.failed[:10]))
    return 1 if rep.failed else 0


if __name__ == "__main__":
    sys.exit(main())
