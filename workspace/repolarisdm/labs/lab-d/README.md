# Lab D: Memory Ghost

- **Time box:** 60 minutes, plus about 5 minutes of setup. Drill 1 and the Stretch are optional
  (about 20 minutes more). If you start from zero, plan 75 minutes for the core.
- **Trains:** S10 Read the diff, S11 Re-run yourself (sanitizer build), S7 Locate (lldb), S12 Attack the fix
  (revert-the-fix check). Chapter 6, "Debug like a senior".
- **Mistake card:** M9 (C++ memory bugs and undefined behavior) and M6 ("tests pass" offered as proof).
  For M6 you judge the claim itself. There is no transcript here, so S14 (transcript audit) is not trained.
- **Needs:** macOS with the Xcode Command Line Tools (`clang++`, `make`, `lldb`, `atos`). No packages.
  Checked on Apple clang 21 on an arm64 Mac. Linux is not tested. There, `make asan` shows function names
  and `file:line` only if `llvm-symbolizer` is on your PATH.

## What you do

`repo/` is `ringlog`, a small C++17 library: a fixed-size, in-memory log that keeps the newest records.
It has one header (`ringlog.h`), one source file (`ringlog.cpp`), a test driver (`test_ringlog.cpp`)
and a `Makefile`.

`repo/patches/` holds three changes that a coding agent proposed. Every patch message is **synthetic**:
written for practice, not real Gemini output. Every message ends with "Tests: make test passes".

Your job is the reviewer's job. For each patch, decide **merge** or **reject**, and back the decision with
evidence: a sanitizer report, a `file:line`, and a two-sentence root cause. Some patches may be fine.
"Looks wrong" is not evidence, and neither is "looks fine".

Words used below:

- **Undefined behavior (UB)**: code the C++ standard gives no meaning to. The program may seem to work,
  print a wrong value, or crash. A test that passes today proves nothing about UB.
- **ASan** (AddressSanitizer): a compiler mode that checks every memory access at run time. It reports
  out-of-bounds reads and writes on the heap, stack and globals, use-after-free, double free, and more.
- **UBSan** (UndefinedBehaviorSanitizer): a compiler mode that checks many kinds of UB at run time.
- **lldb**: the debugger that ships with Apple's developer tools. Use it on macOS instead of gdb.

## Why Polaris cares

Polaris builds software-engineering tasks and graders for Gemini. In C or C++, "the tests pass" is weak
evidence: a memory bug or UB can pass every test in a normal build. A grader that only runs the normal
build gives full reward to a broken patch. That is a false accept, the error that makes a benchmark lie.
The fix is cheap: run the tests again in a sanitizer build (step S11 of the Agent Patch Audit). ASan found
more than 300 previously unknown bugs in Chromium when it was introduced (Serebryany et al., 2012).
And an agent's confident reason ("this is enough because...") is a claim, not a check. You check it.

## Start (5 min)

Never open an agent inside the portfolio repository. Work in a practice copy. From the playbook folder
(the one that contains `labs/`):

```bash
bash labs/make_practice.sh lab-d   # copies repo/ into a fresh temp dir with its own git; prints the path
cd /the/path/it/printed
ls                                 # Makefile  README.md  patches  ringlog.cpp  ringlog.h  symbolize.sh  test_ringlog.cpp
mkdir -p evidence                  # your saved output goes here; .gitignore lists it, so git ignores it
set -o pipefail                    # so "make ... | tee" keeps make's exit code (bash and zsh)
```

If you use an agent, open it in that folder only.

The script prints one commit: your **BASE**. Never commit on the `main` branch, so `main` stays at BASE.
Part 5 commits on a new branch for each patch. Back to BASE at any time: `git switch -f main && make clean`.
This throws away edits you did not commit.

## Part 1: Baseline (5 min)

Gate 1 of the audit: no baseline, no review. Run both targets on the unpatched code and save the output.

```bash
make test  2>&1 | tee evidence/baseline-test.txt; echo "exit=$?"
make asan  2>&1 | tee evidence/baseline-asan.txt; echo "exit=$?"
```

Real output (run on 2026-10-20, shortened in the middle):

```text
clang++ -std=c++17 -Wall -Wextra -Wpedantic -O2 -o build/test_ringlog ringlog.cpp test_ringlog.cpp
./build/test_ringlog
PASS starts_empty
PASS push_and_read
...
PASS many_pushes
9 tests, 0 failed
exit=0
clang++ -std=c++17 -Wall -Wextra -Wpedantic -fsanitize=address,undefined -fno-sanitize-recover=all -fno-omit-frame-pointer -g -O1 -o build/test_ringlog_asan ringlog.cpp test_ringlog.cpp
PASS starts_empty
...
9 tests, 0 failed
exit=0
```

What the `make asan` flags mean:

| Flag | Why |
|---|---|
| `-fsanitize=address,undefined` | Turn on ASan and UBSan together. |
| `-fno-sanitize-recover=all` | Stop at the first finding with a non-zero exit, so a script or grader cannot miss it. |
| `-fno-omit-frame-pointer` | Better stack traces in the report. |
| `-g -O1` | Debug info for file:line; `-O1` keeps it fast enough. |

Two macOS details are built into the Makefile. You do not need to change them, but you should know them:

- On macOS the sanitizers call `abort()` after a report by default, which also writes a crash report.
  `abort_on_error=0` makes them exit with status 1 instead.
- To turn addresses into function names live, the sanitizer runtime starts `atos -p <pid>`, which inspects
  the running process. macOS may then ask for an administrator password. So `make asan` prints raw
  addresses (`symbolize=0`) and `symbolize.sh` adds names and file:line offline with `atos -o`.

## Part 2: Learn to read a report (10 min)

Practice on a tiny program first, outside the repo. It frees memory and then reads it.

```bash
tmp="$(mktemp -d)"
cat > "$tmp/ghost.cpp" <<'EOF'
// ghost.cpp: reads memory after it was freed (a use-after-free), on purpose.
#include <cstdio>

int main() {
  char* name = new char[6];
  std::snprintf(name, 6, "ghost");
  delete[] name;
  std::printf("%c\n", name[0]);  // the ghost: this memory is gone
  return 0;
}
EOF
clang++ -std=c++17 -fsanitize=address,undefined -fno-sanitize-recover=all -fno-omit-frame-pointer -g -O1 \
  -o "$tmp/ghost" "$tmp/ghost.cpp"
ASAN_OPTIONS=abort_on_error=0:symbolize=0 "$tmp/ghost" 2> "$tmp/ghost.log"; echo "exit=$?"
bash symbolize.sh "$tmp/ghost" < "$tmp/ghost.log"
```

Real output (2026-10-20; the shadow-byte table is cut):

```text
exit=1
=================================================================
==38923==ERROR: AddressSanitizer: heap-use-after-free on address 0x6020000000b0 at pc 0x0001009c08a0 bp 0x00016f43e4a0 sp 0x00016f43e498
READ of size 1 at 0x6020000000b0 thread T0
    #0 0x0001009c089c in main ghost.cpp:8
    #1 0x000180bc84e0  (/usr/lib/dyld:arm64e+0x204e0)

0x6020000000b0 is located 0 bytes inside of 6-byte region [0x6020000000b0,0x6020000000b6)
freed by thread T0 here:
    #0 0x000101124444  (/Library/Developer/CommandLineTools/usr/lib/clang/21/lib/darwin/libclang_rt.asan_osx_dynamic.dylib:arm64e+0x50444)
    #1 0x0001009c0854 in main ghost.cpp:7
    #2 0x000180bc84e0  (/usr/lib/dyld:arm64e+0x204e0)

previously allocated by thread T0 here:
    #0 0x000101124068  (/Library/Developer/CommandLineTools/usr/lib/clang/21/lib/darwin/libclang_rt.asan_osx_dynamic.dylib:arm64e+0x50068)
    #1 0x0001009c0838 in main ghost.cpp:5
    #2 0x000180bc84e0  (/usr/lib/dyld:arm64e+0x204e0)

SUMMARY: AddressSanitizer: heap-use-after-free in main ghost.cpp:8
Shadow bytes around the buggy address:
```

Read it in this order:

1. **The error type** on the `ERROR:` line: `heap-use-after-free`. Others you may meet:
   `heap-buffer-overflow`, `stack-buffer-overflow`, `double-free`.
2. **The access**: `READ of size 1`. Was it a read or a write, and how many bytes?
3. **Stack #0**: where the bad access happened (`ghost.cpp:8`). Frames below it are the callers.
4. **Where the memory is**: "located N bytes inside of" (or "after", or "before") an M-byte region.
   This tells you how far off the access was.
5. **The other stacks**: where the memory was allocated, and freed. The bug is often there, not in frame #0.
   Here the read on line 8 is only the symptom. The real mistake is using `name` after line 7.

UBSan reports look different: one line with `file:line:column: runtime error:`, then a stack.

```bash
cat > "$tmp/shift.cpp" <<'EOF'
// shift.cpp: shifts a 32-bit int by too many bits (undefined behavior), on purpose.
#include <cstdio>
#include <cstdlib>

int main(int argc, char** argv) {
  int bits = argc > 1 ? std::atoi(argv[1]) : 3;
  std::printf("%d\n", 1 << bits);
  return 0;
}
EOF
clang++ -std=c++17 -fsanitize=address,undefined -fno-sanitize-recover=all -fno-omit-frame-pointer -g -O1 \
  -o "$tmp/shift" "$tmp/shift.cpp"
"$tmp/shift" 3; echo "exit=$?"
UBSAN_OPTIONS=abort_on_error=0:print_stacktrace=1:symbolize=0 "$tmp/shift" 40 2> "$tmp/shift.log"; echo "exit=$?"
bash symbolize.sh "$tmp/shift" < "$tmp/shift.log"
clang++ -std=c++17 -O2 -o "$tmp/shift_plain" "$tmp/shift.cpp" && "$tmp/shift_plain" 40; echo "exit=$?"
```

Real output (2026-10-20; the temp path is shortened to `$tmp`):

```text
8
exit=0
exit=1
$tmp/shift.cpp:7:25: runtime error: shift exponent 40 is too large for 32-bit type 'int'
    #0 0x00010084490c in main shift.cpp:7
    #1 0x000180bc84e0  (/usr/lib/dyld:arm64e+0x204e0)

SUMMARY: UndefinedBehaviorSanitizer: undefined-behavior $tmp/shift.cpp:7:25
256
exit=0
```

Look at the last two lines. The normal build printed `256` and exited 0. No crash, no warning, a wrong
answer. That is what UB looks like in a normal test run.

You can also turn one raw address into file:line with lldb, without running the program. Take the hex
number after `+` in a raw frame such as `($tmp/ghost:arm64+0x10000089c)`:

```bash
lldb --batch -o "image lookup --address 0x10000089c" "$tmp/ghost"
```

```text
(lldb) image lookup --address 0x10000089c
      Address: ghost[0x000000010000089c] (ghost.__TEXT.__text + 132)
      Summary: ghost`main + 132 at ghost.cpp:8:23
```

Use the address from your own log; it changes with every build. Clean up with `rm -rf "$tmp"`.

## Part 3: Review the three patches (25 min)

For each patch, in this order:

1. **Read before you run (S10).** `git apply --stat patches/NN-name.patch`, then read the whole patch.
   Write one line: merge or reject, and why. This is your own hypothesis, before any tool.
2. **Apply it:** `git apply patches/NN-name.patch && make clean` (why `make clean`: see Part 5)
3. **Run both builds (S11) and keep the evidence:**
   `make test; echo "exit=$?"`, then `make asan 2>&1 | tee evidence/asan-NN.txt; echo "exit=$?"`.
   `make` exits 2 when the test program fails.
4. **Undo it:** `git checkout -- . && make clean`

Fill in this table:

| Patch | Your guess before running | `make test` | `make asan` | Verdict | Evidence (report line, file:line) |
|---|---|---|---|---|---|
| 01-reuse-slot-buffers | | | | | |
| 02-tail-and-count | | | | | |
| 03-collapse-repeats | | | | | |

Then judge six claims from the patch messages. For each, write **right** or **wrong** and one command
whose output proves it.

- **K1** (patch 01): "The buffers are sized for max_text bytes, which is enough because push() cuts every
  message to max_text bytes first."
- **K2** (patch 01): "One allocation per slot instead of one per push."
- **K3** (patch 02): "size_ - n cannot underflow, because n is clamped to size_ first."
- **K4** (patch 02): "The loop counts down with an unsigned index (k-- > 0), which stops after k = 0."
- **K5** (patch 03): "The fingerprint may wrap around for long messages; that is harmless because we compare
  the bytes anyway."
- **K6** (all three): "Tests: make test passes."

A claim can be true and still prove nothing. Say so when you see one.

## Part 4: lldb basics (8 min, plus 7 min for the optional Drill 1)

### The permission prompt

The first time in a login session that you debug one of your own processes, macOS asks for an
administrator password (see `man DevToolsSecurity`). That is normal. Type it, or ask the owner of the Mac.

We did **not** run a live lldb session on the build machine, because of this prompt. So the output of
`run`, `bt` and `frame variable` is not shown here. Every command below is checked against lldb's own
`help` (lldb-2100.0.17.203, 2026-10-20). The commands that do not start the program were run, and their
output is real.

### Commands you need

| Command | Short form | What it does |
|---|---|---|
| `lldb build/test_ringlog_debug` | | Load the program. It does not run yet. |
| `breakpoint set --file ringlog.cpp --line 52` | `b ringlog.cpp:52` | Stop before that line runs. |
| `breakpoint set --name ringlog::RingLog::push` | `b ringlog::RingLog::push` | Stop when the function starts. |
| `breakpoint modify --condition 'size_ == capacity_' 1` | | Stop at breakpoint 1 only when the condition is true. |
| `breakpoint list`, `breakpoint delete 1` | `br l` | Show or remove breakpoints. |
| `run` | `r` | Start the program. |
| `thread backtrace` | `bt` | Show the call stack. Frame 0 is where you are. |
| `frame select 2`, `up`, `down` | `f 2` | Move to another frame of the stack. |
| `frame variable` | `v` | Show the arguments and local variables. `v this->start_` shows a member. |
| `expression -- len + 1` | `p len + 1` | Evaluate an expression, for example `p start_` or `p text`. |
| `next` | `n` | Run one source line, stepping over calls. |
| `step` | `s` | Run one source line, stepping into calls. |
| `finish` | | Run until the current function returns. |
| `continue` | `c` | Run until the next stop. |
| `memory read --size 1 --format x --count 16 ADDR` | `x` | Show raw bytes at an address, for example `slot->text`. |
| `watchpoint set expression -w write -s 1 -- ADDR` | | Stop when that one byte is written. |
| `memory history ADDR` | | In an ASan build: print the stacks that allocated and freed that memory. |
| `quit` | `q` | Leave lldb. |

### Drill 1 (optional): watch the ring wrap (base code, 7 min)

Skip it if you are short of time. It is the gentlest first lldb session.

```bash
make debug                    # -O0 -g: every variable stays visible
lldb build/test_ringlog_debug
```

Line 52 of `ringlog.cpp` runs only when the log is full and the oldest record is overwritten:

```cpp
  } else {
    slot = &slots_[start_];  // the oldest record is overwritten
    start_ = (start_ + 1) % capacity_;
    ++dropped_;
  }
```

Setting the breakpoints does not start the program. Real output (2026-10-20):

```text
(lldb) breakpoint set --file ringlog.cpp --line 52
Breakpoint 1: where = test_ringlog_debug`ringlog::RingLog::push(ringlog::Level, char const*) + 164 at ringlog.cpp:52:13, address = 0x0000000100000928
(lldb) breakpoint set --name ringlog::RingLog::push
Breakpoint 2: where = test_ringlog_debug`ringlog::RingLog::push(ringlog::Level, char const*) + 32 at ringlog.cpp:42:33, address = 0x00000001000008a4
(lldb) breakpoint modify --condition "size_ == capacity_" 2
(lldb) breakpoint list --brief
Current breakpoints:
1: file = 'ringlog.cpp', line = 52, exact_match = 0, locations = 1
2: name = 'ringlog::RingLog::push', locations = 1
```

Now delete breakpoint 2 (`breakpoint delete 2`), then:

```text
(lldb) run
(lldb) bt
(lldb) p text
(lldb) v this->start_ this->size_ this->capacity_
(lldb) next
(lldb) next
(lldb) p start_
(lldb) continue
(lldb) p text
```

Answer from what lldb shows, then check against the code:

- Which test is running at the first stop? (`bt`, frame 1.)
- What are `text` and `start_` at the first stop, and what is `start_` after the overwrite?
- At the second stop, what is `text`? Why does `at(0)` return `"m3"` after the test's fifth push?

Then try a condition: `breakpoint modify --condition 'dropped_ == 995' 1`, `continue`, `p text`.
You jump straight to a push inside `many_pushes`, without stopping 995 times.

### Drill 2: stop at the bad state (a patch you rejected, 8 min)

Start at BASE (`git status` shows a clean tree). Apply a patch that `make asan` rejected:
`git apply patches/NN-name.patch && make clean`. Debug it in two ways. When you finish, undo it:
`git checkout -- . && make clean`.

**A. A breakpoint on the reported line.** `make debug`, then `lldb build/test_ringlog_debug`. Set a breakpoint on
the `file:line` from frame #0 of the report. Add a condition that is true only in the bad case. `run`, then use
`v` and `p` to print the values that prove the bug. Copy those lldb lines into `evidence/lldb-NN.txt`.
For a memory bug, also look at the bytes with `memory read`.

**B. The sanitizer binary under lldb.**

```bash
make build/test_ringlog_asan                 # builds the sanitizer binary without running the tests
ASAN_OPTIONS=symbolize=0 lldb build/test_ringlog_asan
```

```text
(lldb) run
(lldb) bt
(lldb) frame select N        # N = the first frame in ringlog.cpp
(lldb) v
```

lldb passes your environment to the program (`target.inherit-env` is `true`). Without `abort_on_error=0`,
the sanitizer calls `abort()` after its report on macOS, so lldb stops the program right there and you can
inspect it. `symbolize=0` keeps the sanitizer from starting `atos`; lldb prints names in `bt` itself.
(Not run by us; see the permission note above.)

## Part 5: Prove the verdict (12 min)

For each patch you reject:

1. **Gate 3:** explain the bug in two sentences, with `file:line`. The line that is wrong may not be the line in
   frame #0. Look at the other stacks and at the patch.
2. **Fix it** with the smallest change. Then prove the fix and attack it (S12). Each patch gets its own branch,
   so `main` stays at BASE:

```bash
git switch -C fix-NN main            # a new branch for this patch, starting at BASE
git apply patches/NN-name.patch
git commit -qam "agent patch NN"     # so that git diff shows only your fix
# ... edit the code ...
make clean && make test && make asan # both must pass
git diff > evidence/fix-NN.diff
git stash                            # undo only your fix
make clean && make asan              # must fail again, with the same report
git stash pop
git switch -f main && make clean     # back to BASE for the next patch; your fix is in evidence/fix-NN.diff
```

Always `make clean` after `git stash`, `git checkout` or `git apply`. `make` rebuilds only when a source file
looks newer than the binary, and the GNU Make 3.81 that ships with macOS compares whole seconds. A source
file changed in the same second as the last build is missed. Real output (2026-10-20), a two-line Makefile
whose rule is `out: in.txt` / `cp in.txt out`:

```text
$ make --version | head -1
GNU Make 3.81
$ echo a > in.txt; make -s out; echo b > in.txt; make out
make: `out' is up to date.
$ stat -f '%Fm' in.txt out
1792501466.910251135
1792501466.787695417
```

`in.txt` is 0.12 seconds newer than `out`, and make still says "up to date". A stale binary gives you a
verdict about old code. This is how a revert-the-fix check can pass when it should fail.

If `make asan` still passes after `git stash` and `make clean`, your test run does not reach the bug, and your
evidence is weak.

3. **One more question:** why did `make test` pass for a buggy patch? Write a one-sentence hypothesis for each.
   The answer key explains what really happens on this machine.

Stretch (optional; S12, Chapter 8 thinking): for any patch you accept, write a differential test. Compare `RingLog` with a
`std::deque` model on many random pushes, for every capacity from 1 to 6. Run it in the sanitizer build. Then
break the patch on purpose and check that your test fails.

## Leaks are not checked here

Apple clang has no LeakSanitizer. Real output on this machine (2026-10-20), in bash, with `probe.cpp`
holding just `int main() { return 0; }`:

```text
$ clang++ -fsanitize=leak probe.cpp -o probe; echo "exit=$?"
clang++: error: unsupported option '-fsanitize=leak' for target 'arm64-apple-darwin25.6.0'
exit=1
$ ASAN_OPTIONS=detect_leaks=1 ./build/test_ringlog_asan; echo "exit=$?"
==54161==AddressSanitizer: detect_leaks is not supported on this platform.
bash: line 1: 54161 Abort trap: 6              ASAN_OPTIONS=detect_leaks=1 ./build/test_ringlog_asan
exit=134
```

The upstream Clang docs say `ASAN_OPTIONS=detect_leaks=1` works on macOS. Apple's toolchain does not ship it.
So a patch that leaks memory passes `make asan` here. On macOS, Apple's `leaks -atExit -- ./program` checks
leaks after the program exits (from `man leaks`; not run by us). On Linux, ASan checks leaks by default.

## Done when

- [ ] `evidence/baseline-test.txt` and `evidence/baseline-asan.txt` exist, and both say `9 tests, 0 failed`.
- [ ] All three patches have a verdict written before you ran anything, and a final verdict with evidence.
- [ ] Each rejected patch has the sanitizer error type, the report's `file:line`, and a two-sentence root cause.
- [ ] Each rejected patch has a fix in `evidence/fix-NN.diff`: `make asan` passes with it, and fails again
  after `git stash`.
- [ ] You stopped in lldb inside the function that frame #0 of a report names, and saved the `v`/`p` output
  that proves the bug in `evidence/lldb-NN.txt`.
- [ ] K1 to K6 are judged right or wrong, each with a command and its output.

## Check your work

`check.py` proves the lab: it builds every patch in a temp folder, checks each sanitizer report against the
answer key's `file:line`, applies the key's fixes, runs a hidden stress test with mutants on the patches the
key accepts, and checks every claim label. Its output gives the answers, so run it only after you finish.
Do not read `check.py` before you finish either: it shows what the key checks.

```bash
python3 labs/lab-d/check.py --keys /path/to/your/local/answer-keys/lab-d
```

It needs about one minute and writes nothing inside the lab folder.

## Sources

- AddressSanitizer, Clang docs: what it detects, typical 2x slowdown, `-O1` and `-fno-omit-frame-pointer`,
  `detect_leaks=1` on macOS upstream. https://clang.llvm.org/docs/AddressSanitizer.html (checked 2026-10-20).
- UndefinedBehaviorSanitizer, Clang docs: the checks, `-fno-sanitize-recover`, `UBSAN_OPTIONS=print_stacktrace=1`,
  the `runtime error:` format. https://clang.llvm.org/docs/UndefinedBehaviorSanitizer.html (checked 2026-10-20).
- Sanitizer common flags: `abort_on_error` defaults to true on Darwin; `symbolize`; `exitcode` defaults to 1.
  https://github.com/google/sanitizers/wiki/SanitizerCommonFlags (checked 2026-10-20).
- The macOS symbolizer runs `atos -p <pid>`: compiler-rt `sanitizer_symbolizer_mac.cpp`.
  https://github.com/llvm/llvm-project/blob/main/compiler-rt/lib/sanitizer_common/sanitizer_symbolizer_mac.cpp
  (checked 2026-10-20).
- Serebryany, Bruening, Potapenko, Vyukov, "AddressSanitizer: A Fast Address Sanity Checker", USENIX ATC 2012.
  https://www.usenix.org/conference/atc12/technical-sessions/presentation/serebryany (checked 2026-10-20).
- `man DevToolsSecurity`, `man atos`, `man leaks` (macOS 26.6), and lldb's built-in `help`
  (lldb-2100.0.17.203), read locally on 2026-10-20.
- All other command output above was captured from this lab on 2026-10-20 (macOS 26.6.1, arm64,
  Apple clang 21.0.0).
