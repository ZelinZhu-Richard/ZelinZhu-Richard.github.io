---
title: Toolbelt (just in time)
short: Toolbelt
summary: The twelve tools you need to catch agent mistakes and build Polaris-style graders on a Mac. For each tool you get one line on why it matters, the few commands you will really use, real output from this machine, and a 10-minute drill. Open a section on the day a chapter or lab needs that tool.
---

:::selfcheck
- In a `git bisect run` script, what must happen when a commit does not even import, and why? || The script must `exit 125`, so git skips that commit. If it exits 1, git calls the broken commit "bad" and can name the wrong first bad commit. Exit 0 means good. Exit 1 to 127, except 125, means bad. Any other code stops the bisect.
- You gave the agent a practice copy made with `git worktree add`. Can it see the future fix? || Yes. A linked worktree shares all branches and tags with the main repository, so `git log --all` shows later commits and other branches. Use a history-free snapshot in a new temp dir instead: `git archive` plus a fresh `git init`.
- `rg CANARY-7f3a` prints nothing and exits 1. Is the workspace free of the canary (a unique string you planted in private files)? || Not proven. By default ripgrep skips files matched by `.gitignore`, hidden files, binary files and symlinked folders. Search again with `rg -uuu -L`. And rg cannot read old commits, so also run `git log --all -p | rg -F CANARY-7f3a`.
- Name three pytest runs that exit 0 but prove nothing. || Every selected test was skipped. Every selected test was xfailed. A planted `conftest.py` called `os._exit(0)`: exit 0 and no output at all. Also, exit 5 means "no tests collected", and a check that only rejects exit 1 lets it through.
- Write the clang++ flags that make memory errors and undefined behavior fail a run on macOS. Name one sanitizer Apple clang lacks. || `-g -fsanitize=address,undefined -fno-sanitize-recover=all -fno-omit-frame-pointer`. Apple clang has no LeakSanitizer: `-fsanitize=leak` is an unsupported option.
- Run TypeScript tests on Node 22 with no build step. Name two things that fail in strip-only mode. || `node --test` finds `*.test.ts` files on Node 22.18 or newer. An `enum` and a constructor parameter property both fail with `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`. An import without the `.ts` extension fails with `ERR_MODULE_NOT_FOUND`.
:::

## Why Polaris cares

Polaris engineers build tasks: a prompt and a grader or rubric that turns an attempt into a number ^[confirmed](https://www.google.com/about/careers/applications/jobs/results/114077679900074694-research-engineer-polaris-deepmind "2026-10-19").
For software tasks, the prompt comes with a repository ^[inference](- "2026-10-20").
Most code graders are built from the tools on this page: a test runner, a container, and a script that writes a reward file such as `/logs/verifier/reward.txt` in the Harbor format (a public task layout from the Terminal-Bench team; see [[task-design]]) ^[confirmed](https://docs.harborframework.com/tasks/overview "2026-10-20").
The same tools are the **[D]** role in the [[agent-patch-audit]]: an agent's claim is a guess until a deterministic tool confirms it.
Agents also use these tools to cheat: in SWE-bench, agents ran `git log --all` inside the eval container, and some runs found the gold patch (the reference fix) ^[confirmed](https://github.com/SWE-bench/SWE-bench/issues/465 "2026-10-20").
And Google DeepMind's default is no AI tools in live interviews, so you must drive every tool here with your own hands ^[confirmed](https://storage.googleapis.com/deepmind-media/DeepMind.com/Assets/Docs/interviewing-at-google-deepmind.pdf "2026-10-20").

## How to use this page {#how-to-use}

This page is a reference, not a course. Do not read it from top to bottom. When a chapter or lab needs a tool, read that one section and do its drill.

| Tool | You need it to | Audit steps | Where it comes up first |
|---|---|---|---|
| [git](#git) | isolate a copy, read history, find the first bad commit, see what changed | [[S0]], [[S2]], [[S7]], [[S10]] | [[map]], [[debug]], [[lab:lab-e]] |
| [ripgrep](#ripgrep) | check an agent's claim in seconds, scan for canaries | [[S2]], [[S4]], [[S11]] | [[map]], [[lab:lab-a]] |
| [uv and venv](#uv) | one pinned Python environment per lab | [[S1]] | every Python lab |
| [pytest](#pytest) | baseline, reproduce, re-run | [[S1]], [[S6]], [[S11]] | [[agent-patch-audit]] |
| [coverage.py](#coverage) | see which lines a test really ran | [[S2]] | [[map]] |
| [Hypothesis](#hypothesis) | attack a fix with generated inputs | [[S12]] | [[prove]] |
| [Docker](#docker) | run a task with the network off, collect the reward | [[S0]], [[S11]] | [[lab:lab-f]], [[grader-validity]] |
| [CMake and make](#cmake) | build and test a C++ repo | [[S1]], [[S11]] | [[lab:lab-d]] |
| [Sanitizers](#sanitizers) | turn C++ memory bugs into failing runs | [[S11]] | [[lab:lab-d]], [[debug]] |
| [lldb](#lldb) | stop a C++ program and look inside | [[S7]] | [[lab:lab-d]] |
| [Node 22 TypeScript](#node-ts) | run and test a TypeScript repo with no build step | [[S1]] to [[S11]] | [[lab:lab-h]], [[unfamiliar-stacks]] |
| [agy](#agy) | drive the agent safely, gate **headless** runs (no human at the keyboard) | [[S0]], [[S3]], [[S9]], [[S11]] | [[start-here#day-1]] |

The sprint has no separate toolbelt block. Open a section only when a sprint task needs it. For `audit-01.md` ([[tracker#block-1]], inside its 3 h), use git (snapshot, `diff --stat`) and pytest. For Lab F (Oct 24–27, inside its 2 h), you need Docker only if you run it with `--docker`. Do the other sections after you apply ([[tracker#after-applying]]).

Every command on this page was run on 2026-10-20 on macOS 26.6.1 (arm64) in zsh, except where a section says otherwise. Output blocks are real. A line with only `...` marks output we cut, and long temp paths are shortened to `.../`. Some tools print differently in a terminal than through a pipe. The sections say where.

## Before you start {#setup}

Check what you have. Real output from this Mac:

```zsh
git --version; rg --version | head -1; uv --version; python3 --version
docker --version; cmake --version | head -1; make --version | head -1
clang --version | head -1; lldb --version | head -1; node --version; jq --version
```

```text
git version 2.55.0
ripgrep 15.2.0
uv 0.12.1 (Homebrew 2026-07-31 aarch64-apple-darwin)
Python 3.13.9
Docker version 29.6.2, build dfc4efb
cmake version 4.4.2
GNU Make 3.81
Apple clang version 21.0.0 (clang-2100.1.1.101)
lldb-2100.0.17.203
v22.21.1
jq-1.8.1
```

If something is missing: `brew install ripgrep uv cmake jq` with Homebrew, Docker Desktop from Docker's site, and `xcode-select --install` for clang, make and lldb. We did not run these installs, because every tool was already present. macOS also ships its own `jq` at `/usr/bin/jq` (version 1.7.1 here).

**Where to work.** Always in a throwaway folder, never in your home folder or the portfolio repository:

```zsh
TB=$(mktemp -d) && cd "$TB" && pwd
export PYTHONDONTWRITEBYTECODE=1
```

`TB` is your toolbelt folder. Each section starts with `cd "$TB"`. A new terminal forgets `TB`, so set it again to the path `pwd` printed. `PYTHONDONTWRITEBYTECODE=1` stops Python from writing `__pycache__` folders. We captured every output with it set. Without it, a stray `__pycache__` folder can change file counts, such as the `rg --files` counts below.

**The shared example.** Most sections use one tiny repo, `shop`. A script builds it with fixed names and dates, so your commit IDs match ours. Save this as `make_demo.sh` in `$TB`:

```sh
#!/bin/sh
# make_demo.sh: build a 12-commit repo "shop" with one bad commit and one
# commit that does not even import. Same commit IDs on every machine.
set -eu
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1   # ignore your own git config
export GIT_AUTHOR_NAME=Demo GIT_AUTHOR_EMAIL=demo@example.invalid
export GIT_COMMITTER_NAME=Demo GIT_COMMITTER_EMAIL=demo@example.invalid
rm -rf shop && mkdir shop && cd shop && git init -q -b main
n=0
commit() {   # commit "message": stage everything, commit with a fixed date
  n=$((n + 1))
  export GIT_AUTHOR_DATE="2026-10-01T10:$(printf %02d $n):00Z" GIT_COMMITTER_DATE="2026-10-01T10:$(printf %02d $n):00Z"
  git add -A && git commit -q -m "$1"
}
cat > cart.py <<'PY'
def total(prices, discount=0):
    """Sum of prices in cents, minus a percent discount, rounded down."""
    subtotal = sum(prices)
    return subtotal - subtotal * discount // 100
PY
commit "Add cart.total"
echo "# shop" > README.md;                         commit "Add README"
printf 'def with_tax(cents, rate):\n    return cents + cents * rate // 100\n' > tax.py
commit "Add tax helper"
echo "total() takes prices in cents." >> README.md; commit "Document cents"
git tag v1.0
echo "FREE_SHIPPING_CENTS = 5000" > shipping.py;    commit "Add free shipping threshold"
echo "def broken(:" >> cart.py;                     commit "WIP: start refactor"
sed -i.bak '$d' cart.py && rm cart.py.bak;          commit "Finish refactor"
cat > cart.py <<'PY'
def total(prices, discount=0):
    """Sum of prices in cents, minus a percent discount, rounded down."""
    return sum(p - p * discount // 100 for p in prices)
PY
commit "Apply discount per item"
echo "## 1.1" > CHANGELOG.md;                       commit "Add changelog"
echo "Discounts are percent." >> README.md;         commit "Document discounts"
echo "VERSION = '1.1'" > version.py;                commit "Add version"
echo "- per-item discount" >> CHANGELOG.md;         commit "Update changelog"
git log --oneline | wc -l
```

```zsh
sh make_demo.sh && git -C shop log --oneline --decorate
```

```text
      12
1fdc28b (HEAD -> main) Update changelog
eff6c43 Add version
b2ea906 Document discounts
5bc96de Add changelog
a6af482 Apply discount per item
7e360fe Finish refactor
0dd04a3 WIP: start refactor
9e63a9f Add free shipping threshold
be64a39 (tag: v1.0) Document cents
264aacb Add tax helper
07002df Add README
8cb16dd Add cart.total
```

We got the same IDs with Homebrew git 2.55.0 and Apple's git 2.50.1. `GIT_CONFIG_GLOBAL=/dev/null` is what makes this work: your own settings (signing, hooks, default branch) cannot change the commits.

The planted bug is a realistic one. Commit `a6af482` rounds the discount on each item instead of on the total. For `[5, 5]` with 10% off, the right answer is `10 - 1 = 9`. The per-item version gives `5 + 5 = 10`. Most other inputs, like `[100, 250]`, give the same answer both ways. That is a "similar but different" change ([[M5]]).

## 1. Git: history, isolation, diffs {#git}

**Why Polaris cares:** git is how you isolate a practice copy, read history, find the first bad commit and see what an agent really changed. It is also the first place an agent looks for a leaked solution ([[M7]]).

| Command | What it answers | Step |
|---|---|---|
| `git worktree add -b NAME PATH COMMIT` | a second checkout of the same repository | [[S9]] experiments (not isolation) |
| `git blame -L 3,3 cart.py` | which commit last changed line 3 | [[S2]], [[S7]] |
| `git log -S'text' --oneline` | which commits added or removed this exact text | [[S2]], [[S7]], [[S14]] |
| `git log -p -1 -- FILE` | the last patch that touched FILE | [[S2]], [[S10]] |
| `git diff --stat BASE` | which files changed since BASE, and how many lines | [[S10]], [[S11]] |

Real output, after `cd "$TB/shop"`:

```text
$ git blame -L 3,3 cart.py
a6af4825 (Demo 2026-10-01 10:08:00 +0000 3)     return sum(p - p * discount // 100 for p in prices)
$ git log -S"subtotal * discount" --oneline
a6af482 Apply discount per item
8cb16dd Add cart.total
$ git log -p -1 --format="%h %s" -- cart.py
a6af482 Apply discount per item

diff --git a/cart.py b/cart.py
index 2153038..c6c1592 100644
--- a/cart.py
+++ b/cart.py
@@ -1,4 +1,3 @@
 def total(prices, discount=0):
     """Sum of prices in cents, minus a percent discount, rounded down."""
-    subtotal = sum(prices)
-    return subtotal - subtotal * discount // 100
+    return sum(p - p * discount // 100 for p in prices)
$ git diff --stat v1.0
 CHANGELOG.md | 2 ++
 README.md    | 1 +
 cart.py      | 3 +--
 shipping.py  | 1 +
 version.py   | 1 +
 5 files changed, 6 insertions(+), 2 deletions(-)
$ git diff --stat v1.0 -- cart.py tax.py
 cart.py | 3 +--
 1 file changed, 1 insertion(+), 2 deletions(-)
```

Read these outputs closely:

- `-S` (the **pickaxe**) lists commits where the number of times the text appears changed. So it shows the commit that added `subtotal * discount` and the one that removed it. `-G'regex'` is the regex cousin: it lists commits whose diff adds or removes a line that matches ^[confirmed](https://git-scm.com/docs/git-log "2026-10-20"). Here `git log -G'discount // 100' --oneline` gives the same two commits.
- `git diff --stat BASE -- PATHS` limits the summary to some paths. In [[S11]] you run it on `tests/` and `conftest.py`: any line there means the agent touched the tests.
- `git blame` names the last commit that changed a line, not the commit that caused the bug. They are often the same. Check with `git log -p` before you say so.

### A worktree is not isolation {#worktree}

A **worktree** is a second working folder for the same repository. The docs say it shares everything except per-worktree files such as `HEAD` and the index. All branches and tags are shared: every ref under `refs/` except `refs/bisect`, `refs/worktree` and `refs/rewritten` ^[confirmed](https://git-scm.com/docs/git-worktree "2026-10-20"). So the "old" checkout can still see the future. Real output (paths shortened):

```text
$ git worktree add -b try-old ../shop-old v1.0
Preparing worktree (new branch 'try-old')
HEAD is now at be64a39 Document cents
$ git worktree list
/private/var/folders/.../shop     1fdc28b [main]
/private/var/folders/.../shop-old be64a39 [try-old]
$ cd ../shop-old && git log --oneline | wc -l && git log --all --oneline | wc -l
       4
      12
$ git log --all --oneline -S'for p in prices'
a6af482 Apply discount per item
```

From a checkout of v1.0, one command finds the commit that changed the discount code. This is exactly the move agents make. In Cursor's audit, an auditor agent read 731 SWE-bench Pro trajectories (full logs of agent runs) from one model and judged that 9% mined git history ^[confirmed](https://cursor.com/blog/reward-hacking-coding-benchmarks "2026-10-20"). Go back to `shop` and clean up with `git worktree remove ../shop-old && git branch -D try-old`.

For a practice copy the agent may work in, build a snapshot with no history at all, in a new temp dir. From `shop`:

```text
$ snap=$(mktemp -d) && git archive v1.0 | tar -x -C "$snap"
$ cd "$snap" && git init -q -b main && git add -A && git commit -q -m "Snapshot of v1.0"
$ git log --all --oneline | wc -l
       1
```

Never put the snapshot next to the original repo: an agent opened there can run `git -C ../shop log --all` and read the fix. A temp dir only removes that easy route. An agent with no sandbox can still read any path on your Mac, so [[S0]] adds a sandbox too.

Use worktrees for your own parallel experiments. Use snapshots for anything an agent touches. [[map#worktree-leak|Chapter 3]] covers the other leak channels.

### git bisect run and exit 125 {#bisect}

`git bisect` finds the first bad commit by binary search. `git bisect run SCRIPT` runs your script on each commit it picks. The script's exit code is the verdict: 0 means good, 1 to 127 except 125 means bad, 125 means "cannot test this commit, skip it", and any other code stops the bisect ^[confirmed](https://git-scm.com/docs/git-bisect "2026-10-20"). The same page says it is safer to keep the script outside the repository.

Save this as `check.sh` next to `make_demo.sh`, outside `shop`:

```sh
#!/bin/sh
# check.sh: the bisect test. Exit 0 = good, 1 = bad, 125 = cannot test (skip).
export PYTHONDONTWRITEBYTECODE=1   # no stale .pyc files between checkouts
python3 -c 'import cart' 2>/dev/null || exit 125
python3 -c 'import cart, sys; sys.exit(0 if cart.total([5, 5], 10) == 9 else 1)'
```

First prove that the script gives all three answers. Real output:

```text
$ chmod +x check.sh && cd shop
$ ../check.sh; echo "HEAD exit=$?"
HEAD exit=1
$ git checkout -q v1.0 && ../check.sh; echo "v1.0 exit=$?"
v1.0 exit=0
$ git checkout -q 0dd04a3 && ../check.sh; echo "0dd04a3 exit=$?"
0dd04a3 exit=125
$ git checkout -q main
```

Then bisect. `git bisect start BAD GOOD`:

```text
$ git bisect start HEAD v1.0
Bisecting: 3 revisions left to test after this (roughly 2 steps)
[a6af48256bdcb1dde59dcfed217260dafe32ef6a] Apply discount per item
$ git bisect run ../check.sh
running '../check.sh'
Bisecting: 1 revision left to test after this (roughly 1 step)
[0dd04a3fdde9f600299f74f40740dc7844a60503] WIP: start refactor
running '../check.sh'
Bisecting: 1 revision left to test after this (roughly 1 step)
[7e360fe3345e9754f905a58e607b1942ffe8cbac] Finish refactor
running '../check.sh'
a6af48256bdcb1dde59dcfed217260dafe32ef6a is the first 'bad' commit
commit a6af48256bdcb1dde59dcfed217260dafe32ef6a
Author: Demo <demo@example.invalid>
Date:   Thu Oct 1 10:08:00 2026 +0000

    Apply discount per item

 cart.py | 3 +--
 1 file changed, 1 insertion(+), 2 deletions(-)
bisect found first 'bad' commit
$ git bisect log | grep -E '^# (bad|good|skip|first)'
# bad: [1fdc28b45961dc6c9f7cd01fa7c6da326ac83550] Update changelog
# good: [be64a3987c01334fdb7d426d253e3353c77fa571] Document cents
# bad: [a6af48256bdcb1dde59dcfed217260dafe32ef6a] Apply discount per item
# skip: [0dd04a3fdde9f600299f74f40740dc7844a60503] WIP: start refactor
# good: [7e360fe3345e9754f905a58e607b1942ffe8cbac] Finish refactor
# first 'bad' commit: [a6af48256bdcb1dde59dcfed217260dafe32ef6a] Apply discount per item
$ git bisect reset
```

Now the mistake an agent (or a tired human) makes: a script with no 125 line. Save it as `sloppy.sh` next to `check.sh` and `chmod +x` it. The broken commit then exits 1 with a `SyntaxError`, and git believes it:

```text
$ cat ../sloppy.sh
#!/bin/sh
export PYTHONDONTWRITEBYTECODE=1   # no stale .pyc files between checkouts
python3 -c 'import cart, sys; sys.exit(0 if cart.total([5, 5], 10) == 9 else 1)'
$ git bisect start HEAD v1.0 > /dev/null && git bisect run ../sloppy.sh 2>&1 | grep -E "first 'bad'|Error"
SyntaxError: invalid syntax
0dd04a3fdde9f600299f74f40740dc7844a60503 is the first 'bad' commit
bisect found first 'bad' commit
```

Same repo, same search, wrong answer, and git still says "found". Run `git bisect reset` to end it. Then always check the named commit: run your correct script on it and on its parent. Real output: `a6af482~1` exits 0 and `a6af482` exits 1, so the verdict holds. [[debug#bisect|Chapter 6]] has a 40-commit version, and [[lab:lab-e]] has 200 commits.

:::drill id="tb-git-history" title="Five history questions about shop" time="10 min"
Inside `shop`, answer each question with one command. Write the command and its output in your notes.

1. Which commit last changed line 3 of `cart.py`?
2. Which commits added or removed the text `subtotal`?
3. Which files changed between `v1.0` and `HEAD`, and how many lines?
4. What was the last patch that touched `tax.py`?
5. Make a worktree at `v1.0`. From inside it, find the commit that changed the discount code. Then remove the worktree and its branch.

**Done when:** you have five commands with real output, and you can say in one sentence why question 5 means a worktree is not a safe practice copy for an agent.

:::reveal title="Show our answers"
1. `git blame -L 3,3 cart.py` gives `a6af4825`.
2. `git log -S subtotal --oneline` gives `a6af482 Apply discount per item` and `8cb16dd Add cart.total`.
3. `git diff --stat v1.0` gives 5 files, 6 insertions, 2 deletions (output above).
4. `git log -p -1 --format='%h %s' -- tax.py` gives `264aacb Add tax helper` with the two added lines of `with_tax`.
5. `git worktree add -b try-old ../shop-old v1.0`, then inside it `git log --all --oneline -S'for p in prices'` gives `a6af482`. Clean up: `git worktree remove ../shop-old && git branch -D try-old`. A worktree shares all branches and tags with the main repository, so any later commit is one `git log --all` away.
:::
:::

:::drill id="tb-git-bisect" title="Bisect shop twice: right script, sloppy script" time="10 min"
1. Without looking, write `check.sh` with the three exit codes. Keep it outside `shop`.
2. Prove each exit code by hand on `HEAD`, `v1.0` and `0dd04a3`.
3. Run `git bisect start HEAD v1.0` and `git bisect run ../check.sh`. Then `git bisect reset`.
4. Delete the 125 line (keep the `export` line), bisect again, and reset again.
5. Check the named commit and its parent with your correct script.

**Done when:** the correct script names `a6af482`, the sloppy one names `0dd04a3`, and you can explain the difference in two sentences.
:::

## 2. ripgrep {#ripgrep}

**Why Polaris cares:** `rg` checks an agent's "it's in file X at line Y" claim in one second ([[S4]], [[M8]]), and it is your canary scanner. A **canary** is a unique random string you plant in private files: finding it in a workspace or a transcript proves a leak. But rg skips some files by default, and that can hide a leak.

| Command | What it does |
|---|---|
| `rg -n 'def '` | search all files, show line numbers |
| `rg -n -w discount -t py` | whole word only, Python files only |
| `rg -n -F 'p * discount //'` | fixed string: no regex meaning for `*` or `.` |
| `rg -l discount` and `rg -c discount` | file names only; match count per file |
| `rg --sort path ...` | stable output order (slower: no parallelism) |
| `rg -uuu -L PATTERN` | also search ignored, hidden and binary files, and follow symlinks |

Real output, after `cd "$TB/shop"`. We captured it through a pipe. In a terminal, rg prints each file name on its own line, with the matches under it. Add `--no-heading` to get the one-line form shown here.

```text
$ rg -n 'def '
tax.py:1:def with_tax(cents, rate):
cart.py:1:def total(prices, discount=0):
$ rg -n -w discount -t py
cart.py:1:def total(prices, discount=0):
cart.py:2:    """Sum of prices in cents, minus a percent discount, rounded down."""
cart.py:3:    return sum(p - p * discount // 100 for p in prices)
$ rg -n -F 'p * discount //'
cart.py:3:    return sum(p - p * discount // 100 for p in prices)
$ rg -n 'p * discount //'; echo "exit=$?"
exit=1
```

The last search is the trap. Without `-F`, `p *` means "p, then zero or more spaces". The text has `p *`, so nothing matches. An agent that "verifies" with a regex like this will report that the code does not exist. Use `-F` for code you copy.

Note the order: `tax.py` came before `cart.py`. ripgrep searches in parallel, so the order can change between runs. Add `--sort path` when you save output to compare later.

**What ripgrep skips.** By default it ignores files matched by `.gitignore`, hidden files and folders, and binary files, and it does not follow symbolic links. `-u` turns off `.gitignore`, `-uu` also searches hidden files, `-uuu` also searches binary files, and `-L` follows symlinks ^[confirmed](https://github.com/BurntSushi/ripgrep/blob/master/GUIDE.md "2026-10-20"). Even `-uuu` skips a canary behind a symlinked folder: we tested it, and only `-uuu -L` found it. We planted a canary in an ignored folder and in a hidden folder:

```text
$ echo 'notes/' > .gitignore && mkdir -p notes .cache
$ echo 'CANARY-7f3a' > notes/answer.txt && echo 'CANARY-7f3a' > .cache/copy.txt
$ rg -l CANARY-7f3a; echo "exit=$?"
exit=1
$ rg -l -u CANARY-7f3a
notes/answer.txt
$ rg -l --sort path -uu CANARY-7f3a
.cache/copy.txt
notes/answer.txt
$ rg --files | wc -l
       6
$ rg --files -uu | wc -l
      67
```

A plain `rg` said "not found". `-uu` found both. The 61 extra files are mostly inside `.git/`. Clean up with `rm -rf notes .cache .gitignore`, so the rest of this page matches.

**rg cannot read git history.** Git stores old file contents compressed in `.git/objects`, so rg never sees them. We put a canary in a copy of `shop`, on a branch, and deleted it in the next commit. Real output:

```text
$ cp -R ../shop ../leak && cd ../leak
$ git switch -q -c tmp && echo 'CANARY-7f3a' > answer.txt && git add answer.txt && git commit -q -m "Add answer"
$ git rm -q answer.txt && git commit -q -m "Remove answer" && git switch -q main
$ rg -l -uuu -L CANARY-7f3a; echo "exit=$?"
exit=1
$ git log --all -p | rg -F CANARY-7f3a
-CANARY-7f3a
+CANARY-7f3a
```

`-uuu` said "clean", but the canary is one `git log --all` away. So a canary scan has two parts: `rg -l -uuu -L -F CANARY-7f3a .` for files, and `git log --all -p | rg -F CANARY-7f3a` for history. Go back and delete the copy: `cd ../shop && rm -rf ../leak`.

**Exit codes.** 0 means at least one match, 1 means no match, 2 means an error (from `man rg`). So `rg -q -uuu -L CANARY-7f3a . && echo LEAK` is a one-line file check: it printed `LEAK` with the canary present and nothing without it. A missing folder gives exit 2, not 1, so a script can tell "clean" from "could not look".

:::drill id="tb-rg-claims" title="Judge five agent claims with rg" time="10 min"
An agent mapped `shop` and made five claims. Judge each one true or false with one `rg` command. Write the command, the output and your verdict.

1. "`total` is defined at `cart.py:1`."
2. "The discount is applied once, to the subtotal, at `cart.py:4`."
3. "`tax.py` defines `with_tax(cents, rate)`."
4. "The free-shipping threshold of 5000 cents is set in `checkout.py`."
5. "Nothing in the repo mentions per-item discounts."

**Done when:** every claim has a verdict backed by real `rg` output with `file:line`, and you found at least three false claims.

:::reveal title="Show our verdicts"
1. True. `rg -n 'def total' cart.py` gives `1:def total(prices, discount=0):`.
2. False. `rg -n discount cart.py` shows three lines and no line 4. Line 3 applies the discount to each item.
3. True. `rg -n -w with_tax` gives `tax.py:1:def with_tax(cents, rate):`.
4. False. `rg -n --sort path FREE_SHIPPING` gives `shipping.py:1:FREE_SHIPPING_CENTS = 5000`. And `rg --files | rg checkout` exits 1: there is no `checkout.py`.
5. False. `rg -n -F per-item` gives `CHANGELOG.md:2:- per-item discount`.

Claims 2, 4 and 5 sound reasonable. That is the danger of a map written from memory ([[M8]]).
:::
:::

## 3. uv and virtual environments {#uv}

**Why Polaris cares:** a grader must give the same result on every machine. That starts with an environment where every package version is pinned and recorded ([[S1]]). Never install into the Anaconda base environment.

A **virtual environment** (venv) is a folder with its own Python and its own packages. **uv** is a fast tool that makes venvs and installs packages.

| Command | What it does |
|---|---|
| `uv venv --python 3.13 .venv` | make a venv in `.venv` |
| `uv pip install --python .venv/bin/python -r requirements.txt` | install into that venv only |
| `uv pip compile requirements.txt -o requirements.lock` | pin every package, including dependencies |
| `uv pip sync --python .venv/bin/python requirements.lock` | make the venv match the lock exactly |
| `uv pip freeze --python .venv/bin/python` | list what is really installed |

`--python .venv/bin/python` says which environment to change. Without it, a tool can pick a different Python. Work in `$TB/py`, the folder the next three sections use. Real output:

```text
$ cd "$TB" && mkdir -p py && cd py
$ printf 'pytest==9.1.1\nhypothesis==6.170.5\ncoverage==7.16.2\n' > requirements.txt
$ uv venv --python 3.13 .venv
Using CPython 3.13.9 interpreter at: /opt/anaconda3/bin/python3.13
Creating virtual environment at: .venv
Activate with: source .venv/bin/activate
$ uv pip install --python .venv/bin/python -r requirements.txt
Resolved 8 packages in 322ms
Installed 8 packages in 26ms
 + coverage==7.16.2
 + hypothesis==6.170.5
 + iniconfig==2.3.1
 + packaging==26.3
 + pluggy==1.7.0
 + pygments==2.21.0
 + pytest==9.1.1
 + sortedcontainers==2.4.0
```

You pinned 3 packages and got 8. The other 5 (like `pluggy`) were chosen by uv on that day. Another day may bring another `pluggy`. A **lock file** pins them all ^[confirmed](https://docs.astral.sh/uv/pip/compile/ "2026-10-20"):

```text
$ uv pip compile -q requirements.txt -o requirements.lock
$ cat requirements.lock
# This file was autogenerated by uv via the following command:
#    uv pip compile requirements.txt -o requirements.lock
coverage==7.16.2
    # via -r requirements.txt
hypothesis==6.170.5
    # via -r requirements.txt
iniconfig==2.3.1
    # via pytest
packaging==26.3
    # via pytest
pluggy==1.7.0
    # via pytest
pygments==2.21.0
    # via pytest
pytest==9.1.1
    # via -r requirements.txt
sortedcontainers==2.4.0
    # via hypothesis
```

Then activate the venv for your shell, and check that `python` and `pytest` now come from it:

```text
$ source .venv/bin/activate
$ which python pytest
/private/var/folders/.../.venv/bin/python
/private/var/folders/.../.venv/bin/pytest
$ python -m pytest --version
pytest 9.1.1
```

No uv? The standard library works too: `python3 -m venv .venv && .venv/bin/python -m pip install -r requirements.txt`. It is slower and has no `compile`.

:::drill id="tb-uv-rebuild" title="Prove a venv matches its lock, then break it" time="10 min"
In a new throwaway folder:

1. Write the three-line `requirements.txt` above. Make `.venv`, compile `requirements.lock`, and run `uv pip sync --python .venv/bin/python requirements.lock`.
2. Prove the venv equals the lock: `grep -E '^[A-Za-z]' requirements.lock > want.txt`, then `uv pip freeze --python .venv/bin/python > have.txt`, then `cmp want.txt have.txt && echo same`.
3. Break it on purpose: `uv pip install --python .venv/bin/python rich`. Write `have.txt` again and run `cmp` again. It must fail.
4. Run the `uv pip sync` from step 1 again, and repeat step 2.

**Done when:** `cmp` says `same` after each sync and fails after the extra install, and `have.txt` is the file for the `freeze:` line under [[S1]] in the [[agent-patch-audit#audit-template|audit.md template]].

:::reveal title="Show our run"
```text
$ cmp want.txt have.txt && echo same
same
$ uv pip install -q --python .venv/bin/python rich
$ uv pip freeze --python .venv/bin/python > have.txt
$ cmp want.txt have.txt && echo same
want.txt have.txt differ: char 55, line 4
$ uv pip sync --python .venv/bin/python requirements.lock
Resolved 8 packages in 16ms
Uninstalled 3 packages in 45ms
 - markdown-it-py==4.2.0
 - mdurl==0.1.2
 - rich==15.0.0
```
After that sync, `cmp` said `same` again. `uv pip sync` removes every package the lock does not list. `uv pip install` never does. The lock lines and the freeze lines have the same `name==version` form, so `cmp` works only after you drop the `# via` comments with `grep`.
:::
:::

## 4. pytest {#pytest}

**Why Polaris cares:** pytest is the grader inside most Python tasks. You must know what each outcome and exit code really means, because "exit 0" can mean "nothing was tested" ([[M6]], [[M3]]).

Work in `$TB/py`, with the buggy `cart.py` from `HEAD`. If you skipped the last section, lines 2 and 3 build its venv. If `.venv` exists, they change nothing:

```zsh
cd "$TB" && mkdir -p py && cp shop/cart.py py/ && cd py
printf 'pytest==9.1.1\nhypothesis==6.170.5\ncoverage==7.16.2\n' > requirements.txt
[ -d .venv ] || { uv venv --python 3.13 .venv && uv pip install --python .venv/bin/python -r requirements.txt; }
source .venv/bin/activate && which pytest
```

`which pytest` must end in `py/.venv/bin/pytest`. If it shows another path, such as `/opt/anaconda3/bin/pytest`, you get a different pytest with no Hypothesis, and your output will not match. Run `source .venv/bin/activate` again in every new terminal.

Save as `test_cart.py`:

```python
import pytest
from cart import total


def test_no_discount():
    assert total([100, 250]) == 350


def test_discount_rounds_the_total():
    assert total([5, 5], 10) == 9


@pytest.mark.parametrize("prices", [[], [0], [1, 2, 3]])
def test_zero_discount_is_sum(prices):
    assert total(prices, 0) == sum(prices)


@pytest.mark.skip(reason="needs the payments sandbox")
def test_charge_card():
    pass


@pytest.mark.xfail(reason="negative prices are not rejected yet")
def test_negative_price_rejected():
    with pytest.raises(ValueError):
        total([-5])
```

| Flag | What it does | When you use it |
|---|---|---|
| `-rA` | summary line for every test: passed, failed, skipped, xfailed | [[S1]] baseline, [[S11]] re-run |
| `-x` | stop at the first failure | quick reproduce loop |
| `-k EXPR` | run tests whose names match, e.g. `-k 'zero and not prices0'` | one test while you debug |
| `--lf` | rerun only the tests that failed last time | after a fix |
| `--collect-only -q` | list tests without running them | [[S2]] tool map |
| `-p no:NAME` | do not load plugin NAME | graders, flaky plugins |

The default for `-r` is `fE`: only failures and errors get a summary line (from `pytest --help`). `-rA` shows everything, so skipped and xfailed tests cannot hide. Real output (rootdir shortened):

```text
$ pytest -rA
============================= test session starts ==============================
platform darwin -- Python 3.13.9, pytest-9.1.1, pluggy-1.7.0
rootdir: /private/var/folders/.../py
plugins: hypothesis-6.170.5
collected 7 items

test_cart.py .F...sx                                                     [100%]

=================================== FAILURES ===================================
________________________ test_discount_rounds_the_total ________________________

    def test_discount_rounds_the_total():
>       assert total([5, 5], 10) == 9
E       assert 10 == 9
E        +  where 10 = total([5, 5], 10)

test_cart.py:10: AssertionError
==================================== PASSES ====================================
=========================== short test summary info ============================
PASSED test_cart.py::test_no_discount
PASSED test_cart.py::test_zero_discount_is_sum[prices0]
PASSED test_cart.py::test_zero_discount_is_sum[prices1]
PASSED test_cart.py::test_zero_discount_is_sum[prices2]
SKIPPED [1] test_cart.py:18: needs the payments sandbox
XFAIL test_cart.py::test_negative_price_rejected - negative prices are not rejected yet
FAILED test_cart.py::test_discount_rounds_the_total - assert 10 == 9
============== 1 failed, 4 passed, 1 skipped, 1 xfailed in 0.62s ===============
```

```text
$ pytest --collect-only -q
test_cart.py::test_no_discount
test_cart.py::test_discount_rounds_the_total
test_cart.py::test_zero_discount_is_sum[prices0]
test_cart.py::test_zero_discount_is_sum[prices1]
test_cart.py::test_zero_discount_is_sum[prices2]
test_cart.py::test_charge_card
test_cart.py::test_negative_price_rejected

7 tests collected in 0.32s
$ pytest -q -k 'zero and not prices0'
..                                                                       [100%]
2 passed, 5 deselected in 0.31s
$ pytest -q -k nosuchtest; echo "exit=$?"

7 deselected in 0.30s
exit=5
```

**Exit codes.** 0: all collected tests passed. 1: some failed. 2: interrupted. 3: internal error. 4: usage error. 5: no tests collected ^[confirmed](https://docs.pytest.org/en/stable/reference/exit-codes.html "2026-10-20"). A grader that only checks "exit code is not 1" accepts exit 5, which means a typo in `-k` ran nothing.

Other runs that exit 0 and prove nothing, all real:

```text
$ pytest -q test_cart.py::test_charge_card; echo "exit=$?"
s                                                                        [100%]
1 skipped in 0.27s
exit=0
$ pytest -q test_cart.py -k negative; echo "exit=$?"
x                                                                        [100%]
6 deselected, 1 xfailed in 0.26s
exit=0
$ printf 'import os\nos._exit(0)  # planted: exit "success" before any test runs\n' > conftest.py
$ pytest -q; echo "exit=$?"
exit=0
$ rm conftest.py
```

The planted `conftest.py` exits 0 with no output at all. This is our own demo of a known hack: Anthropic's reward-hacking work describes models calling `sys.exit(0)` so the test harness exits with a success code before the asserts run ^[confirmed](https://www.anthropic.com/research/emergent-misalignment-reward-hacking "2026-10-20"). We also tried `sys.exit(0)` inside a test: pytest catches it and reports `FAILED ... SystemExit: 0`. So the dangerous place is outside the tests. **Rule:** read the last line of the output, and compare the counts with your baseline. "exit 0" alone is not a pass.

**Plugins.** `-p no:NAME` turns a plugin off ^[confirmed](https://docs.pytest.org/en/stable/how-to/usage.html "2026-10-20"). Two traps, both real:

```text
$ pytest -p no:hypothesisTYPO | sed -n 4p
plugins: hypothesis-6.170.5
$ pytest -q --lf -p no:cacheprovider; echo "exit=$?"
ERROR: usage: pytest [options] [file_or_dir] [file_or_dir] [...]
pytest: error: unrecognized arguments: --lf
...
exit=4
```

A misspelled plugin name is ignored without any warning. Check the `plugins:` line of the header to see what really loaded. With the right name, `-p no:hypothesispytest`, that line disappears. And `--lf` lives in the cache plugin, so `-p no:cacheprovider` (no `.pytest_cache` folder, good for graders) removes it.

**Pipes in zsh.** `pytest | tee out.txt` returns the exit code of `tee`, not of pytest. Real output in zsh 5.9:

```text
$ pytest -q | tee out.txt > /dev/null; echo "exit=$?"
exit=0
$ set -o pipefail
$ pytest -q | tee out.txt > /dev/null; echo "exit=$?"
exit=1
$ pytest -q | tee out.txt > /dev/null; echo "pipestatus: ${pipestatus[1]} ${pipestatus[2]}"
pipestatus: 1 0
```

zsh's `pipestatus` array starts at 1. Bash's `PIPESTATUS` starts at 0. That is why the [[S1]] baseline command starts with `set -o pipefail`.

:::drill id="tb-pytest-exit" title="Predict six pytest exit codes" time="10 min"
In `$TB/py`, write down your prediction for the exit code and the last output line of each command. Then run them in this order: run 4 depends on what runs 1 to 3 leave in the cache.

1. `pytest -q test_cart.py`
2. `pytest -q test_cart.py -k no_discount`
3. `pytest -q test_cart.py -x`
4. `pytest -q --lf test_cart.py`
5. `pytest -q test_cart.py::test_nosuch`
6. `pytest -q -rA test_cart.py -k 'charge or negative'`

**Done when:** at least five of six predictions are right, and you can name which of the six a sloppy grader would count as a pass.

:::reveal title="Show the real results"
| # | Last line | Exit |
|---|---|---|
| 1 | `1 failed, 4 passed, 1 skipped, 1 xfailed` | 1 |
| 2 | `1 passed, 6 deselected` | 0 |
| 3 | `1 failed, 1 passed`, after `stopping after 1 failures` | 1 |
| 4 | `1 failed, 6 deselected` | 1 |
| 5 | `no tests ran`, after `ERROR: not found: .../test_cart.py::test_nosuch` | 4 |
| 6 | `1 skipped, 5 deselected, 1 xfailed` | 0 |

Real output, pytest 9.1.1. Run 3 stopped at the first failure, so five tests never ran: fine while you debug, never for a grade. Run 4 reran only the test that failed last time. Run 6 exits 0 but tests nothing: one skip and one xfail. A grader that only rejects exit 1 also passes run 5, which ran no test at all.
:::
:::

## 5. coverage.py {#coverage}

**Why Polaris cares:** coverage shows which lines one test really ran. That is a **dynamic map** of the code ([[S2]]): ground truth to compare with the agent's story of how the code works.

Add a second module to `py/`. Save as `checkout.py`:

```python
from cart import total

FREE_SHIPPING_CENTS = 5000


def checkout(prices, discount=0, country="US"):
    subtotal = total(prices, discount)
    if subtotal >= FREE_SHIPPING_CENTS:
        shipping = 0
    elif country == "US":
        shipping = 500
    else:
        shipping = 1500
    return subtotal + shipping
```

And `test_checkout.py`:

```python
from checkout import checkout


def test_checkout_us():
    assert checkout([1000]) == 1500


def test_checkout_free_shipping():
    assert checkout([6000]) == 6000
```

| Command | What it does |
|---|---|
| `coverage run -m pytest -q TEST` | run pytest under coverage |
| `coverage report -m` | table with the missing line numbers |
| `coverage report -m --include=checkout.py` | only the files you care about |
| `coverage run --branch -m pytest ...` | also record which branches ran |
| `coverage erase` | delete the data before the next map |

Real output:

```text
$ coverage run -m pytest -q test_checkout.py::test_checkout_us
.                                                                        [100%]
1 passed in 0.46s
$ coverage report -m
Name               Stmts   Miss  Cover   Missing
------------------------------------------------
cart.py                2      0   100%
checkout.py           10      2    80%   9, 13
test_checkout.py       5      1    80%   9
------------------------------------------------
TOTAL                 17      3    82%
$ coverage run --branch -m pytest -q test_checkout.py
..                                                                       [100%]
2 passed in 0.44s
$ coverage report -m --include=checkout.py
Name          Stmts   Miss Branch BrPart  Cover   Missing
---------------------------------------------------------
checkout.py      10      1      4      1    86%   13
---------------------------------------------------------
TOTAL            10      1      4      1    86%
```

Two lessons. First, `test_checkout_us` never ran line 9 (free shipping) or line 13 (other countries). If an agent says "the US test covers the shipping logic", the map says it does not. Second, `cart.py` shows **100%** and still has the per-item rounding bug. Coverage tells you what ran, not what was checked. One well-known study found only a low-to-moderate link between coverage and how well a suite finds faults, once suite size is controlled ^[confirmed](https://cs.ubc.ca/~rtholmes/papers/icse_2014_inozemtseva.pdf "2026-10-20"). Never use coverage as a grader-quality score. [[map#dynamic-map|Chapter 3]] builds a full dynamic map with it.

:::drill id="tb-coverage-map" title="Predict a dynamic map, then measure it" time="10 min"
1. Without running anything, write down which line numbers of `checkout.py` the test `test_checkout_free_shipping` will run.
2. Run `coverage erase`, then `coverage run --branch -m pytest -q -p no:cacheprovider test_checkout.py::test_checkout_free_shipping`, then `coverage report -m --include=checkout.py,cart.py`.
3. Compare. Then write one sentence: why does `cart.py` at 100% not mean `cart.py` is correct?

**Done when:** your prediction and the report agree, or you can explain every line where they differ.

:::reveal title="Show our report"
```text
Name          Stmts   Miss Branch BrPart  Cover   Missing
---------------------------------------------------------
cart.py           2      0      0      0   100%
checkout.py      10      3      4      1    57%   10-13
---------------------------------------------------------
TOTAL            12      3      4      1    62%
```
`coverage json` lists the executed lines as `[1, 3, 6, 7, 8, 9, 14]`. Line 12 (`else:`) is not a statement, so it never appears in either list. `cart.py` ran fully, but no test with `test_checkout_free_shipping` checks a discount, so the bug is never asserted on.
:::
:::

## 6. Hypothesis {#hypothesis}

**Why Polaris cares:** a **property-based test** checks a rule on hundreds of generated inputs and shrinks any failure to a minimal example. It is the fastest way to attack a fix ([[S12]]) and to find wrong solutions a grader would accept ([[M5]]).

A minimal example. Save as `money.py` in `py/`. It has a bug with negative amounts:

```python
def to_text(cents: int) -> str:
    """Format cents as dollars: 1234 -> '12.34', -5 -> '-0.05'."""
    return f"{cents // 100}.{cents % 100:02d}"


def from_text(text: str) -> int:
    whole, frac = text.split(".")
    return int(whole) * 100 + int(frac)
```

Two properties. Save as `test_money.py`:

```python
from decimal import Decimal

from hypothesis import given, strategies as st

from money import from_text, to_text

amounts = st.integers(min_value=-10**15, max_value=10**15)  # cents


@given(amounts)
def test_round_trip(cents):
    assert from_text(to_text(cents)) == cents


@given(amounts)
def test_text_means_the_same_amount(cents):
    assert Decimal(to_text(cents)) == Decimal(cents) / 100
```

Real output (trimmed to the failure):

```text
$ pytest -q test_money.py
.F                                                                       [100%]
=================================== FAILURES ===================================
_______________________ test_text_means_the_same_amount ________________________
...
cents = -1

    @given(amounts)
    def test_text_means_the_same_amount(cents):
>       assert Decimal(to_text(cents)) == Decimal(cents) / 100
E       AssertionError: assert Decimal('-1.99') == (Decimal('-1') / 100)
E        +  where Decimal('-1.99') = Decimal('-1.99')
E        +    where '-1.99' = to_text(-1)
E        +  and   Decimal('-1') = Decimal(-1)
E       Failing test case: test_text_means_the_same_amount(
E           cents=-1,
E       )

test_money.py:17: AssertionError
=========================== short test summary info ============================
FAILED test_money.py::test_text_means_the_same_amount - AssertionError: asser...
1 failed, 1 passed in 0.36s
```

Read this carefully. It is grader validity in miniature:

- `to_text(-1)` gives `'-1.99'` instead of `'-0.01'`. Python's `//` and `%` round toward minus infinity, so `-1 // 100` is `-1` and `-1 % 100` is `99`.
- The **round-trip property passed**. `from_text('-1.99')` is `-100 + 99 = -1`, so the two bugs cancel. A weak property accepts a wrong implementation, just like a weak grader.
- Hypothesis **shrank** the failure to `cents=-1`, the simplest failing input. We ran it five more times, each time after deleting the `.hypothesis/` folder, and it found `-1` every time. `--hypothesis-seed=0` fixes the random seed when you need an exact replay.
- Hypothesis saves failing examples in a `.hypothesis/` folder and tries them first next time. Delete it, or use a fresh copy, when you want an honest fresh run.

Why the bounds on `amounts`? Our first version used plain `st.integers()`. After the fix, the Decimal property still failed, at `cents=10_000_000_000_000_000_000_000_000_001`. The cause was the **oracle** (the trusted reference a test compares with, here `Decimal`), not the code: `Decimal` division rounds to 28 digits by default. An oracle can be wrong too. [[prove#property-tests|Chapter 5]] goes further.

:::drill id="tb-hypothesis-fix" title="Fix money.py until both properties pass" time="10 min"
1. Fix `to_text` so that `-1` gives `'-0.01'`. Run the tests.
2. Read the new failure. Fix what it points to.
3. Run the tests three times with `-p no:cacheprovider`.

**Done when:** both properties pass three runs in a row, and you can say why the round-trip test alone never caught the first bug.

:::reveal title="Show our fix and what happened in between"
After fixing only `to_text`, the round trip failed at `cents=-1` with `assert 1 == -1`. `from_text('-0.01')` read `int('-0')` as 0 and lost the sign. Our final version:

```python
def to_text(cents: int) -> str:
    """Format cents as dollars: 1234 -> '12.34', -5 -> '-0.05'."""
    sign = "-" if cents < 0 else ""
    whole, frac = divmod(abs(cents), 100)
    return f"{sign}{whole}.{frac:02d}"


def from_text(text: str) -> int:
    sign = -1 if text.startswith("-") else 1
    whole, frac = text.lstrip("-").split(".")
    return sign * (int(whole) * 100 + int(frac))
```

Real output, three runs: `2 passed in 0.34s` each time. The round trip missed the first bug because both functions were wrong in matching ways.
:::
:::

## 7. Docker {#docker}

**Why Polaris cares:** Harbor-style tasks run in a container built from `environment/Dockerfile`, and the verifier writes its reward to `/logs/verifier/reward.txt` ^[confirmed](https://docs.harborframework.com/tasks/overview "2026-10-20"). You need to build that image, run it with no network, and read the reward on your Mac.

| Command | What it does |
|---|---|
| `docker build -t NAME:TAG .` | build an image from `./Dockerfile` |
| `docker run --rm IMAGE CMD` | run a container, delete it when it exits |
| `docker run --rm --network none IMAGE CMD` | only a loopback interface: no network |
| `docker run --rm -v "$PWD/logs:/logs" IMAGE CMD` | bind mount a host folder (add `:ro` for read-only) |
| `docker image rm NAME:TAG` | delete the image |

Make a folder `dock/` with the buggy `cart.py` in it, and save this `Dockerfile` there:

```zsh
cd "$TB" && mkdir dock && cp shop/cart.py dock/ && cd dock
```

```text
# Pinned by digest: every build starts from the same bytes.
FROM python:3.12-slim@sha256:57cd7c3a7a273101a6485ba99423ee568157882804b1124b4dd04266317710de
ENV PYTHONDONTWRITEBYTECODE=1
WORKDIR /app
COPY cart.py /app/
CMD ["python", "-c", "import cart; print(cart.total([5, 5], 10))"]
```

The digest is the one [[lab:lab-f]] uses, so you download the base image only once.

**First, check your builder.** `docker buildx ls` marks the current builder with `*`. If that builder uses the `docker-container` driver, a plain `docker build` starts its container and does not load the image into your local image list. On this Mac the current builder was such a builder, so we named the Docker Desktop builder explicitly. We captured the output through a pipe. In a terminal, `docker build` shows a live progress view instead; add `--progress=plain` to get these `#8` lines:

```text
$ docker build --builder desktop-linux -t tb-shop:local .
...
#8 naming to docker.io/library/tb-shop:local done
#8 DONE 0.1s
```

If your current builder uses the `docker` driver, plain `docker build -t tb-shop:local .` is enough. Real output of the runs:

```text
$ docker run --rm tb-shop:local
10
$ docker run --rm tb-shop:local python -c 'import socket; print(socket.gethostbyname("pypi.org"))'
151.101.128.223
$ docker run --rm --network none tb-shop:local python -c 'import socket; print(socket.gethostbyname("pypi.org"))'
Traceback (most recent call last):
  File "<string>", line 1, in <module>
socket.gaierror: [Errno -3] Temporary failure in name resolution
$ mkdir -p logs && docker run --rm --network none -v "$PWD/logs:/logs" tb-shop:local sh -c 'mkdir -p /logs/verifier && echo 1 > /logs/verifier/reward.txt' && cat logs/verifier/reward.txt
1
$ docker run --rm -v "$PWD:/app:ro" tb-shop:local sh -c 'echo hack >> /app/cart.py'; echo "exit=$?"
sh: 1: cannot create /app/cart.py: Read-only file system
exit=2
$ docker image rm tb-shop:local
Untagged: tb-shop:local
Deleted: sha256:bf65ca4956c058fc0e66a8682fc321b74f7858d9ad4532870d5f39ddf7ef28b9
```

What this shows:

- `--network none` leaves only the loopback device ^[confirmed](https://docs.docker.com/engine/network/drivers/none/ "2026-10-20"). The DNS lookup fails, so the container cannot fetch an upstream fix.
- `-v host:container` puts a host folder inside the container ^[confirmed](https://docs.docker.com/engine/storage/bind-mounts/ "2026-10-20"). That is how `reward.txt` reaches your Mac: macOS has no writable `/logs`.
- `:ro` makes a mount read-only. But read-only still lets the attempt *read* the tests and special-case them ([[M3]]). Harbor uploads `tests/` to `/tests/` only after the agent runs ^[confirmed](https://docs.harborframework.com/tasks/verifier "2026-10-20"). Do the same: no tests in the container while the agent works. At grading time, mount them `:ro`, so the code under test cannot change them.
- `--rm` deletes the container on exit, so old state cannot leak into the next run.

**Network off is not enough.** In one 2026 study of three open models, turning off network access did not meaningfully reduce shortcut attempts ^[confirmed](https://arxiv.org/abs/2609.06780 "2026-10-20"). The same study counts mining local git history and recalling memorized code as shortcuts, and a closed network blocks neither. Combine `--network none` with a history-free snapshot ([[S0]]).

:::drill id="tb-docker-verifier" title="A Harbor-style verifier in a no-network container" time="10 min"
1. Make a folder `verifier/` next to `shop` (`cd "$TB" && mkdir -p verifier/tests && cd verifier`), with the `Dockerfile` above (delete the `CMD` line). Inside it, make `tests/test.sh`. It must write `1` to `/logs/verifier/reward.txt` if `cart.total([5, 5], 10) == 9`, else `0`.
2. Build the image with the buggy `cart.py` from `shop` `HEAD`. Run `sh /tests/test.sh` in a container with `--network none`, `tests/` mounted read-only at `/tests`, and `logs/` mounted at `/logs`. Read `logs/verifier/reward.txt`.
3. Replace `cart.py` with `git -C ../shop show v1.0:cart.py > cart.py`, rebuild, and grade again.
4. Delete the image.

**Done when:** the buggy version gets `reward=0`, the v1.0 version gets `reward=1`, and you delete `logs/` before each run.

:::reveal title="Show our verifier and run"
```sh
#!/bin/sh
# Harbor-style verifier: write 1 (pass) or 0 (fail) to /logs/verifier/reward.txt.
mkdir -p /logs/verifier
if python3 -c 'import cart, sys; sys.exit(0 if cart.total([5, 5], 10) == 9 else 1)'; then
  echo 1 > /logs/verifier/reward.txt
else
  echo 0 > /logs/verifier/reward.txt
fi
```

```zsh
grade() {
  rm -rf logs && mkdir logs &&
  docker build -q --builder desktop-linux -t tb-cart:local . > /dev/null &&
  docker run --rm --network none -v "$PWD/tests:/tests:ro" -v "$PWD/logs:/logs" tb-cart:local sh /tests/test.sh &&
  echo "reward=$(cat logs/verifier/reward.txt)"
}
cp ../shop/cart.py . && echo "== HEAD cart.py (per-item discount)" && grade
git -C ../shop show v1.0:cart.py > cart.py && echo "== v1.0 cart.py" && grade
docker image rm tb-cart:local
```

```text
== HEAD cart.py (per-item discount)
reward=0
== v1.0 cart.py
reward=1
```

Why `rm -rf logs` first: if a broken verifier crashes before it writes, an old `reward.txt` from the last run would still say `1`.
:::
:::

## 8. CMake and make {#cmake}

**Why Polaris cares:** C++ repos are built with CMake or make. To run the tests, add a sanitizer build, or check an agent's "it builds", you read the build file first and drive it yourself.

**CMake** generates build files from `CMakeLists.txt`. **ctest** runs the tests that `add_test` registers. A tiny project, in a folder `cm/` (`cd "$TB" && mkdir cm && cd cm`). `CMakeLists.txt`:

```text
cmake_minimum_required(VERSION 3.20)
project(stats LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_library(stats stats.cpp)
add_executable(test_stats test_stats.cpp)
target_link_libraries(test_stats PRIVATE stats)

enable_testing()
add_test(NAME test_stats COMMAND test_stats)
```

`stats.hpp`:

```cpp
#pragma once
#include <vector>

// Mean of the values, rounded toward zero. Empty input gives 0.
int mean(const std::vector<int>& values);
```

`stats.cpp`:

```cpp
#include "stats.hpp"

int mean(const std::vector<int>& values) {
  if (values.empty()) return 0;
  int sum = 0;
  for (int v : values) sum += v;
  return sum / static_cast<int>(values.size());
}
```

`test_stats.cpp`:

```cpp
#include <cstdio>
#include "stats.hpp"

int main() {
  int failures = 0;
  auto check = [&](bool ok, const char* what) {
    std::printf("%s %s\n", ok ? "ok  " : "FAIL", what);
    if (!ok) ++failures;
  };
  check(mean({}) == 0, "empty");
  check(mean({2, 4}) == 3, "two values");
  check(mean({2000000000, 2000000000}) == 2000000000, "big values");
  return failures == 0 ? 0 : 1;
}
```

| Command | What it does |
|---|---|
| `cmake -S . -B build -DCMAKE_BUILD_TYPE=Debug` | configure: source in `.`, build files in `build/` |
| `cmake --build build -j 4` | compile with 4 jobs |
| `ctest --test-dir build --output-on-failure` | run the tests; print output of failing ones |
| `cmake --build build --verbose` | print the real compiler command lines |
| `cmake -S . -B build-san -DCMAKE_CXX_FLAGS='...'` | a second build folder with other flags |

Real output (paths shortened):

```text
$ cmake -S . -B build -DCMAKE_BUILD_TYPE=Debug
-- The CXX compiler identification is AppleClang 21.0.0.21000101
...
-- Build files have been written to: .../cm/build
$ cmake --build build -j 4
[ 25%] Building CXX object CMakeFiles/stats.dir/stats.cpp.o
[ 50%] Linking CXX static library libstats.a
[ 50%] Built target stats
[ 75%] Building CXX object CMakeFiles/test_stats.dir/test_stats.cpp.o
[100%] Linking CXX executable test_stats
[100%] Built target test_stats
$ ctest --test-dir build --output-on-failure; echo "exit=$?"
Test project .../cm/build
    Start 1: test_stats
1/1 Test #1: test_stats .......................***Failed    0.34 sec
ok   empty
ok   two values
FAIL big values


0% tests passed, 1 tests failed out of 1
...
exit=8
```

The big-values test fails because `2000000000 + 2000000000` does not fit in an `int`. That is **signed overflow**, which is undefined behavior in C++. The Debug build gave a wrong number. Another build could give a different wrong number, or even the "right" one. Now a sanitizer build, in its own folder:

```text
$ cmake -S . -B build-san -DCMAKE_BUILD_TYPE=Debug -DCMAKE_CXX_FLAGS='-fsanitize=address,undefined -fno-sanitize-recover=all -fno-omit-frame-pointer' > /dev/null
$ cmake --build build-san > /dev/null
$ ./build-san/test_stats; echo "exit=$?"
ok   empty
ok   two values
.../cm/stats.cpp:6:28: runtime error: signed integer overflow: 2000000000 + 2000000000 cannot be represented in type 'int'
SUMMARY: UndefinedBehaviorSanitizer: undefined-behavior .../cm/stats.cpp:6:28
exit=134
```

Now you have `file:line:column`, not just "FAIL". In a terminal the two `ok` lines print first. Through a pipe they print after the report, because stdout is then buffered and the sanitizer writes to stderr at once. Keep that in mind when you read saved logs: the order of lines is not always the order of events. `--verbose` shows what the compiler really got:

```text
$ touch stats.cpp && cmake --build build --verbose 2>&1 | grep -E 'c\+\+ .* -c .*/stats\.cpp$'
/usr/bin/c++   -g -std=gnu++17 -arch arm64 -MD -MT CMakeFiles/stats.dir/stats.cpp.o -MF CMakeFiles/stats.dir/stats.cpp.o.d -o CMakeFiles/stats.dir/stats.cpp.o -c .../cm/stats.cpp
```

Note `-std=gnu++17`, not `c++17`: CMake turns on compiler extensions unless `CMAKE_CXX_EXTENSIONS` is `OFF`. Small details like this are why you read the real command line before you trust "it builds with C++17".

**make basics.** A `Makefile` lists targets, what they depend on, and the commands that build them. Recipe lines must start with a **tab**, not spaces. In a new folder `san/`, create the file with `printf` so the tabs are real (the next section uses it):

```zsh
cd "$TB" && mkdir san && cd san
printf 'CXX = clang++\nCXXFLAGS = -std=c++17 -g -O1\nSAN = -fsanitize=address,undefined -fno-sanitize-recover=all -fno-omit-frame-pointer\n\nlast3: last3.cpp\n\t$(CXX) $(CXXFLAGS) -o $@ $<\n\nlast3-san: last3.cpp\n\t$(CXX) $(CXXFLAGS) $(SAN) -o $@ $<\n\nclean:\n\trm -f last3 last3-san\n\n.PHONY: clean\n' > Makefile
cat -t Makefile | sed -n 5,6p
```

```text
last3: last3.cpp
^I$(CXX) $(CXXFLAGS) -o $@ $<
```

`cat -t` shows each tab as `^I`.

| Command | What it does |
|---|---|
| `make -n TARGET` | dry run: prints most commands; `$(shell ...)` and `+` or `$(MAKE)` lines still run |
| `make` | build the first target in the file |
| `make TARGET` | build one target |
| `make clean` | run the `clean` recipe |
| `make -C DIR TARGET` | run make inside another folder |

`make -n` is a good first look: it prints most recipes without running them. Its output is in the next section. But it is not a sandbox. `$(shell ...)` still runs while make reads the file. Recipe lines that start with `+` or contain `$(MAKE)` still run too. We tested this with GNU Make 3.81: after `make -n`, the files made by a `$(shell touch ...)` line and a `+touch ...` line both existed. The GNU make manual confirms the second part: with `-n`, lines with `+` or `$(MAKE)` are run anyway ^[confirmed](https://www.gnu.org/software/make/manual/html_node/Instead-of-Execution.html "2026-10-20"). `man make` on this Mac leaves that out. On an agent's Makefile, look for those lines first:

```zsh
rg -n '\$\(shell|\$\(MAKE\)|^\t\+' Makefile
```

On this Mac `make` is GNU Make 3.81, which is old: features from newer versions, like `.RECIPEPREFIX`, do not exist.

:::drill id="tb-cmake-fix" title="Fix the overflow so both builds pass" time="10 min"
1. Build `cm/` twice, `build` and `build-san`, and run `ctest --test-dir build-san --output-on-failure`. Read the `file:line:column`.
2. Fix `mean` so it cannot overflow for any `int` input. Do not change the test.
3. Rebuild both folders and run `ctest` in both.

**Done when:** `ctest` says `100% tests passed` in `build` and in `build-san`, and your fix still returns an `int`.

:::reveal title="Show our fix"
```cpp
#include "stats.hpp"

int mean(const std::vector<int>& values) {
  if (values.empty()) return 0;
  long long sum = 0;
  for (int v : values) sum += v;
  return static_cast<int>(sum / static_cast<long long>(values.size()));
}
```
Real output: `100% tests passed out of 1` in both folders. A `long long` sum of up to about 4 billion `int` values cannot overflow, and the mean of `int` values always fits back into an `int`.
:::
:::

## 9. Sanitizers on macOS {#sanitizers}

**Why Polaris cares:** a C++ grader without sanitizers accepts memory bugs that happen to print the right answer ([[M9]]). You must build so that every finding fails the run ([[S11]]).

A **sanitizer** is a compiler mode that adds run-time checks. **ASan** (AddressSanitizer) checks memory: out-of-bounds, use-after-free, double free. **UBSan** (UndefinedBehaviorSanitizer) checks undefined behavior: signed overflow, bad shifts, null pointers and more.

| Command | What it does |
|---|---|
| `clang++ -g -O1 -fsanitize=address,undefined -fno-sanitize-recover=all -fno-omit-frame-pointer` | the check build you want |
| `./prog; echo "exit=$?"` | always read the exit code |
| `clang++ -fsanitize=thread ...` | data races: a separate build, never with ASan |
| `make -n last3-san` | see the exact flags a Makefile uses |

Save as `last3.cpp` in `san/`, next to the `Makefile` from the last section:

```cpp
// last3.cpp: keep the last 3 values in a ring buffer, then print their sum.
#include <cstdio>

int main() {
  const int cap = 3;
  int* buf = new int[cap];
  int head = 0;
  for (int x = 1; x <= 4; ++x) {
    buf[head] = x;
    head = (head == cap) ? 0 : head + 1;  // bug: must wrap when head + 1 == cap
  }
  std::printf("sum of last 3 = %d (want 9)\n", buf[0] + buf[1] + buf[2]);
  delete[] buf;
  return 0;
}
```

Real output:

```text
$ make -n last3-san
clang++ -std=c++17 -g -O1 -fsanitize=address,undefined -fno-sanitize-recover=all -fno-omit-frame-pointer -o last3-san last3.cpp
$ make && ./last3; echo "exit=$?"
clang++ -std=c++17 -g -O1 -o last3 last3.cpp
sum of last 3 = 6 (want 9)
exit=0
$ make last3-san && ./last3-san; echo "exit=$?"
clang++ -std=c++17 -g -O1 -fsanitize=address,undefined -fno-sanitize-recover=all -fno-omit-frame-pointer -o last3-san last3.cpp
=================================================================
==2852==ERROR: AddressSanitizer: heap-buffer-overflow on address 0x6020000000bc at pc 0x000104694a58 bp 0x00016b76a600 sp 0x00016b76a5f8
WRITE of size 4 at 0x6020000000bc thread T0
    #0 0x000104694a54 in main last3.cpp:9
    #1 0x000180bc84e0 in start+0x1b4c (dyld:arm64e+0x204e0)

0x6020000000bc is located 0 bytes after 12-byte region [0x6020000000b0,0x6020000000bc)
allocated by thread T0 here:
    #0 0x000104d2c068 in _Znam+0x74 (libclang_rt.asan_osx_dynamic.dylib:arm64e+0x50068)
    #1 0x000104694888 in main last3.cpp:6
    #2 0x000180bc84e0 in start+0x1b4c (dyld:arm64e+0x204e0)
...
exit=134
```

The full report is longer; we cut it after the allocation stack.

The plain build wrote past the end of the buffer, printed a wrong sum, and **exited 0**. The ASan build named the line (`last3.cpp:9`), the kind of access (`WRITE of size 4`), and where the memory came from: "0 bytes after 12-byte region", so exactly one `int` past the end of 3 `int`s. Exit 134 is 128 + 6, the abort signal: on Darwin, sanitizers abort on error by default.

**The recover trap.** By default, UBSan prints a report and keeps running ^[confirmed](https://clang.llvm.org/docs/UndefinedBehaviorSanitizer.html "2026-10-20"). Save as `area.cpp`:

```cpp
// area.cpp: width * height in int. 50000 * 50000 does not fit in an int.
#include <cstdio>
#include <cstdlib>

int main(int argc, char** argv) {
  int w = argc > 1 ? std::atoi(argv[1]) : 50000;
  int h = argc > 2 ? std::atoi(argv[2]) : 50000;
  std::printf("area = %d\n", w * h);
  return 0;
}
```

```text
$ clang++ -g -fsanitize=undefined -o area-recover area.cpp && ./area-recover; echo "exit=$?"
area.cpp:8:32: runtime error: signed integer overflow: 50000 * 50000 cannot be represented in type 'int'
SUMMARY: UndefinedBehaviorSanitizer: undefined-behavior area.cpp:8:32
area = -1794967296
exit=0
$ clang++ -g -fsanitize=undefined -fno-sanitize-recover=all -o area-strict area.cpp && ./area-strict; echo "exit=$?"
area.cpp:8:32: runtime error: signed integer overflow: 50000 * 50000 cannot be represented in type 'int'
SUMMARY: UndefinedBehaviorSanitizer: undefined-behavior area.cpp:8:32
exit=134
$ ./area-strict 300 200; echo "exit=$?"
area = 60000
exit=0
```

Without `-fno-sanitize-recover=all`, the report goes to stderr and the exit code is still 0. A grader that reads only the exit code would pass this program. With the flag, the same bug fails the run, and correct input still exits 0.

**What Apple clang does not have.** Real errors on this Mac:

```text
$ clang++ -fsanitize=leak area.cpp
clang++: error: unsupported option '-fsanitize=leak' for target 'arm64-apple-darwin25.6.0'
$ clang++ -fsanitize=address,thread area.cpp
clang++: error: invalid argument '-fsanitize=address' not allowed with '-fsanitize=thread'
```

No LeakSanitizer, and ThreadSanitizer needs its own build. [[debug#sanitizer-menu|Chapter 6]] has the full menu (MemorySanitizer is missing too) and libc++ hardening.

:::drill id="tb-san-ring" title="Fix the ring buffer under ASan" time="10 min"
1. Build `last3` and `last3-san` with the `Makefile`. Run both and write down each exit code.
2. From the ASan report alone, name the line, the access size and how far past the end it wrote.
3. Fix the wrap condition. Rebuild with `make last3-san` and run it again.
4. Predict the exit codes of `area-recover` and `area-strict`, then run them.

**Done when:** the sanitizer build prints `sum of last 3 = 9 (want 9)` and exits 0, and you can explain why `area-recover` exits 0 although it found a bug.

:::reveal title="Show our fix"
Change line 10 to `head = (head + 1 == cap) ? 0 : head + 1;`. Real output of the sanitizer build after the fix:

```text
sum of last 3 = 9 (want 9)
exit=0
```
:::
:::

## 10. lldb {#lldb}

**Why Polaris cares:** when a C++ test crashes or a value is wrong, you stop the program and look inside instead of guessing ([[S7]]). On an Apple Silicon Mac the debugger is **lldb**; gdb is not installed here and is for Linux or Docker ([[debug#lldb|Chapter 6]]).

**What we ran and what we did not.** On this Mac, `DevToolsSecurity -status` printed `Developer mode is currently disabled.` The macOS rule for debugging another process asks a member of the `_developer` group to authenticate (we read it with `security authorizationdb read system.privilege.taskport.debug`). So a live session (`run`) will most likely show a password dialog. The rule's `timeout` is 36000 seconds, so after you authenticate once, later sessions within 10 hours should not ask again ^[inference](- "2026-10-20"). We did not trigger that dialog during an unattended build. Commands that do not start the program were run, and their output is real. Live-session commands were checked against lldb's built-in `help` and the official command map ^[confirmed](https://lldb.llvm.org/use/map.html "2026-10-20"), not run.

Work in `$TB/san`. Build for debugging with `-O0 -g`, so no variable is "optimized out":

```text
$ clang++ -std=c++17 -g -O0 -o last3 last3.cpp
$ lldb --batch -o "image lookup --name main" -o "breakpoint set --file last3.cpp --line 9" -o "source list --file last3.cpp --line 8 --count 4" ./last3
(lldb) target create "./last3"
Current executable set to '.../san/last3' (arm64).
(lldb) image lookup --name main
1 match found in .../san/last3:
        Address: last3[0x0000000100000498] (last3.__TEXT.__text + 0)
        Summary: last3`main at last3.cpp:4
(lldb) breakpoint set --file last3.cpp --line 9
Breakpoint 1: where = last3`main + 68 at last3.cpp:9:17, address = 0x00000001000004dc
(lldb) source list --file last3.cpp --line 8 --count 4
   8   	  for (int x = 1; x <= 4; ++x) {
   9   	    buf[head] = x;
   10  	    head = (head == cap) ? 0 : head + 1;  // bug: must wrap when head + 1 == cap
   11  	  }
   12  	  std::printf("sum of last 3 = %d (want 9)\n", buf[0] + buf[1] + buf[2]);
```

`--batch` runs each `-o` command, then quits. A breakpoint that resolves to `last3.cpp:9:17` proves that line has code, which is a quick check of an agent's "line 9 is never compiled" claim. A conditional breakpoint also resolves without running (real):

```text
$ lldb --batch -o 'breakpoint set --file last3.cpp --line 9 --condition "head == 3"' -o 'breakpoint list' ./last3 | grep -E 'Condition|1\.1:'
Condition: head == 3
  1.1: where = last3`main + 68 at last3.cpp:9:17, address = last3[0x00000001000004dc], unresolved, hit count = 0
```

The live commands you will use (checked against `help`, not run):

| Command | Short form | What it does |
|---|---|---|
| `run` | `r` | start the program |
| `breakpoint set --file F --line N --condition "EXPR"` | `b F:N` (no condition) | stop at a line, optionally only when EXPR is true |
| `thread backtrace` | `bt` | show the call stack |
| `frame variable` | `v` | show local variables (`frame variable x head` for two) |
| `watchpoint set variable head` | | stop when `head` changes |
| `kill` | | end the program, keep lldb |

One saved session, the form an agent can also run (checked against `help`, not run):

```zsh
lldb --batch -o 'breakpoint set --file last3.cpp --line 9 --condition "head == 3"' -o run -o 'frame variable x head' -o kill ./last3
```

`-k CMD` (`--one-line-on-crash`) runs a command only if the program crashes, for example `lldb --batch -o run -k bt ./prog`. That is a crash stack you can paste into `audit.md`.

:::drill id="tb-lldb-live" title="Your first live lldb session" time="10 min"
You do this one yourself, because macOS will ask for your password. Never let an agent enter it.

1. Build `last3` with `-g -O0`.
2. Run the saved-session command above. When macOS asks, authenticate yourself.
3. Read `x` and `head` at the stop. Which write is the one past the end?
4. Run it again with `-o bt` added after `run`.

**Done when:** you saved the real output in your notes, and it shows `head = 3` at the stop with the value of `x` that is written out of bounds.
:::

## 11. Node 22 and TypeScript {#node-ts}

**Why Polaris cares:** DeepSWE has 35 TypeScript tasks out of 113 ^[confirmed](https://deepswe.datacurve.ai/blog/deepswe "2026-10-20"). We treat it as the closest public analogue to Polaris tasks ^[inference](- "2026-10-20"). You must run and test a TypeScript repo in minutes, with no build step and no new dependencies ([[lab:lab-h]]).

Node 22.18.0 turned **type stripping** on by default: Node replaces type annotations with spaces and runs the JavaScript that is left. It performs no type checking ^[confirmed](https://nodejs.org/docs/latest-v22.x/api/typescript.html "2026-10-20"). This Mac has v22.21.1.

| Command | What it does |
|---|---|
| `node file.ts` | run a TypeScript file directly |
| `node --test` | run every test file the default patterns match |
| `node --test --test-reporter=tap` or `=spec` | force a format: TAP (Test Anything Protocol, plain machine-readable lines) or spec (readable). The default is spec in a terminal, TAP when piped or in CI |
| `node --test --test-name-pattern=REGEX` | only tests whose name matches |
| `node -p process.features.typescript` | `strip` means type stripping is on |

When you give no paths, `node --test` also matches `**/*.test.ts`, `**/test/**/*.ts` and similar patterns, unless you pass `--no-experimental-strip-types`. If any test fails, the exit code is 1 ^[confirmed](https://nodejs.org/docs/latest-v22.x/api/test.html "2026-10-20").

A tiny example in a folder `ts/` (`cd "$TB" && mkdir -p ts/src ts/test && cd ts`). `src/cart.ts`:

```ts
export type Item = { name: string; cents: number };

// Total in cents, minus a percent discount on the total, rounded down.
export function total(items: Item[], discountPercent = 0): number {
  const subtotal = items.reduce((sum, item) => sum + item.cents, 0);
  return subtotal - Math.floor((subtotal * discountPercent) / 100);
}
```

`test/cart.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { total, type Item } from "../src/cart.ts";

const two: Item[] = [{ name: "pen", cents: 5 }, { name: "cap", cents: 5 }];

test("no discount is the plain sum", () => {
  assert.equal(total(two), 10);
});

test("discount is rounded on the total", () => {
  assert.equal(total(two, 10), 9);
});
```

Real output. We force TAP in the first run, so your terminal shows the same thing. Plain `node --test` in a terminal prints the spec form of the second run:

```text
$ node --test --test-reporter=tap
TAP version 13
# Subtest: no discount is the plain sum
ok 1 - no discount is the plain sum
  ---
  duration_ms: 0.345792
  type: 'test'
  ...
# Subtest: discount is rounded on the total
ok 2 - discount is rounded on the total
  ---
  duration_ms: 0.068083
  type: 'test'
  ...
1..2
# tests 2
# suites 0
# pass 2
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 64.936125
$ node --test --test-reporter=spec --test-name-pattern=rounded
✔ discount is rounded on the total (0.306125ms)
ℹ tests 1
ℹ suites 0
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 63.596833
$ node -p process.features.typescript
strip
```

**Five traps, all real on v22.21.1.** Each file sits in `ts/`. We show the file, then its run (only the error line of each stack trace):

```text
$ cat typo.ts
const n: number = "oops";
console.log(typeof n, n);
$ node typo.ts
string oops
$ cat color.ts
enum Color { Red, Green }
console.log(Color.Green);
$ node color.ts
SyntaxError [ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX]: TypeScript enum is not supported in strip-only mode
$ cat box.ts
class Box {
  constructor(private cents: number) {}
}
console.log(new Box(5));
$ node box.ts
SyntaxError [ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX]: TypeScript parameter property is not supported in strip-only mode
$ cat noext.ts
import { total } from "./src/cart";
console.log(total([]));
$ node noext.ts
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../ts/src/cart' imported from .../ts/noext.ts
$ cat notype.ts
import { total, Item } from "./src/cart.ts";
const items: Item[] = [];
console.log(total(items));
$ node notype.ts
SyntaxError: The requested module './src/cart.ts' does not provide an export named 'Item'
```

1. **No type checking.** A type error runs fine. "It runs on Node" says nothing about types.
2. **No enums, no parameter properties.** Namespaces with runtime code and import aliases also need transformation ^[confirmed](https://nodejs.org/docs/latest-v22.x/api/typescript.html "2026-10-20").
3. **Imports need the `.ts` extension.**
4. **Type-only imports need `type`.** Without it, Node looks for a value that does not exist at run time.
5. **A failing test exits 1.** We changed the expected value to 8 and got `not ok 2`, `expected: 8`, `actual: 9`, `# fail 1` (TAP output), exit 1.

An agent that hits trap 2 may "fix" it by adding a tool such as `ts-node` ^[inference](- "2026-10-20"). That is a new dependency ([[M10]]). The right fix is a few lines of plain TypeScript.

:::drill id="tb-node-ts" title="Make strip-only TypeScript run" time="10 min"
1. Build the `ts/` example and run `node --test`. Then change one expected value, run again, and record the exit code. Change it back.
2. Write `color.ts` with `enum Color { Red, Green }` and `console.log(Color.Green)`. Make it run on Node 22 without an enum and without any new package.
3. Write a class with a constructor parameter property. Rewrite it so it runs.

**Done when:** both files run with `node file.ts`, the failing test gave exit 1, and you added no dependency.

:::reveal title="Show our rewrites"
```ts
const Color = { Red: 0, Green: 1 } as const;
type Color = (typeof Color)[keyof typeof Color];

const pick: Color = Color.Green;
console.log(pick);
```

```ts
class Box {
  cents: number;
  constructor(cents: number) {
    this.cents = cents;
  }
}
console.log(new Box(5).cents);
```

Real output: `1` and `5`, both with exit 0.
:::
:::

## 12. agy basics {#agy}

**Why Polaris cares:** `agy`, the Antigravity CLI, is Google's current coding agent for personal accounts: Gemini CLI was replaced by it for Google AI Pro and Ultra and free Code Assist users on 2026-06-18 ^[confirmed](https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/ "2026-10-20"). You will practice on it, and you will run Gemini on your own tasks with it.

**Installing and signing in is your Day-1 task.** Do the [[start-here#day-1|Day-1 tool checklist]] yourself. An agent must never sign in for you. Every `agy` command below was **checked against docs on 2026-10-20, not run**: `agy` is not installed on the build machine. The docs change weekly and sometimes contradict each other ^[inference](- "2026-10-20"). A **headless** run has no human at the keyboard: one prompt in, one result out.

| Command or setting | What the docs say | Step | Source |
|---|---|---|---|
| `agy --mode=plan`, Shift+Tab | three modes: `default` (diff review before every edit), `accept-edits`, `plan`; Shift+Tab cycles them | [[S3]], [[S8]] | ^[confirmed](https://antigravity.google/docs/cli/modes/ "2026-10-20") |
| `"toolPermission"` in settings, `/permissions` | best practices: `request-review` (default: asks before writes, shell and network), `proceed-in-sandbox`, `strict`. The features page lists `request-review`, `always-proceed`, `strict` for `/permissions`. The docs disagree, so check `/permissions` yourself | [[S0]] | ^[confirmed](https://antigravity.google/docs/cli/best-practices "2026-10-20") ^[confirmed](https://antigravity.google/docs/cli/features "2026-10-20") |
| `--sandbox`, `"enableTerminalSandbox": true` | off by default; sandboxed commands have no network by default; macOS uses `sandbox-exec` | [[S0]] | ^[confirmed](https://antigravity.google/docs/sandbox/ "2026-10-20") |
| `GEMINI.md` or `AGENTS.md` at the workspace root | read at startup: standards, test commands | [[S5]] | ^[confirmed](https://antigravity.google/docs/cli/best-practices "2026-10-20") |
| `/context` | context-window use, token breakdown, checkpoints | [[S3]] | ^[confirmed](https://antigravity.google/docs/cli/features "2026-10-20") |
| `/agents` | opens the subagents panel | [[S3]] | ^[confirmed](https://antigravity.google/docs/cli/features "2026-10-20") |
| `/codesearch` | workspace code search | [[S4]] | ^[confirmed](https://antigravity.google/docs/cli/features "2026-10-20") |
| `/diff` | interactive diff viewer | [[S10]] | ^[confirmed](https://antigravity.google/docs/cli/features "2026-10-20") |
| `/rewind` (alias `/undo`), `/fork`, `/resume` | roll back to a checkpoint; copy the session for a risky try; switch back | [[S9]] | ^[confirmed](https://antigravity.google/docs/cli/best-practices "2026-10-20") |
| `agy -p "PROMPT" --output-format json` | one-shot headless run; JSON has `conversation_id`, `status`, `response`, `error`, `num_turns`, `usage` | [[S11]] | ^[confirmed](https://antigravity.google/docs/cli/headless/ "2026-10-20") |
| `agy -p "PROMPT" --model MODEL --effort medium --output-format json` | choose the model and effort (`low`, `medium`, `high`) for a headless run | [[S0]] (record both in `audit.md`), [[runs-and-weaknesses]] | ^[confirmed](https://antigravity.google/docs/cli/headless/ "2026-10-20") |
| `--print-timeout` | default `5m` | [[S11]] | ^[confirmed](https://antigravity.google/docs/cli/headless/ "2026-10-20") |
| `--dangerously-skip-permissions` | approves every tool call, including writes and commands | never on your real files | ^[confirmed](https://antigravity.google/docs/cli/headless/ "2026-10-20") |

**The status gate.** The headless docs list these statuses: `SUCCESS`, `ERROR`, `CANCELED`, `INTERRUPTED`, `INVALID`, `WAITING`, `RUNNING`. They also say a tool call that needs an approval nobody can give is **soft-denied**: the run continues, exits 0 and prints only a notice on stderr ^[confirmed](https://antigravity.google/docs/cli/headless/ "2026-10-20"). So never trust the exit code of `agy -p`. Gate on `status`. `jq -e` sets its exit code from the result, so one line is enough. We ran it on four **hand-made** files that use the field names from the docs; they are not real `agy` output:

```text
$ cat ok.json bad.json nostatus.json broken.json
{"conversation_id":"hand-made-1","status":"SUCCESS","response":"done","num_turns":3}
{"conversation_id":"hand-made-2","status":"INTERRUPTED","error":"timeout","num_turns":9}
{"response":"All tests pass!"}
not json
$ jq -e '.status == "SUCCESS"' ok.json > /dev/null; echo "exit=$?"
exit=0
$ jq -e '.status == "SUCCESS"' bad.json > /dev/null; echo "exit=$?"
exit=1
$ jq -e '.status == "SUCCESS"' nostatus.json > /dev/null; echo "exit=$?"
exit=1
$ jq -e '.status == "SUCCESS"' broken.json > /dev/null; echo "exit=$?"
jq: parse error: Invalid numeric literal at line 1, column 4
exit=5
```

Same results with Apple's `/usr/bin/jq` 1.7.1. A missing status fails, and so does a broken file. That is the behavior you want. A status gate may still not be enough. The docs do not say what `status` reports after a soft-denied tool call, so a run could plausibly say `SUCCESS` after a denied test command ^[inference](- "2026-10-20"). So your harness also saves stderr and runs the grader itself ([[prove#headless-status|Chapter 5]]).

Two more facts for your notes. Gemini CLI is still available for paid API keys and Code Assist Standard or Enterprise ^[confirmed](https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/ "2026-10-20"). Its headless form is `gemini -p "PROMPT" --output-format json` (checked against docs on 2026-10-20, not run: `gemini` is not installed here). The docs list the JSON fields `response`, `stats` and `error` (no `status` field), and the exit codes 0, 1, 42 (input error) and 53 (turn limit) ^[confirmed](https://geminicli.com/docs/cli/headless/ "2026-10-20"). And the `agy` docs pages do not always agree with each other or with summaries written a week ago. Trust `agy --help` and your own screen over any page, including this one.

:::drill id="tb-agy-crosscheck" title="Cross-check this table against your agy" time="10 min"
Do this after the Day-1 checklist, in a throwaway folder.

1. Save `agy --help > agy-help.txt 2>&1` and `agy --version`.
2. For each row of the table above, mark it **works**, **missing** or **different** (write what is different). Use `--help`, the slash-command list in an interactive session, and `/permissions`.
3. Run one harmless headless job in a new temp dir. It asks for no edits and no commands (checked against docs on 2026-10-20, not run):

   ```zsh
   cd "$(mktemp -d)" && printf 'print(2 + 2)\n' > a.py
   agy -p "Read a.py and say what it prints. Do not edit files. Do not run commands." --output-format json > run.json 2> run.err; echo "exit=$?"
   jq -r .status run.json
   jq -e '.status == "SUCCESS"' run.json > /dev/null; echo "gate=$?"
   ```

4. Write `agy --version`, the model and the effort level of that run in `agy-notes.md`. If you do not know them, run step 3 again with `--model` and `--effort` set ([[S0]] needs the model in `audit.md`).

**Done when:** every row has a mark and a date, `gate` is 0 exactly when the status is `SUCCESS`, and `agy --version`, the model and the effort level are in `agy-notes.md`.
:::

## Vibe coder vs senior engineer {#compare}

:::compare
- Gives the agent a `git worktree` copy and calls it isolated. || Builds a history-free snapshot in a new temp dir with `git archive` and a fresh `git init`, and checks that `git log --all` shows one commit.
- Writes a bisect script that returns 1 when the code does not build. || Returns 125 for "cannot test", keeps the script outside the repo, and checks the named commit against its parent.
- Runs `rg CANARY`, sees nothing, and reports "clean". || Knows rg skips ignored, hidden and binary files and symlinks. Scans files with `rg -uuu -L` and history with `git log --all -p | rg -F`.
- Trusts "pytest exited 0". || Reads the summary line and compares the counts with the baseline. All-skipped, all-xfailed and a planted `os._exit(0)` also exit 0.
- Installs packages into the base Python and forgets the versions. || Uses one venv per lab, a lock file, and pastes `uv pip freeze` into `audit.md`.
- Builds C++ once with the default flags and says "tests pass". || Adds an ASan and UBSan build with `-fno-sanitize-recover=all`, so every finding fails the run.
- Lets the agent add `ts-node` because an `enum` failed. || Knows Node 22.18+ strips types, rewrites the `enum` as a `const` object, and adds no dependency.
- Copies `agy` flags from a blog post and trusts the exit code of `agy -p`. || Checks `agy --help` against the docs date and gates every headless run on `status`.
:::

## Sources

Checked on 2026-10-20. Commands on this page were run on 2026-10-20 on macOS 26.6.1 (arm64) in zsh 5.9 with git 2.55.0 (and Apple git 2.50.1 for the demo IDs), ripgrep 15.2.0, uv 0.12.1, Python 3.13.9, pytest 9.1.1, Hypothesis 6.170.5, coverage 7.16.2, Docker 29.6.2, CMake 4.4.2, GNU Make 3.81, Apple clang 21.0.0, lldb-2100.0.17.203, Node v22.21.1 and jq 1.8.1. We had `PYTHONDONTWRITEBYTECODE=1` set. Not run: live lldb sessions (macOS password prompt), Homebrew installs, every `agy` command and the `gemini` command.

Local primary sources, read and run on 2026-10-20 (no URL): `pytest --help`, `man rg`, `man make`, `lldb --help` and lldb's built-in `help`, and `security authorizationdb read system.privilege.taskport.debug`.

- Google Careers, Research Engineer, Polaris (job 114077679900074694) ^[confirmed](https://www.google.com/about/careers/applications/jobs/results/114077679900074694-research-engineer-polaris-deepmind "2026-10-19")
- Google DeepMind, "Interviewing at Google DeepMind" (no AI tools in live interviews unless told otherwise) ^[confirmed](https://storage.googleapis.com/deepmind-media/DeepMind.com/Assets/Docs/interviewing-at-google-deepmind.pdf "2026-10-20")
- Harbor task format: `tests/test.sh`, `/logs/verifier/reward.txt` ^[confirmed](https://docs.harborframework.com/tasks/overview "2026-10-20")
- Harbor verifier: `tests/` is uploaded to `/tests/` after the agent runs ^[confirmed](https://docs.harborframework.com/tasks/verifier "2026-10-20")
- SWE-bench issue #465, agents reading future repo state with `git log --all` ^[confirmed](https://github.com/SWE-bench/SWE-bench/issues/465 "2026-10-20")
- Cursor, "Reward hacking is swamping model intelligence gains" (git-history mining in 9% of 731 trajectories of one model, judged by an auditor agent) ^[confirmed](https://cursor.com/blog/reward-hacking-coding-benchmarks "2026-10-20")
- Ludwig et al., "Shortcutting the Fix" (network off did not meaningfully reduce shortcut attempts) ^[confirmed](https://arxiv.org/abs/2609.06780 "2026-10-20")
- git-bisect manual (exit codes, 125, script outside the repository) ^[confirmed](https://git-scm.com/docs/git-bisect "2026-10-20")
- git-worktree manual (what linked worktrees share) ^[confirmed](https://git-scm.com/docs/git-worktree "2026-10-20")
- git-log manual (`-S`, `-G`, `-p`) ^[confirmed](https://git-scm.com/docs/git-log "2026-10-20")
- ripgrep user guide (automatic filtering, symlinks, `-u`, `-L`, `--sort path`) ^[confirmed](https://github.com/BurntSushi/ripgrep/blob/master/GUIDE.md "2026-10-20")
- uv docs, locking with `uv pip compile` and `uv pip sync` ^[confirmed](https://docs.astral.sh/uv/pip/compile/ "2026-10-20")
- pytest exit codes ^[confirmed](https://docs.pytest.org/en/stable/reference/exit-codes.html "2026-10-20")
- pytest usage (`-k`, `-p no:NAME`) ^[confirmed](https://docs.pytest.org/en/stable/how-to/usage.html "2026-10-20")
- Anthropic, emergent misalignment from reward hacking (`sys.exit(0)` to exit the test harness with code 0) ^[confirmed](https://www.anthropic.com/research/emergent-misalignment-reward-hacking "2026-10-20")
- Inozemtseva and Holmes, "Coverage Is Not Strongly Correlated with Test Suite Effectiveness", ICSE 2014 ^[confirmed](https://cs.ubc.ca/~rtholmes/papers/icse_2014_inozemtseva.pdf "2026-10-20")
- Docker docs, the `none` network driver ^[confirmed](https://docs.docker.com/engine/network/drivers/none/ "2026-10-20")
- Docker docs, bind mounts and `:ro` ^[confirmed](https://docs.docker.com/engine/storage/bind-mounts/ "2026-10-20")
- GNU make manual, "Instead of Executing Recipes" (`-n` still runs `+` and `$(MAKE)` lines) ^[confirmed](https://www.gnu.org/software/make/manual/html_node/Instead-of-Execution.html "2026-10-20")
- Clang UndefinedBehaviorSanitizer docs (prints and continues by default; `-fno-sanitize-recover`) ^[confirmed](https://clang.llvm.org/docs/UndefinedBehaviorSanitizer.html "2026-10-20")
- LLDB, GDB to LLDB command map ^[confirmed](https://lldb.llvm.org/use/map.html "2026-10-20")
- Node.js 22 docs, TypeScript type stripping (on by default since v22.18.0; unsupported syntax) ^[confirmed](https://nodejs.org/docs/latest-v22.x/api/typescript.html "2026-10-20")
- Node.js 22 docs, test runner (default patterns, default reporter, `--test-name-pattern`, exit code 1) ^[confirmed](https://nodejs.org/docs/latest-v22.x/api/test.html "2026-10-20")
- Datacurve, DeepSWE (35 TypeScript tasks of 113) ^[confirmed](https://deepswe.datacurve.ai/blog/deepswe "2026-10-20")
- Gemini CLI docs, headless mode (JSON fields, exit codes) ^[confirmed](https://geminicli.com/docs/cli/headless/ "2026-10-20")
- Google Developers Blog, transition from Gemini CLI to Antigravity CLI ^[confirmed](https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/ "2026-10-20")
- Antigravity CLI docs: modes ^[confirmed](https://antigravity.google/docs/cli/modes/ "2026-10-20"), features ^[confirmed](https://antigravity.google/docs/cli/features "2026-10-20"), headless mode ^[confirmed](https://antigravity.google/docs/cli/headless/ "2026-10-20"), best practices ^[confirmed](https://antigravity.google/docs/cli/best-practices "2026-10-20"), terminal sandbox ^[confirmed](https://antigravity.google/docs/sandbox/ "2026-10-20")

:::check
- From memory, bisect `shop` with a script that returns 0, 1 and 125, and explain why the sloppy script blamed `0dd04a3`.
- Make a history-free practice copy in a new temp dir and prove that `git log --all` shows one commit.
- Name four pytest outcomes that exit 0 or 5 and prove nothing, and the line of output you read instead.
- Run a Harbor-style verifier in Docker with `--network none` and a read-only test mount, and read the reward on your Mac.
- Build C++ with ASan and UBSan so every finding fails the run, and say why recover mode is dangerous in a grader.
- Run TypeScript tests on Node 22 with no build step, and gate a headless agent result on `status` with `jq -e`.
:::
