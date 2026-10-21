---
title: Unfamiliar stacks and problem solving
short: Unfamiliar stacks
summary: Take a repo in a language you do not know from cold start to a tested change in 90 minutes. Read Go and Rust well enough to audit an agent's patch, and keep a timed C++ problem-solving habit for no-AI rounds.
---

:::selfcheck
- Open a repo you have never seen. In 5 minutes, using only its build file and CI config, write down the test command, the command for one test, the entry point and the language version. || Read `package.json` (`scripts`, `engines`, `type`, `bin`/`exports`), `go.mod` (`module`, `go`, `require`) or `Cargo.toml` (`edition`, `[workspace]`, `[[bin]]`, `build`). Then prove each answer by running it once or finding it with `rg`.
- In Go, what does `v, ok := x.(T)` give you when `x` does not hold a `T`? Why does that matter when you read a log line in the `else` branch? || `ok` is false and `v` is the zero value of `T`. A log line that prints `v` there prints nothing useful. Print `x` with `%T` instead.
- Why does this Rust fail to compile, and what is one fix? `let first = &v[0]; v.push(4); println!("{first}");` || `first` borrows `v`. `push` needs a mutable borrow while `first` is still used later (E0502). `push` may move the buffer, so `first` could dangle. Fix: copy the value (`let first = v[0];` for an `i32`), or finish using `first` before the push.
- What exit code does a Rust panic give, and which `go test` flag makes tests really run again instead of using the cache? || 101 (we measured it). `go test -count=1`. A cached result prints `(cached)` instead of a time.
- Without AI, write a stress test that compares a fast C++ solution with a brute force on random small inputs. || A seeded generator, a brute force, the fast solution, and a loop that runs both and stops at the first difference. See [[unfamiliar-stacks#stress-test|the stress test]].
- With n = 2·10^5 and a 2-second limit, which time complexities are safe? || O(n log n) and O(n). O(n^2) is 4·10^10 steps, far too slow. Plan with about 10^8 simple operations per second.
:::

## Why Polaris cares

Polaris builds realistic software-engineering tasks for Gemini ^[confirmed](https://www.google.com/about/careers/applications/jobs/results/114077679900074694-research-engineer-polaris-deepmind "2026-10-19"). Realistic tasks live in real repos, and real repos are not all Python ^[inference](- "2026-10-20"). DeepSWE, the closest public analogue, has 113 hand-written tasks: 35 TypeScript, 34 Go, 34 Python, 5 JavaScript and 5 Rust ^[confirmed](https://deepswe.datacurve.ai/blog/deepswe "2026-10-20"); so 79 of 113, about 70%, are not Python ^[inference](- "2026-10-20"). Google's own model card scores Gemini 4 Argon on DeepSWE v1.1 (77.9%) ^[confirmed](https://deepmind.google/models/model-cards/gemini-4-argon/ "2026-10-20"). Mechanize, whose co-founder now recruits for Polaris ^[reported](https://x.com/tamaybes/status/2105408224879116790 "2026-10-20"), screens for understanding unfamiliar codebases quickly ^[confirmed](https://www.mechanize.work/how-our-interview-process-works "2026-10-20"); treat that as a proxy, not as the Polaris rubric. The posting also lists competitive programming or math olympiads as preferred ^[confirmed](https://www.google.com/about/careers/applications/jobs/results/114077679900074694-research-engineer-polaris-deepmind "2026-10-19"), which is why the second half of this page is a problem-solving track.

How to spend the time (our plan) ^[inference](- "2026-10-20"):

| Part | Time | Output |
|---|---|---|
| The 5-step method and its drills | 45 min | Three build files read; one request traced |
| Lab H, timed | 90 min | A bug fix and a feature in TypeScript, with tests you wrote |
| Read Go and Rust quickly | 45 min | Two drills done; red-flag list in your head |
| Grade in another stack | 20 min | One hidden-style test that sees only the public API |
| C++ track setup | 30 min | Template, compile commands, one stress test |
| Algorithms, no AI | 15 min a day | A log of timed problems |
| ML basics | optional, about 6 h | Only after the core chapters |

## The method: five steps in ninety minutes {#method}

Do not learn the language first. Learn the repo's loop first: how to build it, test it and run it. Then learn only the syntax on the path you trace. Aggregator copies of the posting list learning new languages and tools quickly among the preferred skills ^[reported](https://www.globalsouthopportunities.com/2026/10/11/engineer/ "2026-10-20"). The official posting does not list it ([[start-here#the-job-decoded|the job, decoded]]). It is still useful: DeepSWE spreads its tasks over five languages ^[confirmed](https://deepswe.datacurve.ai/blog/deepswe "2026-10-20"). This method is how you show it.

It is the 5-move loop of [[agent-patch-audit]], compressed for a stack you do not know. Steps 1–3 are *Understand*. Step 4 is *Reproduce*, *Hypothesize* and *Change*: a failing test, then your own two-sentence guess of the cause with file:line before you read the agent's, then the fix. Step 5 is *Challenge*. In agent mode, the agent starts only after step 2 (Gate 1: no baseline, no agent).

| Step | You do | You write down | Time box | Audit step |
|---|---|---|---|---|
| 1. Read the build file | Build file, lock file, CI config, then the README | Test command, one-test command, run command, language version, direct dependencies | 5 min | [[S2]] |
| 2. Run the tests | Full suite twice; record tool versions | `baseline.txt`, exit code, pass and fail counts | 5 min | [[S1]] |
| 3. Trace one request | Entry → handler → logic → data → response. Static first, then one dynamic check. | A 5-line trace, each line with file:line | 10 min | [[S2]], [[S4]] |
| 4. Make the smallest change | Failing test first; write your own guess of the cause; then the smallest fix | A red → green test and a small diff | most of the time | [[S6]], [[S7]], [[S9]] |
| 5. Validate | Full suite against the baseline; revert the fix; diff the build files | Real output that matches your claims | 10 min | [[S11]], [[S12]] |

The time boxes are our plan for a 90-minute session ^[inference](- "2026-10-20").

Three rules:

- **Run before you read.** A test run is a fact. An agent's summary of a repo is a guess until you check it ([[M8]]).
- **One request, not the whole repo.** You need one true path through the code, not a full map. Full maps are in [[map]].
- **The build file beats the README.** READMEs drift. CI must run, so the commands in CI are the honest ones.

### Step 1 · Read the build file {#step-1}

A **build file** is the file that tells the tools how to build, test and run the project. Read it before any source file.

| Stack | Build file | Fields to read | Test all | Test one | Entry point | Exact versions pinned in |
|---|---|---|---|---|---|---|
| TypeScript on Node | `package.json` | `scripts`, `engines`, `type`, `bin`, `exports`, `dependencies` | `npm test` (runs `scripts.test`) | Runner-specific. `node:test`: `node --test test/x.test.ts` | `scripts.start`, `bin`, `exports` | `package-lock.json` (or the pnpm or yarn lock) |
| Go | `go.mod` | `module` (import prefix), `go` (minimum version), `require` | `go test ./...` | `go test -run 'TestName/sub' ./path/to/pkg` | `package main` with `func main()`, often under `cmd/<name>/` | `go.mod` itself (exact versions); `go.sum` holds their checksums |
| Rust | `Cargo.toml` | `edition`, `[workspace]`, `[[bin]]`, `build`, `[dependencies]`, `[features]` | `cargo test` | `cargo test name_part` (substring match) | `src/main.rs`, `src/bin/*.rs`, or a `[[bin]]` `path` | `Cargo.lock` |
| Python | `pyproject.toml` | `requires-python`, `dependencies`, `[project.scripts]`, `[tool.pytest.ini_options]` | `pytest` | `pytest -k name` | `[project.scripts]`, `__main__.py` | `uv.lock`, `poetry.lock` or a pinned `requirements.txt` |
| C++ | `CMakeLists.txt` | `add_executable`, `add_library`, `add_test`, `find_package` | `cmake -S . -B build && cmake --build build && ctest --test-dir build` | `ctest --test-dir build -R name --output-on-failure` | the `add_executable` target | nothing by default |

Sources for these commands: Go's `go test` flags ^[confirmed](https://pkg.go.dev/cmd/go "2026-10-20"); Cargo's layout ^[confirmed](https://doc.rust-lang.org/cargo/guide/project-layout.html "2026-10-20"); the `ctest` flags ^[confirmed](https://cmake.org/cmake/help/latest/manual/ctest.1.html "2026-10-20"), which we also ran with `ctest --help` on CMake 4.4.2.

Two more things to find in the first five minutes:

- **The CI config**, for example `.github/workflows/*.yml`. It lists the commands that really run.
- **Anything that runs code at build or install time.** Cargo compiles and runs `build.rs` just before it builds the package ^[confirmed](https://doc.rust-lang.org/cargo/reference/build-scripts.html "2026-10-20"). `npm install` runs `preinstall`, `install`, `postinstall` and `prepare` (plus its pre and post hooks). With a `binding.gyp` file, it runs `node-gyp rebuild` by default ^[confirmed](https://docs.npmjs.com/cli/v11/using-npm/scripts "2026-10-20"). Go never runs `go generate` automatically ^[confirmed](https://pkg.go.dev/cmd/go "2026-10-20"). In a task environment, an agent can change these files. Read them before you build ([[M10]]).

**Example 1: Lab H (TypeScript).** One command reads the fields that matter. Real output, Node v22.21.1, 2026-10-20:

```bash
node -p 'const p = require("./package.json"); [p.type, JSON.stringify(p.engines), JSON.stringify(p.scripts), "deps=" + Object.keys({...p.dependencies, ...p.devDependencies}).length].join("\n")'
```

```text
module
{"node":">=22.18.0"}
{"start":"node src/main.ts config/flags.example.json","test":"node --test"}
deps=0
```

What this tells you in 30 seconds:

- `"type": "module"`: files are ES modules. Use `import`, not `require`, in your code. (The one-liner above uses `require` because `node -p` runs its argument as a CommonJS script.)
- Node 22.18 or newer: Node runs `.ts` files directly by **type stripping**. It replaces type annotations with spaces and runs the JavaScript that is left. It never checks types ^[confirmed](https://nodejs.org/docs/latest-v22.x/api/typescript.html "2026-10-20").
- Zero dependencies: nothing to install. If an agent proposes `npm install ts-node` or `jest`, it is answering from habit, not from `engines` ([[M8]]), and adding a dependency ([[M10]]).
- The test runner is Node's built-in `node:test`.

**Example 2: a real Go service.** `ragserver` is a small HTTP server from the Go team's `golang/example` repo. It answers questions with Gemini over documents stored in Weaviate, a vector database. We pinned commit `7f05d217867b2af52b0a28c6d1c91df97e1b5b39` (2025-09-15) ^[confirmed](https://github.com/golang/example/tree/7f05d217867b2af52b0a28c6d1c91df97e1b5b39/ragserver/ragserver "2026-10-20"). Real output:

```bash
git clone --quiet https://github.com/golang/example.git && cd example
git checkout --quiet 7f05d217867b2af52b0a28c6d1c91df97e1b5b39
cd ragserver/ragserver && sed -n 1,10p go.mod
rg --files -g '*_test.go' . | wc -l
```

```text
module golang.org/x/example/ragserver/ragserver

go 1.23.0

require (
	github.com/google/generative-ai-go v0.17.0
	github.com/weaviate/weaviate v1.26.1
	github.com/weaviate/weaviate-go-client/v4 v4.15.1
	google.golang.org/api v0.194.0
)
       0
```

What this tells you:

- Go 1.23 or newer. So the method-based routes added in Go 1.22, like `"POST /query/"`, are available ^[confirmed](https://go.dev/blog/routing-enhancements "2026-10-20").
- It talks to two outside services: the Gemini API and Weaviate.
- It has **zero** `_test.go` files. The sibling folder `ragserver/tests/`, shared by the three ragserver variants, holds shell scripts and a docker-compose file. They need Docker, Weaviate and an API key. So your baseline here is `go build ./... && go vet ./...`, and your first change must bring its own check.

### Step 2 · Run the tests and save a baseline {#step-2}

A **baseline** is the test result before anyone changes anything. Without it you cannot tell what a change broke ([[S1]]).

```bash
set -o pipefail
git rev-parse HEAD > base.txt
node --version > versions.txt        # Go: go version   Rust: rustc --version; cargo --version
npm test -- --test-reporter=tap 2>&1 | tee baseline.txt; echo "exit=$?"
npm test -- --test-reporter=tap > baseline2.txt 2>&1; echo "exit=$?"
diff <(grep -E '^# (pass|fail)' baseline.txt) <(grep -E '^# (pass|fail)' baseline2.txt) && echo "same counts"
```

The `--` hands `--test-reporter=tap` to `node --test`. The note under the next table says why.

Real output on Lab H (first and last lines), Node v22.21.1:

```text
> togglebox@0.4.0 test
> node --test --test-reporter=tap

TAP version 13
# Subtest: eq and neq compare scalars strictly
ok 1 - eq and neq compare scalars strictly
...
1..33
# tests 33
# suites 0
# pass 33
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 818.524208
exit=0
exit=0
same counts
```

The same step in other stacks:

```bash
# Go (not run here: the build machine has no Go toolchain)
go version > versions.txt
go test -count=1 ./... 2>&1 | tee baseline.txt; echo "exit=$?"

# Rust
rustc --version > versions.txt; cargo --version >> versions.txt
cargo test 2>&1 | tee baseline.txt; echo "exit=$?"
```

Go caches test results. A cached result prints `(cached)` instead of the time, and `-count=1` is the idiomatic way to turn the cache off ^[confirmed](https://pkg.go.dev/cmd/go "2026-10-20"). Use it for the baseline. Otherwise your second run only replays the cache, and you learn nothing about flaky tests.

**How each runner says "failed".** Learn the markers. Then you can check an agent's "all tests pass" in its transcript in seconds ([[M6]]).

| Runner | Pass looks like | Fail looks like | Exit code on failure |
|---|---|---|---|
| `node --test` | `ok 1 - name`, `# fail 0` (TAP) or `✔ name`, `ℹ fail 0` (spec) | `not ok 2 - name`, `# fail 1` (TAP) or `✖ name`, `ℹ fail 1` (spec) | 1 ^[confirmed](https://nodejs.org/docs/latest-v22.x/api/test.html "2026-10-20"); we also saw it on Node v22.21.1 |
| `go test` | `--- PASS: TestX/sub`, `ok  pkg 0.01s` | `--- FAIL: TestX/sub`, `FAIL` | non-zero |
| `cargo test` | `test tests::x ... ok`, `test result: ok.` | `test tests::x ... FAILED`, `test result: FAILED.` | 101 ^[confirmed](https://doc.rust-lang.org/cargo/commands/cargo-test.html "2026-10-20"); we also saw it on cargo 1.97.1 |
| `pytest` | `5 passed` | `FAILED`, `1 failed` | 1 ^[confirmed](https://docs.pytest.org/en/stable/reference/exit-codes.html "2026-10-20") |

**Node has two output formats.** In your terminal, `node --test` uses the **spec** reporter: `✔ name`, `✖ name`, `ℹ pass 33`, `ℹ fail 0`. On Node 22, when the output goes to a pipe, a file or an agent's tool, it prints **TAP** (Test Anything Protocol, a plain-text test report): `ok 1 - name`, `# fail 0` ^[confirmed](https://nodejs.org/docs/latest-v22.x/api/test.html "2026-10-20"). From Node 23 on, spec is the default in a pipe too ^[confirmed](https://nodejs.org/api/test.html "2026-10-20"). Both formats are real runs. The greps on this page read TAP. So the commands ask for it with `--test-reporter=tap`, and they work on Node 22 and newer. Without it, on Node 23 or newer, the grep finds nothing, and the `diff` of two empty results still prints "same counts".

A real Rust failure, so you know what to look for (a small crate with a planted bug; cargo 1.97.1; trimmed):

```text
running 2 tests
test tests::inside ... ok
test tests::above ... FAILED

failures:

---- tests::above stdout ----

thread 'tests::above' (96323968) panicked at src/lib.rs:23:9:
assertion `left == right` failed
  left: 0
 right: 10

failures:
    tests::above

test result: FAILED. 1 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s

error: test failed, to rerun pass `--lib`
exit=101
```

If a transcript says "tests pass" but shows no summary line like `# fail 0`, `ℹ fail 0`, `ok  pkg` or `test result: ok.`, the agent did not show you a run.

### Step 3 · Trace one request end to end {#step-3}

A **request** here is one thing a user does: an HTTP call, a CLI command, or one call of a public function. To **trace** it, follow that one action from where it enters the code to where the answer leaves. Write each hop as file:line.

**Static first.** These searches find each hop:

| Find | TypeScript | Go | Rust |
|---|---|---|---|
| The entry point | `scripts.start` or `bin` in `package.json`; `rg -n 'createServer\|listen\('` | `rg -n 'func main\(' -g '*.go'` | `rg -n 'fn main\(' -g '*.rs'`, and any `[[bin]] path` |
| The route or command | the URL path or command name as a literal: `rg -nF '/v1/'` | same: `rg -nF '"POST /query/"'` | same |
| A definition | `rg -n '(function\|const) name\b'` | `rg -n 'func (\(\w+ \*?\w+\) )?name\('` | `rg -n 'fn name\b'` |
| Its callers | `rg -n 'name\('` | `rg -n 'name\('` | `rg -n 'name\('` |

**Worked example: `POST /query/` in ragserver.** Real output at the pinned commit:

```bash
rg -n 'func main\(' -g '*.go'
rg -n 'HandleFunc'
rg -n 'func (\(\w+ \*?\w+\) )?(readRequestJSON|renderJSON|combinedWeaviateError|decodeGetResults)\('
```

```text
main.go:32:func main() {
main.go:54:	mux.HandleFunc("POST /add/", server.addDocumentsHandler)
main.go:55:	mux.HandleFunc("POST /query/", server.queryHandler)
main.go:219:func decodeGetResults(result *models.GraphQLResponse) ([]string, error) {
json.go:17:func readRequestJSON(req *http.Request, target any) error {
json.go:33:func renderJSON(w http.ResponseWriter, v any) {
weaviate.go:51:func combinedWeaviateError(result *models.GraphQLResponse, err error) error {
```

Then open `main.go` at line 124 and read down to line 192. The 5-line trace:

1. `main.go:55` registers `POST /query/` → `queryHandler` (`main.go:124`). A `POST` pattern matches only POST requests, and a pattern ending in `/` matches every path under it ^[confirmed](https://go.dev/blog/routing-enhancements "2026-10-20").
2. `main.go:130` → `readRequestJSON` (`json.go:17`). It demands `Content-Type: application/json` and rejects unknown JSON keys. Any failure → HTTP 400.
3. `main.go:137` embeds the question (model name at `main.go:27`). `main.go:145–152` asks Weaviate for the 3 nearest documents. `main.go:153` checks errors (`weaviate.go:51`). `main.go:158` decodes the result (`main.go:219`).
4. `main.go:166–167` fills the prompt template (`main.go:194`) and calls the generative model (name at `main.go:26`).
5. `main.go:174–178` requires exactly one candidate. `main.go:180–189` joins the text parts and returns 500 if any part is not text. `main.go:191` writes the joined text with `renderJSON` (`json.go:33`). Every failure after step 2 → HTTP 500.

The model names at lines 26–27 are from 2024 code. In a review, do not "fix" them unless the task asks. That is scope creep ([[M4]]).

:::warn title="Famous repos are in the training data"
`golang/example` and ripgrep are famous. An agent may "trace" them from memory and cite lines that have moved. One study found that state-of-the-art models such as o3 named the buggy file from the issue text alone up to 76% of the time on SWE-bench Verified. On 245 tasks from seven repos outside SWE-bench, the best was only up to 53% ^[confirmed](https://arxiv.org/abs/2506.12286 "2026-10-20"). Pin the commit. Check every file:line the agent gives you ([[S4]], [[M8]]).
:::

**Then one dynamic check.** Static reading can miss a hop: a wrapper, a middleware, an interface. So run the request once and print the call stack at the deepest point you reached. Then delete the line.

A tiny TypeScript example (not Lab H), three files:

```ts
// price.ts
export function applyDiscount(cents: number, pct: number): number {
  console.trace('applyDiscount reached'); // temporary: prints who called us
  return Math.round(cents * (1 - pct / 100));
}

// checkout.ts
import { applyDiscount } from './price.ts';

export function checkout(items: number[], coupon: number): number {
  const subtotal = items.reduce((a, b) => a + b, 0);
  return applyDiscount(subtotal, coupon);
}

// main.ts
import { checkout } from './checkout.ts';

console.log(checkout([1999, 501], 10));
```

`node main.ts`, real output on Node v22.21.1, paths shortened, last frames trimmed:

```text
Trace: applyDiscount reached
    at applyDiscount (file:///tmp/demo/price.ts:2:11)
    at checkout (file:///tmp/demo/checkout.ts:5:10)
    at file:///tmp/demo/main.ts:3:13
    at ModuleJob.run (node:internal/modules/esm/module_job:343:25)
2250
```

The line numbers match your `.ts` file. Type stripping replaces types with spaces, so no source maps are needed ^[confirmed](https://nodejs.org/docs/latest-v22.x/api/typescript.html "2026-10-20").

The same trick in other stacks (each one run on 2026-10-20):

| Stack | Temporary line | Prints |
|---|---|---|
| TypeScript | `console.trace('here')` | `at fn (file.ts:line:col)` per frame |
| Go | `debug.PrintStack()` (import `runtime/debug`) | `main.checkout(...)` then `prog.go:18` per frame |
| Rust | `eprintln!("{}", std::backtrace::Backtrace::force_capture());` | `bt::checkout` then `at ./bt.rs:9:5` per frame (needs debug info: `rustc -g`, or a cargo debug build) |
| Python | `import traceback; traceback.print_stack()` | `File "x.py", line N, in fn` per frame |

Before step 4, `git diff` must be empty again.

### Step 4 · Make the smallest change {#step-4}

The **smallest change** removes the cause with the fewest changed lines. It adds no dependency and does not touch existing tests unless the spec says so ([[M3]], [[M10]]).

**A real example from the trace.** While you read `queryHandler`, you meet this (`main.go:180–189`, pinned commit):

```go
	var respTexts []string
	for _, part := range resp.Candidates[0].Content.Parts {
		if pt, ok := part.(genai.Text); ok {
			respTexts = append(respTexts, string(pt))
		} else {
			log.Printf("bad type of part: %v", pt)
			http.Error(w, "generative model error", http.StatusInternalServerError)
			return
		}
	}
```

`part.(genai.Text)` is a **type assertion**: "is this interface value a `genai.Text`?" With the two-value form, a failed assertion sets `ok` to false and `pt` to the **zero value** of `genai.Text`, which is the empty string. `pt` is still in scope in the `else` branch. So the log line meant to explain an unexpected part prints nothing after the colon. It is a small logging bug, not wrong behavior.

The smallest change is one line:

```diff
-			log.Printf("bad type of part: %v", pt)
+			log.Printf("bad type of part: %T", part)
```

**Check the language rule, not your memory.** We cannot build ragserver here (no Go toolchain), and running it needs a Gemini API key and a running Weaviate. So we checked the rule with a minimal reproduction on the Go Playground (go1.27.3, with `go vet` on), 2026-10-20:

```go
package main

import "log"

type Part interface{}
type Text string
type Blob struct{ MIMEType string }

func main() {
	log.SetFlags(0)
	parts := []Part{Text("hello"), Blob{MIMEType: "image/png"}}
	for _, part := range parts {
		if pt, ok := part.(Text); ok {
			log.Printf("text: %q", pt)
		} else {
			log.Printf("before: bad type of part: %v", pt)
			log.Printf("after:  bad type of part: %T", part)
		}
	}
}
```

```text
text: "hello"
before: bad type of part: 
after:  bad type of part: main.Blob
```

`go vet` reported nothing for this program. A linter did not catch it; a reader did. A real pull request would also run `go build ./... && go vet ./...` on the service itself. We did not.

**For a behavior change, the failing test comes first** ([[S6]]). The mechanics on a tiny TypeScript repo, real output on Node v22.21.1. The base has `if (n > hi) return lo;`, a bug. Add the test before touching the code, then run `node --test --test-reporter=tap`:

```ts
test('above clamps to hi', () => assert.equal(clamp(42, 0, 10), 10));
```

```text
not ok 2 - above clamps to hi
# pass 1
# fail 1
```

It fails, and for the right reason: the assertion, not an import error. Now fix the one line (`return hi;`) and run the full suite:

```text
# pass 2
# fail 0
```

### Step 5 · Validate {#step-5}

Prove the change with real output ([[S11]], [[S12]]). On the same tiny repo:

```bash
BASE=$(cat base.txt)                                        # saved in step 2
git diff "$BASE" -- src > fix.patch                         # the fix only, not the new test
git apply -R fix.patch && node --test --test-reporter=tap 2>&1 | grep -E '^# (pass|fail)'
git apply fix.patch && node --test --test-reporter=tap 2>&1 | grep -E '^# (pass|fail)'
rm fix.patch
git diff --stat "$BASE"
git diff "$BASE" -- package.json package-lock.json go.mod go.sum Cargo.toml Cargo.lock
```

```text
# pass 1
# fail 1
# pass 2
# fail 0
 src/clamp.ts       | 2 +-
 test/clamp.test.ts | 1 +
 2 files changed, 2 insertions(+), 1 deletion(-)
```

With the fix reverted, the new test fails. With the fix applied, it passes. So the test really guards the fix. The diff touches two files, and no build file changed. The last command printed nothing, which is what you want.

Then the stack's own static checks, if the repo already has them:

- TypeScript: `npx tsc --noEmit` only if `typescript` is already a dependency. Do not add it during a timed task.
- Go: `go vet ./...`. `go test` also runs a curated subset of vet checks by default ^[confirmed](https://pkg.go.dev/cmd/go "2026-10-20").
- Rust: `cargo clippy` and `cargo fmt --check` (both were installed with the build machine's rustup toolchain, 1.97.1).

:::compare
- Asks the agent to "explain this Go repo" and starts editing from its summary. || Reads `go.mod` and CI, runs the tests, traces one request with file:line, then asks the agent narrow questions and checks each answer.
- Lets the agent add `ts-node` because "TypeScript needs a compiler". || Reads `engines` in `package.json`, knows Node 22.18+ strips types, and rejects the new dependency ([[M8]], [[M10]]).
- Believes "all tests pass". || Looks for the runner's summary line, re-runs with the cache off (`go test -count=1`), and compares counts with the baseline.
- Reads Rust or Go by guessing from Python. || Uses a syntax map, proves surprising rules with a two-line program, and greps the diff for the stack's red flags.
- Fixes the symptom in the example from the ticket. || Writes a failing test from the written contract, makes the smallest fix, then reverts the fix to prove the test can fail.
:::

:::drill id="three-build-files" title="Read three build files in 15 minutes" time="15 min"
For each project, write five answers: test-all command, test-one command, entry point, minimum language version, number of direct dependencies. Add a sixth: does anything run code at build or install time?

1. Lab H: `labs/lab-h/repo/package.json`.
2. ragserver at the pinned commit above: `ragserver/ragserver/go.mod`.
3. ripgrep at commit `3fce3b5bb0236da2df6d99672afb8a719642eca7` ^[confirmed](https://github.com/BurntSushi/ripgrep/blob/3fce3b5bb0236da2df6d99672afb8a719642eca7/Cargo.toml "2026-10-20"). Read only `Cargo.toml`. You do not need to clone or build it.

Prove one answer per project, by running it or with `rg`.

**Done when:** you have 18 answers in 15 minutes, three are proven, and you checked the rest against the answers below.

:::reveal title="Show the answers"
**Lab H.** `npm test` (which runs `node --test`). One file: `node --test test/store.test.ts`. Entry: `src/main.ts` via `scripts.start`. Node ≥ 22.18.0. Zero dependencies. Nothing runs at install: there are no lifecycle scripts and no `binding.gyp`.

**ragserver.** `go test ./...` runs, but there are no `_test.go` files, so use `go build ./... && go vet ./...` as the baseline. Entry: `main.go:32`. Go ≥ 1.23.0. Four direct requires. Nothing runs at build time: Go has no build scripts, and `go generate` never runs by itself.

**ripgrep.** `cargo test`. One test: `cargo test --test integration name_part`, because `[[test]] name = "integration"` points at `tests/tests.rs`. With `autotests = false`, Cargo does not auto-discover other files in `tests/` ^[confirmed](https://doc.rust-lang.org/cargo/reference/cargo-targets.html "2026-10-20"). Entry: the `[[bin]]` named `rg` at `crates/core/main.rs`, **not** `src/main.rs`. The build file overrides the convention. Edition 2024 and Rust ≥ 1.96 (both set in `[workspace.package]`). Ten entries under `[dependencies]` (one optional), plus one target-specific dependency. It is a workspace of ten member crates. And `build = "build.rs"`: Cargo runs a build script before it builds the package. Read it before you build code you do not trust.
:::
:::

## Lab H: Unfamiliar Stack Sprint {#lab-h}

[[lab:lab-h]] is **togglebox**: a small feature-flag service in TypeScript. About 840 lines of source, 33 tests, zero dependencies. Node runs the `.ts` files directly. It has two tickets: `ISSUE.md` (a bug report) and `FEATURE.md` (a feature request). You fix the bug, then build the feature, in 90 minutes, with tests you add.

The format (bug, then feature, in one timed session) is a practice format modeled on Meta's AI-enabled round as candidates describe it ^[reported](https://www.hellointerview.com/blog/meta-ai-enabled-coding "2026-10-20"). It is not a known Polaris or Google format. It rehearses the solver's side of Day 4 of [[tracker#final-project|the Chronos extension plan]], a second task in another stack. The builder's side is in [Grade in another stack](#grade-stack).

Lab H is a warm-up. DeepSWE's reference solutions average 668 added lines across 7 files ^[confirmed](https://deepswe.datacurve.ai/blog/deepswe "2026-10-20"). For changes that size, use the milestone audits in [[change#milestones|Change with guardrails]].

**Start** from the root of the playbook repo:

```bash
bash labs/make_practice.sh lab-h   # copies repo/ to a fresh temp dir with its own git; prints the path
cd <the printed path>
node --version                     # you need v22.18.0 or newer
npm test                           # 33 tests, all pass
git log --oneline                  # one commit: your BASE
```

Open your agent **in that temp dir**, never inside the portfolio repo. The fresh git history means the agent cannot find answers in `git log --all` ([[M7]]). Pick one mode before you start the clock and write it down: agent mode (approve every edit), chat-only (you type all code), or no AI.

:::mock id="lab-h-sprint" title="Lab H · 90-minute timed change" minutes="90"
1. **0:00–0:05 · Step 1.** Read `package.json`, `README.md`, `tsconfig.json`. Write the test command, the run command, the Node version and the dependency count.
2. **0:05–0:10 · Step 2.** `git rev-parse HEAD > base.txt`. Save `npm test -- --test-reporter=tap` output to `baseline.txt`, twice. Compare the counts.
3. **0:10–0:15 · Step 3.** Trace one `POST /v1/evaluate/:key` request from the entry point to the JSON response. Five lines, each with file:line. Confirm with one `console.trace`, then delete it.
4. **0:15–0:40 · Bug.** Write a test from `ISSUE.md` and the docs it names. Before you ask the agent, write your own guess of the cause (file:line). The test must fail for the right reason **before** any fix. Then fix. Say the root cause in 2 sentences with file:line. Stuck at 0:40? Move on and come back at the end.
5. **0:40–1:20 · Feature.** One rule of `FEATURE.md` at a time: test, code, full suite. Every numbered rule and every validation bullet gets a test.
6. **1:20–1:30 · Validate.** Full suite against the baseline. `git diff --stat BASE`. Revert your bug fix: your bug test must fail. Re-apply it. Check that no dependency appeared.

Log every agent claim and how you checked it in the box below.
:::

:::tally id="lab-h-done" title="Lab H done-when"
- `npm test` passes, and you added tests for the bug and for the feature
- Your bug test fails when you revert your fix, and you checked it
- You can say the root cause in 2 sentences, with file:line, without notes
- Every numbered rule and every validation bullet in `FEATURE.md` has a test
- You changed an existing test only where `FEATURE.md` requires it, and you can say why
- From the playbook folder, `python3 labs/lab-h/check.py --grade <your practice dir> --keys <your local answer keys for lab-h>` reports all hidden acceptance tests passing
:::

**Prove language rules; do not recall them.** Python and JavaScript look alike and differ in small ways. When behavior depends on a language rule, run a two-line probe in both languages and compare. These probes are *not* about the lab's bug. They show the habit. Real output (Python 3.13.9, Node v22.21.1):

```bash
python3 -c 'print(sorted([10, 9, 1])); print(0 or 5); print(round(2.5), round(3.5)); print([1, 2] == [1, 2])'
node -e 'console.log([10, 9, 1].sort()); console.log(0 || 5, 0 ?? 5); console.log(Math.round(2.5), Math.round(3.5)); console.log([1, 2] === [1, 2])'
```

```text
[1, 9, 10]
5
2 4
True
[ 1, 10, 9 ]
5 0
3 4
false
```

JavaScript's default `sort` compares numbers as strings. Its `??` keeps `0`, while `||` does not. Python's `round` rounds halves to even. JavaScript's `===` on arrays compares identity, not contents. An agent explaining code "from Python habits" will get these wrong ([[M8]]). Make it run a probe, and read the output yourself.

**TypeScript red flags in a diff:** `@ts-ignore`, `@ts-nocheck`, `as any`, `as unknown as T`, an empty `catch {}`, new entries in `package.json`, and changes to existing files under `test/`. One study of real agent transcripts found an agent adding `@ts-nocheck` to test files; that study's rates were judged by an LLM ^[confirmed](https://www.lesswrong.com/posts/smE9h9RnaK7FWKBZ2/measuring-coding-agent-misalignment-in-the-wild-1 "2026-10-20"). Reading TypeScript itself is covered in [[map]]; the Node 22 tool details are in [[toolbelt]] and the lab's README.

:::drill id="lab-h-sprint" title="Lab H: 90-minute sprint, then grade it" time="1 h 45 min"
Run the [timed mock above](#mock-lab-h-sprint) in the mode you chose. Then grade:

```bash
# from the playbook folder (the one that contains labs/)
python3 labs/lab-h/check.py --grade <your practice dir> --keys <your local answer keys for lab-h>
```

Without `--keys`, it looks in `labs/lab-h/_key/`. If the keys are not there, it stops with "answer keys not found".

Do not open the hidden tests or your local answer keys before you finish. After grading, log each agent mistake you caught (type, the step that caught it, minutes) in `mistakes.csv`. Write one paragraph: what slowed you down most, and what you will do in the first 10 minutes next time.

Then read the docstring at the top of `labs/lab-h/check.py` (not the keys). Its default mode applies the recipe from [[grader-validity]] to TypeScript. The hidden tests fail on the base repo, pass on two independent correct solutions, and reject hand-written wrong ones. You write one such test yourself in the [hidden-test drill](#drill-hidden-test-lab-h).

**Done when:** every item in the Lab H done-when tally is ticked, inside 90 minutes of working time.
:::

## Read Go quickly {#read-go}

You do not need to write idiomatic Go to audit a Go patch. You need to read it correctly. Go is 34 of DeepSWE's 113 tasks ^[confirmed](https://deepswe.datacurve.ai/blog/deepswe "2026-10-20").

The build machine for this page had no Go toolchain. Every Go program on this page ran on the Go Playground (go1.27.3) on 2026-10-20, with its real output shown. To run Go yourself, install it yourself (for example with Homebrew) or use the Playground at [go.dev/play](https://go.dev/play/).

### Syntax map for a Python person {#go-syntax-map}

| Python | Go | Read it as |
|---|---|---|
| `x = 1` (new name) | `x := 1` | Declare and assign. `x = 2` only assigns to an existing `x`. `var n int` declares `n` as `0`. |
| `def f(a: int) -> int:` | `func f(a int) int {` | The type comes after the name. |
| `return a, b` | `func f() (int, error)` and `n, err := f()` | Multiple return values. The error is last by convention. |
| `None` | `nil` | Only for pointers, slices, maps, channels, functions and interfaces. Other types have **zero values**: `0`, `""`, `false`. |
| `raise` / `try` | `return ..., err` and `if err != nil { ... }` | Errors are ordinary values. `panic` is for programmer bugs. |
| `class` with methods | `type T struct{...}` and `func (t *T) M()` | `(t *T)` is the **receiver**. A pointer receiver can change `t`. |
| public vs `_private` | `Capitalized` vs `lowercase` | A capitalized name is visible outside its package. |
| protocol / duck typing | `interface` | A type satisfies an interface just by having the methods. There is no `implements`. |
| `list` | slice `[]int`, `s = append(s, x)` | Keep the result of `append`. Slices can share memory (drill below). |
| `dict` | `map[string]int`, `v, ok := m[k]` | A missing key gives the zero value, not a `KeyError`. |
| `for i, x in enumerate(xs)` | `for i, x := range xs` | Use `_` to ignore a value. |
| `isinstance(x, T)` | `v, ok := x.(T)` or `switch v := x.(type)` | On failure `v` is the zero value. |
| `with open(p) as f:` | `f, err := os.Open(p)` then `defer f.Close()` | `defer` runs when the function returns, last in, first out. |
| threads / `asyncio` | `go f()`, `ch <- v`, `v := <-ch`, `context.Context` | A **goroutine** is a cheap thread. `ctx` is the first parameter by convention and carries cancellation. |
| f-string | `fmt.Sprintf("%s=%d", k, v)` | `%v` any value, `%+v` with field names, `%T` the type, `%q` quoted. |
| package = module file | package = directory | Import path = `module` line in `go.mod` + the directory. |
| unused name is fine | unused import or local variable is a **compile error** | The Playground printed `declared and not used: x`. |

Two folder rules matter when you map a Go repo. Code under a directory named `internal` can be imported only by code rooted at the parent of `internal`. The go tool ignores directories named `testdata` and files whose names start with `_` or `.` ^[confirmed](https://pkg.go.dev/cmd/go "2026-10-20").

**JSON decoding surprises.** ragserver's request struct has a field `Content` and no tag, yet clients send `"content"`. Go's decoder prefers an exact match but also accepts a case-insensitive one ^[confirmed](https://pkg.go.dev/encoding/json "2026-10-20"). `DisallowUnknownFields` makes unknown keys an error. A missing key is *not* an error. Real output with ragserver's decoding setup:

```go
type queryRequest struct {
	Content string
}

func decode(body string) {
	qr := &queryRequest{}
	dec := json.NewDecoder(strings.NewReader(body))
	dec.DisallowUnknownFields()
	err := dec.Decode(qr)
	fmt.Printf("%-28s -> Content=%q err=%v\n", body, qr.Content, err)
}
```

```text
{"content": "fuel?"}         -> Content="fuel?" err=<nil>
{"CONTENT": "fuel?"}         -> Content="fuel?" err=<nil>
{"query": "fuel?"}           -> Content="" err=json: unknown field "query"
{"content": 42}              -> Content="" err=json: cannot unmarshal number into Go struct field queryRequest.content of type string
{}                           -> Content="" err=<nil>
```

So in ragserver, an empty body `{}` passes decoding, and an empty question goes on to the embedding call. Whether that is a bug depends on the spec. Say so in a review instead of guessing.

### Error handling in Go {#go-errors}

Errors are values, returned last. Wrap them with context using `fmt.Errorf("...: %w", err)`. Then `errors.Is` compares an error in the chain to a value, and `errors.As` tests for a type ^[confirmed](https://go.dev/blog/go1.13-errors "2026-10-20"). Real output:

```go
var ErrEmpty = errors.New("empty input")

func parsePort(s string) (int, error) {
	if s == "" {
		return 0, ErrEmpty
	}
	n, err := strconv.Atoi(s)
	if err != nil {
		return 0, fmt.Errorf("parse port %q: %w", s, err)
	}
	return n, nil
}
```

```text
"9020" -> n=9020 err=<nil> | Is(ErrEmpty)=false
"" -> n=0 err=empty input | Is(ErrEmpty)=true
"90x" -> n=0 err=parse port "90x": strconv.Atoi: parsing "90x": invalid syntax | Is(ErrEmpty)=false
   As(*strconv.NumError): Func = Atoi | Unwrap: strconv.Atoi: parsing "90x": invalid syntax
open /no/such/file: no such file or directory | Is(fs.ErrNotExist): true
```

What to check in an agent's Go diff:

- **A dropped error.** `x, _ := f()` or a bare `f()` on a function that returns an error. The compiler does not force you to look at a returned error.
- **A wrap with `%v` instead of `%w`.** The message looks the same, but `errors.Is` and `errors.As` can no longer see the cause.
- **`panic` or `log.Fatal` in library code.** `log.Fatal` exits the process, and an unrecovered `panic` crashes it. The caller never gets an error to handle.
- **The wrong context.** ragserver calls the model with `rs.ctx`, a background context made at startup, not `req.Context()`. For an incoming server request, `req.Context()` is canceled when the client's connection closes ^[confirmed](https://github.com/golang/go/blob/master/src/net/http/request.go "2026-10-20"). With `rs.ctx`, a client that hangs up does not cancel the model call. It is a design choice worth one sentence in a review.

### Testing in Go {#go-tests}

Go tests live in `*_test.go` files next to the code. The usual style is a **table-driven test**: a slice of cases and one loop with `t.Run` for named subtests. Real output with a planted bug (`return lo` instead of `return hi`):

```go
func TestClamp(t *testing.T) {
	tests := []struct {
		name      string
		n, lo, hi int
		want      int
	}{
		{"inside", 5, 0, 10, 5},
		{"below", -3, 0, 10, 0},
		{"above", 42, 0, 10, 10},
		{"at upper edge", 10, 0, 10, 10},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := Clamp(tc.n, tc.lo, tc.hi); got != tc.want {
				t.Errorf("Clamp(%d, %d, %d) = %d, want %d", tc.n, tc.lo, tc.hi, got, tc.want)
			}
		})
	}
}
```

```text
=== RUN   TestClamp
=== RUN   TestClamp/inside
=== RUN   TestClamp/below
=== RUN   TestClamp/above
    prog_test.go:30: Clamp(42, 0, 10) = 0, want 10
=== RUN   TestClamp/at_upper_edge
--- FAIL: TestClamp (0.00s)
    --- PASS: TestClamp/inside (0.00s)
    --- PASS: TestClamp/below (0.00s)
    --- FAIL: TestClamp/above (0.00s)
    --- PASS: TestClamp/at_upper_edge (0.00s)
FAIL
```

Spaces in subtest names become `_`. To run one subtest: `go test -run 'TestClamp/above' ./...`. The pattern is split at each `/`, and each part must match the matching level of the test's name ^[confirmed](https://pkg.go.dev/cmd/go "2026-10-20"). Other flags you will meet: `-v` (print every test), `-count=1` (no cache), `-race` (data race detection), `-failfast` (stop after the first failure). The default timeout is 10 minutes ^[confirmed](https://pkg.go.dev/cmd/go "2026-10-20").

:::drill id="go-predict" title="Predict seven Go output lines" time="10 min"
Read this program. Write down every line it prints, in order, **before** you run it. Then run it on the Go Playground.

```go
package main

import "fmt"

type NotFound struct{ Key string }

func (e *NotFound) Error() string { return "not found: " + e.Key }

func lookup(m map[string]int, k string) (int, error) {
	var err *NotFound // a nil pointer of a concrete type
	v, ok := m[k]
	if !ok {
		err = &NotFound{Key: k}
	}
	return v, err // returned as the interface type error
}

func main() {
	a := []int{1, 2, 3, 4}
	b := a[:2]
	b = append(b, 99)
	fmt.Println("1:", a, b)

	m := map[string]int{"go": 34}
	fmt.Println("2:", m["rust"], len(m))

	v, err := lookup(m, "go")
	fmt.Println("3:", v, err == nil)

	for i := 0; i < 3; i++ {
		defer fmt.Println("4: deferred", i)
	}
	fmt.Println("5: end of main")
}
```

**Done when:** you predicted all seven lines in order, or you can explain each line you missed in one sentence.

:::reveal title="Show the real output and why"
Real output, Go Playground (go1.27.3), 2026-10-20. `go vet` reported nothing.

```text
1: [1 2 99 4] [1 2 99]
2: 0 1
3: 34 false
5: end of main
4: deferred 2
4: deferred 1
4: deferred 0
```

1. `b := a[:2]` shares `a`'s memory and has spare capacity. So `append` writes `99` into `a[2]`.
2. A missing key gives the zero value `0`. Reading it does not add the key.
3. The famous one. `lookup` returns a nil `*NotFound` inside a non-nil `error` interface. The interface holds a type, so `err == nil` is false. A caller's `if err != nil` would treat success as failure. Return a plain `nil` on success.
4. Deferred calls run after `main`'s last line, last in, first out.

Line 3 is the kind of bug an agent writes when it "simplifies" error handling. Tests that only check the value miss it.
:::
:::

:::drill id="trace-add" title="Trace POST /add/ in ragserver, then check the agent" time="20 min"
Use the pinned ragserver commit from [Step 1](#step-1).

1. Without AI, write a 5-line trace of `POST /add/`, each line with file:line. Include what the server sends back on success.
2. In a fresh agent session opened in the clone, ask: "No changes. Trace `POST /add/` from `main` to the response. Give file:line for every claim. Say 'unsure' when unsure."
3. Mark each agent claim right or wrong against the code ([[S4]]).
4. Name one place where a failure could go unnoticed, and say how you would check it. A hypothesis is fine; label it.

**Done when:** your trace has 5 lines with file:line, every agent claim is marked with evidence, and you wrote one labeled hypothesis.

:::reveal title="Show a model trace"
1. `main.go:54` registers `POST /add/` → `addDocumentsHandler` (`main.go:70`).
2. `main.go:80` → `readRequestJSON` (`json.go:17`): JSON content type, no unknown keys. Failure → 400.
3. `main.go:87–92` batch-embeds every document. `main.go:97` checks that the count matches. Failure → 500.
4. `main.go:104–113` builds one Weaviate object per document: class `Document`, property `text`, the vector.
5. `main.go:117` writes the batch to Weaviate. Failure → 500. On success the handler writes nothing, so the server answers 200 with an empty body. The README says the same: "OK (no body)".

A hypothesis to check: `main.go:117` throws away the batch response with `_`. If the Weaviate client reports per-object failures inside that response instead of in `err`, failed inserts would go unnoticed. Check the client's documentation or source before you call it a bug.
:::
:::

## Read Rust quickly {#read-rust}

Rust is 5 of DeepSWE's 113 tasks ^[confirmed](https://deepswe.datacurve.ai/blog/deepswe "2026-10-20"), but it matters beyond its share: Google reports agents moving C/C++ code to Rust ^[confirmed](https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-4-argon/ "2026-10-20"). All Rust on this page was compiled and run with rustc 1.97.1 and cargo 1.97.1 on 2026-10-20.

### Syntax map for a Python person {#rust-syntax-map}

| Python | Rust | Read it as |
|---|---|---|
| `x = 1` | `let x = 1;` | Immutable by default. `let mut x = 1;` can change. `let x = x + 1;` makes a new `x` (shadowing). |
| `def f(a: int) -> int:` | `fn f(a: i64) -> i64 { a + 1 }` | The last expression **without** `;` is the return value. |
| `None` | `Option<T>`: `Some(v)` or `None` | There is no null. You must handle `None`. |
| exceptions | `Result<T, E>`: `Ok(v)` or `Err(e)` | `?` returns the error to the caller early. `panic!` is for bugs. |
| `class` | `struct` + `impl` block | Data and methods are declared separately. |
| protocol / ABC | `trait` + `impl Trait for Type` | Explicit, unlike Go. `#[derive(Debug, Clone)]` generates common ones. |
| `str` | `String` (owned) and `&str` (borrowed view) | Most function parameters take `&str`. |
| `list` | `Vec<T>`, `vec![1, 2]`, slice `&[T]` | `&[T]` is a read-only view of a vector. |
| `dict` | `HashMap<K, V>`; `m.get(&k)` gives `Option<&V>` | No `KeyError`; you get `None`. |
| `match` (3.10+) | `match` | Must cover every case, or it does not compile. |
| `for x in xs:` | `for x in &xs` or `for x in xs` | `&xs` borrows. Plain `xs` consumes the vector. |
| `lambda x: x + 1` | `\|x\| x + 1` | A **closure**. `move \|\|` takes ownership of what it uses. |
| comprehension | `xs.iter().map(...).filter(...).collect::<Vec<_>>()` | Lazy until `collect`. |
| `copy.deepcopy(x)` | `x.clone()` | Explicit copy. |
| — | `&x`, `&mut x`, `*x` | Borrow, borrow to change, follow the reference. |
| — | `'a` in a signature | A **lifetime**: "the result borrows from this argument". |
| — | `println!`, `vec!`, `format!` | A trailing `!` means a macro. |
| — | `unsafe { ... }` | The compiler's memory checks are off inside. Always a review flag. |

### Ownership and borrowing in one paragraph {#ownership}

Each value in Rust has one owner at a time, and the value is dropped when its owner goes out of scope ^[confirmed](https://doc.rust-lang.org/book/ch04-01-what-is-ownership.html "2026-10-20"). Passing a `String` or a `Vec` by value, or assigning it to another variable, **moves** it. The old name is then dead, and using it is error E0382. Small plain values such as integers are `Copy`, so they are copied instead. To use a value without taking it, you **borrow** it: `&x` is a shared, read-only reference and `&mut x` is an exclusive one. At any time you can have either one mutable reference or any number of shared ones, and a reference must always be valid ^[confirmed](https://doc.rust-lang.org/book/ch04-02-references-and-borrowing.html "2026-10-20"). That second rule is why `let first = &v[0]; v.push(4);` fails with E0502: `push` may move the vector's buffer and leave `first` pointing at freed memory. The same code in C++ compiles without a warning and is caught only at run time by AddressSanitizer (real output below). When an agent's Rust patch suddenly adds many `.clone()` calls, it often fought the borrow checker instead of fixing the design ^[inference](- "2026-10-20"). Check what each copy costs and whether it changes behavior.

Real compiler output (rustc 1.97.1, trimmed):

```rust
fn total_len(words: Vec<String>) -> usize {
    words.iter().map(|w| w.len()).sum()
}

fn main() {
    let words = vec![String::from("go"), String::from("rust")];
    let n = total_len(words);
    println!("{} words, {} bytes", words.len(), n);
}
```

```text
error[E0382]: borrow of moved value: `words`
 --> move.rs:8:36
  |
6 |     let words = vec![String::from("go"), String::from("rust")];
  |         ----- move occurs because `words` has type `Vec<String>`, which does not implement the `Copy` trait
7 |     let n = total_len(words);
  |                       ----- value moved here
8 |     println!("{} words, {} bytes", words.len(), n);
  |                                    ^^^^^ value borrowed here after move
  |
note: consider changing this parameter type in function `total_len` to borrow instead if owning the value isn't necessary
...
help: consider cloning the value if the performance cost is acceptable
  |
7 |     let n = total_len(words.clone());
  |                            ++++++++
```

The compiler suggests two fixes: borrow (change the parameter type), or `words.clone()`. Take the borrow: change the parameter to `words: &[String]` and call `total_len(&words)`.

```rust
fn main() {
    let mut scores = vec![10, 20, 30];
    let first = &scores[0];
    scores.push(40);
    println!("first = {first}");
}
```

```text
error[E0502]: cannot borrow `scores` as mutable because it is also borrowed as immutable
 --> borrow.rs:4:5
  |
3 |     let first = &scores[0];
  |                  ------ immutable borrow occurs here
4 |     scores.push(40);
  |     ^^^^^^^^^^^^^^^ mutable borrow occurs here
5 |     println!("first = {first}");
  |                        ----- immutable borrow later used here
```

The same mistake in C++, which you know well. It compiles with `-Wall -Wextra` and no warning, prints garbage, and only AddressSanitizer catches it (Apple clang 21, trimmed):

```cpp
std::vector<int> scores = {10, 20, 30};
int& first = scores[0];
scores.push_back(40);          // may reallocate: `first` now dangles
std::printf("first = %d\n", first);
```

```text
$ ./dangle_plain
first = 2
$ ./dangle_asan
==8718==ERROR: AddressSanitizer: heap-use-after-free on address 0x6020000000b0 ...
READ of size 4 at 0x6020000000b0 thread T0
    #0 0x00010290cb68 in main dangle.cpp:8
...
freed by thread T0 here:
    ...
    #8 0x00010290cfc4 in std::__1::vector<int, std::__1::allocator<int>>::push_back[abi:nqe210106](int&&) vector.h:457
    #9 0x00010290cb08 in main dangle.cpp:7
```

Rust moves this bug from run time to compile time. That is the whole point of the borrow checker. See [[debug]] for sanitizers ([[M9]]).

### Error handling in Rust {#rust-errors}

A function that can fail returns `Result<T, E>`. The `?` operator unwraps an `Ok`, or returns the `Err` from the whole function, converting the error type through `From` ^[confirmed](https://doc.rust-lang.org/book/ch09-02-recoverable-errors-with-result.html "2026-10-20"). `?` works only inside a function that returns a compatible `Result` or `Option`. Real output:

```rust
use std::fs;
use std::num::ParseIntError;

fn parse_port(s: &str) -> Result<u16, ParseIntError> {
    let n: u16 = s.trim().parse()?; // on Err, return it to the caller now
    Ok(n)
}

fn read_port(path: &str) -> Result<u16, String> {
    let text = fs::read_to_string(path).map_err(|e| format!("read {path}: {e}"))?;
    parse_port(&text).map_err(|e| format!("parse {path}: {e}"))
}

fn main() {
    for s in ["9020", "90x", "70000"] {
        match parse_port(s) {
            Ok(p) => println!("{s:>6} -> Ok({p})"),
            Err(e) => println!("{s:>6} -> Err({e})"),
        }
    }
    println!("{:?}", read_port("/no/such/file"));
    let names = vec!["ana", "bo"];
    println!("{:?} {:?}", names.get(1), names.get(5)); // Option, no panic
    let port: u16 = "90x".parse().expect("port must be a number");
    println!("unreachable {port}");
}
```

```text
  9020 -> Ok(9020)
   90x -> Err(invalid digit found in string)
 70000 -> Err(number too large to fit in target type)
Err("read /no/such/file: No such file or directory (os error 2)")
Some("bo") None

thread 'main' (96320018) panicked at errs.rs:24:35:
port must be a number: ParseIntError { kind: InvalidDigit }
note: run with `RUST_BACKTRACE=1` environment variable to display a backtrace
exit=101
```

Note `70000`: the type `u16` holds at most 65535, so the parser refuses it. And note the last line: `.expect()` turned a recoverable error into a crash with exit code 101.

Integer overflow behaves differently by build mode. The same `n * (n - 1) / 2` with `n = 200000` in `i32`, real output:

```text
$ ./ovf_debug 200000      # rustc, debug build
thread 'main' (96602046) panicked at ovf.rs:2:5:
attempt to multiply with overflow
exit=101
$ ./ovf_release 200000    # rustc -O
672547168
exit=0
```

The debug build panics. The optimized build wraps silently to the same wrong number that C++ printed at `-O2` ([C++ section](#silent-bugs)). A release profile can also set `overflow-checks`; ripgrep's `release-lto` profile sets it to `false`.

**Testing in Rust.** Unit tests sit in a `#[cfg(test)] mod tests` block in the same file ^[confirmed](https://doc.rust-lang.org/book/ch11-03-test-organization.html "2026-10-20"); integration tests sit in `tests/` ^[confirmed](https://doc.rust-lang.org/cargo/guide/project-layout.html "2026-10-20"). `cargo test inside` runs tests whose name contains `inside`. Real output:

```text
running 1 test
test tests::inside ... ok
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 1 filtered out; finished in 0.00s
```

`cargo test -- --exact tests::inside` matches the full name only. `cargo test -- --no-capture` shows `println!` output from passing tests. Older docs spell it `--nocapture`; both worked on cargo 1.97.1.

:::drill id="rust-fix-three" title="Fix three Rust compile errors" time="15 min"
Check for Rust with `rustc --version`. If it is missing, install it yourself from [rustup.rs](https://rustup.rs/), or do the drill on paper. Save this as `fix3.rs` and compile it with `rustc --edition 2021 fix3.rs`. rustc shows errors in stages: fix the first, compile again.

```rust
use std::collections::HashMap;

fn count_words(text: &str) -> HashMap<String, usize> {
    let mut counts = HashMap::new();
    for w in text.split_whitespace() {
        *counts.entry(w.to_lowercase()).or_insert(0) += 1;
    }
    counts
}

fn main() {
    let text = String::from("Go go Rust");
    let counts = count_words(&text);
    let total = 0;
    for (_word, n) in &counts {
        total += n;
    }
    let owned = text;
    println!("{text} has {total} words, {} distinct", counts.len());
    let port: u16 = "9020".parse()?;
    println!("{owned} {port}");
}
```

Rules: no `.clone()`, no `.unwrap()`, and do not delete any `println!`.

**Done when:** it prints `Go go Rust has 3 words, 2 distinct` and then `Go go Rust 9020`, and you can name each error code and say why it happened.

:::reveal title="Show the errors and a fix"
Real errors, rustc 1.97.1. First round:

```text
error[E0277]: the `?` operator can only be used in a function that returns `Result` or `Option` (or another type that implements `FromResidual`)
  --> fix3.rs:20:35
```

Second round, after `main` returns a `Result`:

```text
error[E0596]: cannot borrow `total` as mutable, as it is not declared as mutable
  --> fix3_step2.rs:16:9
error[E0382]: borrow of moved value: `text`
  --> fix3_step2.rs:19:16
```

Fixes: `fn main() -> Result<(), Box<dyn std::error::Error>>` with `Ok(())` at the end (E0277); `let mut total = 0;` (E0596); move `let owned = text;` below the `println!` that still uses `text` (E0382). The fixed program printed both lines and exited 0.
:::
:::

## Error handling across stacks {#error-patterns}

Every stack has its own way to lose an error silently ([[M4]]). When you review an agent's diff in an unfamiliar stack, grep for these first ^[inference](- "2026-10-20").

| Stack | How errors travel | How they get lost | Grep the diff for |
|---|---|---|---|
| Python | exceptions up the stack | `except: pass`; `except Exception` around too much code | `except:`, `except Exception`, `pass`, `# noqa` |
| TypeScript | `throw`; rejected Promises | empty `catch {}`; a Promise nobody awaits | `catch {`, `@ts-ignore`, `@ts-nocheck`, `as any` |
| Go | `error` as the last return value | `x, _ := f()`; a bare `f()`; `%v` instead of `%w` | `, _ :=`, `_ = `, `panic(`, `log.Fatal`, `//nolint` |
| Rust | `Result` with `?` | `let _ = f();` on a `Result`; `.ok()`; `unwrap_or_default()` hiding a failure | `.unwrap()`, `.expect(`, `let _ =`, `unsafe`, `#[allow(` |
| C++ | exceptions or return codes | ignored return codes; `catch (...) {}` | `catch (...)`, `(void)`, `-Wno-` in build files |

## Grade in another stack {#grade-stack}

Polaris engineers build tasks, not only solve them. So you must also write a hidden grader in a stack you do not know. DeepSWE's verifiers test observable behavior through public APIs, not private helpers, and accept any implementation with that behavior ^[confirmed](https://deepswe.datacurve.ai/blog/deepswe "2026-10-20"). Each stack has its own way to enforce that rule. Without it, a correct solution that renames a helper fails your grader. That is a **false reject**: the grader fails a correct solution. Refactor-equivalent solutions must pass ([[grader-validity#refactor-variants|refactor-equivalent variants]]).

| Stack | Hidden tests that see only the public API | Machine-readable result | Pin, and no cache |
|---|---|---|---|
| Go | An external test package. A `_test.go` file that says `package foo_test` is compiled as a separate package ^[confirmed](https://pkg.go.dev/cmd/go "2026-10-20"), so it can use only exported (capitalized) names. | `go test -json -count=1 ./...` prints JSON for automated processing ^[confirmed](https://pkg.go.dev/cmd/go "2026-10-20"). Not run here (no Go toolchain). | The `go` line is only a minimum, and the `toolchain` line is only a suggestion ^[confirmed](https://go.dev/doc/toolchain "2026-10-20"). So pin the Go image tag in the Dockerfile. `-count=1` turns off the test cache. |
| TypeScript on Node 22 | Import from the package's own name, for example `from 'togglebox'`. Node resolves it through `exports`, and any other subpath throws `ERR_PACKAGE_PATH_NOT_EXPORTED` ^[confirmed](https://nodejs.org/docs/latest-v22.x/api/packages.html "2026-10-20"). | `node --test --test-reporter=junit` (or `tap`), plus the exit code: 1 on failure. | npm treats `engines` as advisory unless `engine-strict` is set ^[confirmed](https://docs.npmjs.com/cli/v11/configuring-npm/package-json "2026-10-20"). So pin the Node image tag. |
| Rust | Integration tests in `tests/` can call only the crate's public API ^[confirmed](https://doc.rust-lang.org/book/ch11-03-test-organization.html "2026-10-20"). | Stable `cargo test` has no JSON test output. Use the exit code (101 on failure) and the `test result:` line. | `rust-toolchain.toml` pins the toolchain ^[confirmed](https://rust-lang.github.io/rustup/overrides.html "2026-10-20"). `Cargo.lock` pins the dependencies. |

Real output (Node v22.21.1 in Lab H; cargo 1.97.1 on a small crate; trimmed):

```text
$ node --test --test-reporter=junit | head -3
<?xml version="1.0" encoding="utf-8"?>
<testsuites>
	<testcase name="eq and neq compare scalars strictly" time="0.000418" classname="test"/>
$ node --test --test-reporter=tap hidden/deep.test.ts     # imports 'togglebox/src/store.ts'
# Error [ERR_PACKAGE_PATH_NOT_EXPORTED]: Package subpath './src/store.ts' is not defined by "exports" in .../package.json imported from .../hidden/deep.test.ts
$ cargo test -- --format json
error: The "json" format is only accepted on the nightly compiler with -Z unstable-options
```

Two rules for every stack. Test behavior the spec names, through the public entry point only. And read the result from the machine format or the exit code, never from a model's summary ([[M6]]).

:::drill id="hidden-test-lab-h" title="Hidden test for Lab H" time="20 min"
Do this in your Lab H practice copy, after the sprint.

1. Write one acceptance test for `ISSUE.md` in `test/public-api.test.ts`. Import only from `'togglebox'`, never from `src/`.
2. Show that it fails on BASE and passes on your fix. Use the first block below.
3. Run `git apply -R fix.patch` again. Write one wrong fix by hand that passes `npm test` but breaks a rule in `ISSUE.md`. Run your test on it: you want `# fail 1` or more.
4. While the wrong fix is in place, run the Lab H grader on this copy (the command in the [Lab H drill](#drill-lab-h-sprint)). Write down whether the hidden tests rejected it, as a count with its frame: "1 hand-picked wrong solution: rejected". It is not a rate ([[grader-validity#frame-hand-picked|hand-picked frame]]).
5. Restore your fix with the second block below.

```bash
# step 2
set -o pipefail
BASE=$(cat base.txt)
T=test/public-api.test.ts
git add -N src                              # include new files under src/ in the diff
git diff "$BASE" -- src > fix.patch         # your fix
git apply -R fix.patch && node --test --test-reporter=tap "$T" | grep -E '^# fail'   # BASE: want fail 1 or more
git apply fix.patch && node --test --test-reporter=tap "$T" | grep -E '^# fail'      # your fix: want fail 0
```

```bash
# step 5 (same shell, so BASE is still set)
git add -N src
git diff "$BASE" -- src > wrong.patch && git apply -R wrong.patch && git apply fix.patch
```

**Done when:** your test is red on BASE, green on your fix and red on your wrong fix, and you wrote down the grader's verdict on the wrong fix as a count.
:::

## Problem solving: C++ as a supporting skill {#cpp-track}

This track is support, not the main event. It serves three things:

- **The posting.** Competitive programming or math olympiads are a preferred qualification ^[confirmed](https://www.google.com/about/careers/applications/jobs/results/114077679900074694-research-engineer-polaris-deepmind "2026-10-19"). Two hours will not make you a competitor. They keep your hands warm for no-AI rounds.
- **No-AI rounds.** GDM's default is no AI tools in live interviews unless told otherwise ^[confirmed](https://storage.googleapis.com/deepmind-media/DeepMind.com/Assets/Docs/interviewing-at-google-deepmind.pdf "2026-10-20"). Older GDM Research Engineer loops reportedly had coding screens where the code had to run ^[reported](https://www.teamblind.com/post/deepmind-research-engineer-interview-process-wp1gjgyb "2026-10-20").
- **Eval work itself.** LiveCodeBench Pro builds an eval from Codeforces, ICPC and IOI problems, labeled by olympiad medalists. At release its best model scored 53% pass@1 on medium problems and 0% on hard ones without tools ^[confirmed](https://arxiv.org/abs/2506.11928 "2026-10-20"). And the core contest habit, **stress testing**, is the same idea as checking a grader against an independent oracle in [[grader-validity]] ^[inference](- "2026-10-20").

### Your template file {#template}

Apple clang on macOS has no `<bits/stdc++.h>`, which many contest templates use. Real output, Apple clang 21:

```text
bits.cpp:1:10: fatal error: 'bits/stdc++.h' file not found
    1 | #include <bits/stdc++.h>
      |          ^~~~~~~~~~~~~~~
```

So include what you use. Save this as `template.cpp`:

```cpp
// template.cpp: contest starter. C++20. Builds with Apple clang and GNU g++.
// Apple clang has no <bits/stdc++.h>, so include what you use.
#include <algorithm>
#include <array>
#include <cassert>
#include <cstdint>
#include <iostream>
#include <map>
#include <numeric>
#include <queue>
#include <set>
#include <string>
#include <utility>
#include <vector>
using namespace std;
using ll = long long;  // default to 64-bit: n * value often exceeds 2^31

#ifdef LOCAL
#define dbg(x) (cerr << "[" << __LINE__ << "] " << #x << " = " << (x) << '\n')
#else
#define dbg(x) ((void)0)
#endif

void solve() {
    int n;
    cin >> n;
    vector<ll> a(n);
    for (auto& x : a) cin >> x;
    ll total = accumulate(a.begin(), a.end(), 0LL);  // 0LL, not 0: else int sum
    dbg(total);
    cout << total << '\n';
}

int main() {
    ios::sync_with_stdio(false);  // faster cin/cout with GNU libstdc++; little effect on macOS libc++. Never mix with scanf/printf.
    cin.tie(nullptr);
    int t = 1;
    // cin >> t;  // uncomment when the input starts with the number of test cases
    while (t--) solve();
}
```

Two compile commands. Put them in your `~/.zshrc` yourself if you want them every day:

```zsh
# debug build: sanitizers + libc++ bounds checks + dbg() output
cpd() { clang++ -std=c++20 -O0 -g -Wall -Wextra -Wshadow -DLOCAL -fsanitize=address,undefined -fno-sanitize-recover=all -D_LIBCPP_HARDENING_MODE=_LIBCPP_HARDENING_MODE_DEBUG "$1.cpp" -o "$1"; }
# judge-like build: optimized, no checks
cpo() { clang++ -std=c++20 -O2 -Wall "$1.cpp" -o "$1"; }
```

Usage: `cpd a && ./a < in.txt`. The `_LIBCPP_HARDENING_MODE` macro turns on libc++'s bounds checks; its debug mode is meant for tests and local development, not production ^[confirmed](https://libcxx.llvm.org/Hardening.html "2026-10-20"). Apple clang has no LeakSanitizer, so leave `leak` out. Real output with an input whose sum does not fit in 32 bits:

```text
$ printf '3\n2000000000 2000000000 5\n' | ./t_dbg
[30] total = 4000000005
4000000005
```

### Three silent bugs, with real output {#silent-bugs}

These are the C++ mistakes that cost contest points, and agents make them too ([[M9]]).

**1. Signed overflow.** `int pairs = n * (n - 1) / 2;` with `n = 200000`:

```text
$ ./ovf          # -O2, no checks
672547168
$ ./ovf_u        # -fsanitize=undefined
ovf.cpp:4:19: runtime error: signed integer overflow: 200000 * 199999 cannot be represented in type 'int'
SUMMARY: UndefinedBehaviorSanitizer: undefined-behavior ovf.cpp:4:19
```

**2. `accumulate` with an `int` start value.** Change `0LL` to `0` in the template. The sum is then kept in an `int`. No warning with `-Wall -Wextra`, and nothing in `cpd`'s `-fsanitize=address,undefined` fires:

```text
[30] total = -294967291
-294967291
```

It is not undefined behavior, so the sanitizers in `cpd` stay silent. Clang's separate implicit-conversion sanitizer does flag it. Here `acc.cpp` sums `2000000000 2000000000 5` with `accumulate(..., 0)` (Apple clang 21, paths shortened):

```text
$ clang++ -std=c++20 -g -fsanitize=implicit-conversion acc.cpp -o acc && ./acc
.../c++/v1/__numeric/accumulate.h:30:14: runtime error: implicit conversion from type 'long long' of value 4000000000 (64-bit, signed) to type 'int' changed the value to -294967296 (32-bit, signed)
SUMMARY: UndefinedBehaviorSanitizer: undefined-behavior .../c++/v1/__numeric/accumulate.h:30:14
-294967291
```

It is not in `cpd`, because it also flags conversions you meant, such as a hash that wraps on purpose ^[inference](- "2026-10-20"). Without that flag, only a test with big values catches this bug.

**3. Out of bounds.** `std::vector<int> a(3, 7); std::cout << a[3];` (paths shortened):

```text
--- plain -O2
47287008
--- -D_LIBCPP_HARDENING_MODE=_LIBCPP_HARDENING_MODE_DEBUG
.../c++/v1/__vector/vector.h:406: libc++ Hardening assertion __n < size() failed: vector[] index out of bounds
--- -fsanitize=address,undefined
==13074==ERROR: AddressSanitizer: heap-buffer-overflow on address 0x6020000000bc ...
    #0 0x000102d44ac4 in main oob.cpp:6
```

The plain build printed garbage and exited 0. That is why you practice with `cpd` and submit with `cpo`.

### Stress testing {#stress-test}

A **stress test** runs your fast solution and an obviously correct slow one (**brute force**) on many small random inputs, and stops at the first difference. Small inputs give small counterexamples you can debug by hand. It is differential testing, the same idea as Chronos's oracle in [[capstone]].

The problem: the largest sum of a non-empty contiguous subarray. `fast.cpp` has a planted bug.

```cpp
// fast.cpp: maximum sum of a non-empty contiguous subarray. O(n). Has a planted bug.
#include <algorithm>
#include <iostream>
#include <vector>
using namespace std;
using ll = long long;

int main() {
    int n;
    cin >> n;
    vector<ll> a(n);
    for (auto& x : a) cin >> x;
    ll best = 0, cur = 0;  // bug: best must start at a[0], not 0
    for (ll x : a) {
        cur = max(x, cur + x);
        best = max(best, cur);
    }
    cout << best << '\n';
}
```

```cpp
// brute.cpp: same problem, obviously correct, O(n^2). Only for small n.
#include <iostream>
#include <vector>
using namespace std;
using ll = long long;

int main() {
    int n;
    cin >> n;
    vector<ll> a(n);
    for (auto& x : a) cin >> x;
    ll best = a[0];
    for (int i = 0; i < n; i++) {
        ll sum = 0;
        for (int j = i; j < n; j++) {
            sum += a[j];
            best = max(best, sum);
        }
    }
    cout << best << '\n';
}
```

```cpp
// gen.cpp: random small input from a seed: n in [1, 6], values in [-10, 10].
#include <cstdlib>
#include <iostream>
#include <random>
using namespace std;

int main(int argc, char** argv) {
    mt19937 rng(atoi(argv[1]));
    int n = uniform_int_distribution<int>(1, 6)(rng);
    uniform_int_distribution<int> val(-10, 10);
    cout << n << '\n';
    for (int i = 0; i < n; i++) cout << val(rng) << (i + 1 < n ? ' ' : '\n');
}
```

```bash
#!/usr/bin/env bash
# stress.sh: compare fast against brute on random inputs until they disagree.
set -euo pipefail
for f in fast brute gen; do clang++ -std=c++20 -O2 -o "$f" "$f.cpp"; done
for i in $(seq 1 1000); do
  ./gen "$i" > in.txt
  ./fast < in.txt > fast.out
  ./brute < in.txt > brute.out
  if ! cmp -s fast.out brute.out; then
    echo "MISMATCH on seed $i"
    cat in.txt
    echo "fast=$(cat fast.out) brute=$(cat brute.out)"
    exit 1
  fi
done
echo "1000 random tests agree"
```

Real output (Apple clang 21):

```text
$ ./stress.sh
MISMATCH on seed 3
3
-7 -2 -10
fast=0 brute=-2
```

All values are negative, so the true answer is `-2`, but `best` started at `0`. After the fix (`ll best = a[0], cur = 0;`):

```text
$ time ./stress.sh
1000 random tests agree
./stress.sh  5.10s user 7.66s system 49% cpu 25.743 total
```

Your seed may differ on Linux. The C++ standard fixes the raw output of `mt19937`: the 10000th value of a default-constructed one must be 4123659995 ^[confirmed](https://eel.is/c++draft/rand.predef "2026-10-20"), and our Mac printed exactly that. But it does not fix how `uniform_int_distribution` maps that output, so another standard library may build a different input from the same seed ^[inference](- "2026-10-20"). The same care applies to seeded graders: pin what "the same seed" means.

### Practice with time limits {#time-limits}

A conservative planning number: a judge does about 10^8 simple operations per second, and maybe closer to 5·10^8 with good constants ^[confirmed](https://usaco.guide/bronze/time-comp "2026-10-20"). The USACO Guide's conservative bounds, for a typical limit:

| Input size n | Complexity that fits |
|---|---|
| ≤ 20 | O(2^n · n) |
| ≤ 400 | O(n^3) |
| ≤ 7,500 | O(n^2) |
| ≤ 5·10^5 | O(n log n) |
| ≤ 5·10^6 | O(n) |

Say the complexity out loud before you code. Then measure. Real numbers on an Apple Silicon Mac, n = 2·10^5:

```text
$ time ./fast < big.txt
./fast < big.txt  0.22s user 0.00s system 94% cpu 0.241 total
$ time ./brute < big.txt
./brute < big.txt  10.86s user 0.05s system 53% cpu 20.328 total
```

The O(n^2) brute force did about 2·10^10 additions in 10.9 s of CPU time, almost 2·10^9 a second. That is faster than the planning number. Each iteration is about six simple scalar instructions, and an Apple Silicon core runs several per clock cycle ^[inference](- "2026-10-20"). Clang did not vectorize it: `-Rpass-missed=loop-vectorize` prints `brute.cpp:15:9: remark: loop not vectorized`. Real judges and real loops are slower. Plan with 10^8.

**Enforce a limit locally.** `ulimit -t` caps CPU seconds for a subshell. Real output:

```text
$ ( ulimit -t 2; ./brute < big.txt ); echo "exit=$?"
exit=152
```

152 is 128 + 24, and signal 24 is `XCPU`: CPU time limit exceeded. Treat it as "Time Limit Exceeded".

**Mac input caveat.** We measured reading 2·10^6 numbers on Apple clang 21: `cin` took 2.31 s of CPU without `sync_with_stdio(false)` and 2.23 s with it; `scanf` took 0.13 s. These are our own runs (see Sources). That is libc++ on macOS. Judges that use GNU's library may behave differently. So do not trust Mac timings for input-heavy problems. Use `scanf`, or time on Linux.

**The timed protocol** (no AI, every time):

1. **5 min:** read, work the sample by hand, note the limits.
2. **5 min:** say the idea and its complexity out loud. Check it against the table.
3. **Code** with `template.cpp`; build with `cpd`.
4. **Test** the samples plus two edge cases (smallest input, largest values). Stress-test if the problem is tricky.
5. **Submit** with `cpo`-style flags. Log: problem, minutes, verdict, mistake type.
6. **Stuck after 30 minutes total:** read one hint, then solve without looking again.

### Which topics {#topics}

Pick by value for interviews and eval work. The CSES Problem Set has 400 problems grouped by topic ^[confirmed](https://cses.fi/problemset/ "2026-10-20"); the USACO Guide explains each topic ^[confirmed](https://usaco.guide/ "2026-10-20").

| Priority | Topics | CSES section |
|---|---|---|
| 1 | Complexity, sorting, prefix sums, two pointers | Introductory Problems |
| 1 | Binary search (also on the answer), sets and maps, greedy | Sorting and Searching |
| 1 | BFS and DFS on grids and graphs, union-find | Graph Algorithms |
| 1 | Dynamic programming: 1D, 2D, knapsack | Dynamic Programming |
| 2 | Dijkstra, topological sort, trees | Graph Algorithms, Tree Algorithms |
| 2 | Range queries: prefix sums, Fenwick tree | Range Queries |
| 3 | Strings (hashing, KMP), math (modular arithmetic) | String Algorithms, Mathematics |

These topics show up in eval tasks too. A point-in-time "as-of" join is a sort plus a binary search. A purged walk-forward split is interval logic. Both are in Chronos ([[capstone]]) ^[inference](- "2026-10-20").

### The 2 hours in the sprint {#sprint-2h}

This matches the [[tracker]] sprint blocks:

| Block | Time | Do |
|---|---|---|
| Oct 20–23 | 30 min | Set up `template.cpp`, `cpd` and `cpo`. Two CSES Introductory problems, timed, no AI. |
| Oct 24–27 | 60 min | The stress-test drill (below). Two Sorting and Searching problems, timed. |
| Oct 28–29 | 30 min | One timed problem, no AI. Say the complexity out loud before you code. |

If you fall behind, this track is cut first. That is the plan's cut order.

### Six weeks after you apply {#six-weeks}

The weeks start on Tue Nov 3. The budget is the 15 minutes a day from the [[tracker]] (about 1.75 hours a week) ^[inference](- "2026-10-20"). One problem may take two days. That is fine; log it.

| Week | Topics | Problems (no AI) | Also |
|---|---|---|---|
| 1 | Complexity, sorting, prefix sums, two pointers | 3–4 from Introductory Problems | One stress test |
| 2 | Binary search, sets and maps, greedy | 3–4 from Sorting and Searching | Optional: AtCoder Beginner Contest 484 (Sat Nov 14) |
| 3 | BFS and DFS, grids, union-find | 3–4 from Graph Algorithms | One stress test |
| 4 | Dynamic programming | 3–4 from Dynamic Programming | [[interview#mock-no-ai-algo\|Mock 3]]'s protocol on a problem you have not seen, for example an unsolved CSES problem from this week's topic. Score it with the [[interview#rubric\|coding rubric]]. |
| 5 | Dijkstra, topological sort, trees | 3–4 from Graph and Tree Algorithms | Explain each solution aloud in 60 s |
| 6 | Range queries; redo three earlier misses | 3–4 mixed | Mock 3's protocol on another unseen problem. Score it with the coding rubric. |

Do not repeat Mock 3's own as-of problem. A repeat of the same problem measures memory, not skill ^[inference](- "2026-10-20").

The upcoming AtCoder Beginner Contests are listed on Saturdays at 21:00 JST (12:00 UTC), 100 minutes each. ABC 483 is on Sat Nov 7 (week 1) and ABC 484 on Sat Nov 14 (week 2) ^[confirmed](https://atcoder.jp/contests/ "2026-10-20"). A contest takes longer than 15 minutes, so count it in the 4.5 hours of queue time in the [[tracker#after-applying|tracker]] week, or skip it.

**Done when** (after six weeks): about 20 problems solved without AI, each logged with minutes and verdict; one stress test per week; and your coding-rubric score on an unseen problem in week 6 is higher than in week 4.

:::drill id="stress-test" title="Catch a planted bug with a stress test" time="25 min"
Without AI and without looking at this page's code, write `brute.cpp`, `gen.cpp` and `stress.sh` for the maximum-subarray problem. Then copy the buggy `fast.cpp` from [the stress test section](#stress-test) and run your script.

**Done when:** your script prints a mismatch on an input with at most 6 numbers; you explain the bug in one sentence; and after your fix, 1000 random tests agree.
:::

:::drill id="timed-set" title="Three timed problems, no AI" time="45 min"
From the CSES Introductory Problems: "Missing Number", "Repetitions" and "Increasing Array". Use the timed protocol above and `template.cpp`. Before you code each one, say its complexity out loud and check the size of its answer: does it fit in an `int`?

If you want an online verdict, create a CSES account yourself. Otherwise test with the samples and a brute force.

**Done when:** all three pass within 45 minutes total, and your log has the minutes and any mistake type for each.
:::

## Optional: ML basics {#ml-basics}

Reported GDM Research Engineer loops have included ML fundamentals and ML design rounds ^[reported](https://www.teamblind.com/browse/Deepmind-Interview-73684 "2026-10-20"). Polaris may weigh them less than other teams ^[inference](- "2026-10-20"). Do this only after the core chapters. Budget about 6 hours in total.

| Read | Why | Time |
|---|---|---|
| [Google's Machine Learning Crash Course](https://developers.google.com/machine-learning/crash-course): the Classification module, 70 min ^[confirmed](https://developers.google.com/machine-learning/crash-course/classification "2026-10-20"), and the Datasets, generalization, and overfitting module, 105 min ^[confirmed](https://developers.google.com/machine-learning/crash-course/overfitting "2026-10-20"). Times are Google's estimates. | Vocabulary: classification metrics, generalization, overfitting | about 3 h |
| [Karpathy, "A Recipe for Training Neural Networks"](https://karpathy.github.io/2019/04/25/recipe/) (2019) ^[confirmed](https://karpathy.github.io/2019/04/25/recipe/ "2026-10-20") | How to debug training: dumb baselines first, then overfit a single small batch | 30 min |
| [Karpathy, "Neural Networks: Zero to Hero"](https://karpathy.ai/zero-to-hero.html), lecture 1, micrograd (2h25m) ^[confirmed](https://karpathy.ai/zero-to-hero.html "2026-10-20") | Backpropagation by hand, in Python | 2.5 h |
| [Goodfellow, Bengio, Courville, *Deep Learning*](https://www.deeplearningbook.org/), ch. 3 and 5, free online ^[confirmed](https://www.deeplearningbook.org/ "2026-10-20") | Probability and ML basics as a reference | as needed |
| [Dive into Deep Learning](https://d2l.ai/) (v1.0.3) ^[confirmed](https://d2l.ai/ "2026-10-20") | Runnable code when a concept is unclear | as needed |

Topics that reported GDM loops touched, as a checklist. A 2021 candidate reported a Bayes urn problem and a question on why L1 gives sparsity ^[reported](https://www.teamblind.com/post/deepmind-research-engineer-interview-process-wp1gjgyb "2026-10-20"). A prep site lists a "model runs but does not learn" debugging notebook; it cites no source, so use it as a practice idea only ^[reported](https://www.sundeepteki.org/advice/the-ultimate-ai-research-engineer-interview-guide-cracking-openai-anthropic-google-deepmind-top-ai-labs "2026-10-20").

- [ ] Solve a two-urn Bayes' rule problem on paper.
- [ ] Explain why L1 regularization gives sparse weights and L2 does not, using the gradients.
- [ ] Compute precision, recall and F1 from a 2×2 confusion matrix.
- [ ] Say on which axis softmax runs for a batch of logits, and what cross-entropy measures.
- [ ] List three checks for a model that runs but does not learn: zeroed gradients, tensor shapes, and overfitting one small batch.

## Sources

- DeepSWE: task and language counts (113 tasks over 91 repos), verifier design, reference solution size ^[confirmed](https://deepswe.datacurve.ai/blog/deepswe "2026-10-20")
- The Polaris posting: realistic software-engineering tasks for Gemini; preferred qualifications ^[confirmed](https://www.google.com/about/careers/applications/jobs/results/114077679900074694-research-engineer-polaris-deepmind "2026-10-19")
- Aggregator copy of the posting: learning new languages and tools quickly ^[reported](https://www.globalsouthopportunities.com/2026/10/11/engineer/ "2026-10-20")
- Mechanize's interview process and traits (Mechanize, not Polaris) ^[confirmed](https://www.mechanize.work/how-our-interview-process-works "2026-10-20")
- Besiroglu's post recruiting for Polaris ^[reported](https://x.com/tamaybes/status/2105408224879116790 "2026-10-20")
- Gemini 4 Argon model card, DeepSWE v1.1 score ^[confirmed](https://deepmind.google/models/model-cards/gemini-4-argon/ "2026-10-20")
- Gemini 4 Argon launch post, C/C++ to Rust migration ^[confirmed](https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-4-argon/ "2026-10-20")
- Google DeepMind candidate guide, no-AI default ^[confirmed](https://storage.googleapis.com/deepmind-media/DeepMind.com/Assets/Docs/interviewing-at-google-deepmind.pdf "2026-10-20")
- GDM Research Engineer loop reports on Blind ^[reported](https://www.teamblind.com/post/deepmind-research-engineer-interview-process-wp1gjgyb "2026-10-20") and ^[reported](https://www.teamblind.com/browse/Deepmind-Interview-73684 "2026-10-20")
- Meta's AI-enabled coding round as candidates describe it (practice format only) ^[reported](https://www.hellointerview.com/blog/meta-ai-enabled-coding "2026-10-20")
- The SWE-Bench Illusion, memorization evidence ^[confirmed](https://arxiv.org/abs/2506.12286 "2026-10-20")
- Transluce, coding agent misalignment in real transcripts (LLM-judged) ^[confirmed](https://www.lesswrong.com/posts/smE9h9RnaK7FWKBZ2/measuring-coding-agent-misalignment-in-the-wild-1 "2026-10-20")
- LiveCodeBench Pro ^[confirmed](https://arxiv.org/abs/2506.11928 "2026-10-20")
- `golang/example` ragserver at commit 7f05d21 ^[confirmed](https://github.com/golang/example/tree/7f05d217867b2af52b0a28c6d1c91df97e1b5b39/ragserver/ragserver "2026-10-20")
- ripgrep `Cargo.toml` at commit 3fce3b5 ^[confirmed](https://github.com/BurntSushi/ripgrep/blob/3fce3b5bb0236da2df6d99672afb8a719642eca7/Cargo.toml "2026-10-20")
- The go command: test flags, caching, `-json`, `_test` packages, `internal`, `testdata`, `go generate` ^[confirmed](https://pkg.go.dev/cmd/go "2026-10-20")
- Go toolchains: the `go` and `toolchain` lines ^[confirmed](https://go.dev/doc/toolchain "2026-10-20")
- Go 1.22 routing enhancements ^[confirmed](https://go.dev/blog/routing-enhancements "2026-10-20")
- Go `encoding/json` key matching and `DisallowUnknownFields` ^[confirmed](https://pkg.go.dev/encoding/json "2026-10-20")
- Working with errors in Go 1.13 (`%w`, `errors.Is`, `errors.As`) ^[confirmed](https://go.dev/blog/go1.13-errors "2026-10-20")
- `net/http` `Request.Context` doc comment ^[confirmed](https://github.com/golang/go/blob/master/src/net/http/request.go "2026-10-20")
- The Rust Book: ownership ^[confirmed](https://doc.rust-lang.org/book/ch04-01-what-is-ownership.html "2026-10-20"), references and borrowing ^[confirmed](https://doc.rust-lang.org/book/ch04-02-references-and-borrowing.html "2026-10-20"), `Result` and `?` ^[confirmed](https://doc.rust-lang.org/book/ch09-02-recoverable-errors-with-result.html "2026-10-20"), test organization ^[confirmed](https://doc.rust-lang.org/book/ch11-03-test-organization.html "2026-10-20")
- Cargo: package layout ^[confirmed](https://doc.rust-lang.org/cargo/guide/project-layout.html "2026-10-20"), targets and auto-discovery ^[confirmed](https://doc.rust-lang.org/cargo/reference/cargo-targets.html "2026-10-20"), build scripts ^[confirmed](https://doc.rust-lang.org/cargo/reference/build-scripts.html "2026-10-20"), `cargo test` exit status ^[confirmed](https://doc.rust-lang.org/cargo/commands/cargo-test.html "2026-10-20")
- rustup overrides and `rust-toolchain.toml` ^[confirmed](https://rust-lang.github.io/rustup/overrides.html "2026-10-20")
- Node.js 22 TypeScript type stripping ^[confirmed](https://nodejs.org/docs/latest-v22.x/api/typescript.html "2026-10-20")
- Node.js test runner: reporters and exit code, v22 ^[confirmed](https://nodejs.org/docs/latest-v22.x/api/test.html "2026-10-20") and current, where spec became the default in v23.0.0 ^[confirmed](https://nodejs.org/api/test.html "2026-10-20")
- Node.js packages: `exports` and self-referencing a package by its name ^[confirmed](https://nodejs.org/docs/latest-v22.x/api/packages.html "2026-10-20")
- npm lifecycle scripts ^[confirmed](https://docs.npmjs.com/cli/v11/using-npm/scripts "2026-10-20"); `package.json` `engines` ^[confirmed](https://docs.npmjs.com/cli/v11/configuring-npm/package-json "2026-10-20")
- CMake `ctest` manual ^[confirmed](https://cmake.org/cmake/help/latest/manual/ctest.1.html "2026-10-20")
- pytest exit codes ^[confirmed](https://docs.pytest.org/en/stable/reference/exit-codes.html "2026-10-20")
- libc++ hardening modes ^[confirmed](https://libcxx.llvm.org/Hardening.html "2026-10-20")
- C++ draft standard, `mt19937` required value ^[confirmed](https://eel.is/c++draft/rand.predef "2026-10-20")
- USACO Guide, time complexity ^[confirmed](https://usaco.guide/bronze/time-comp "2026-10-20")
- CSES Problem Set ^[confirmed](https://cses.fi/problemset/ "2026-10-20")
- AtCoder contest schedule ^[confirmed](https://atcoder.jp/contests/ "2026-10-20")
- ML reading list pages, each checked on 2026-10-20 ^[confirmed](https://developers.google.com/machine-learning/crash-course "2026-10-20"); MLCC module estimates: Classification ^[confirmed](https://developers.google.com/machine-learning/crash-course/classification "2026-10-20") and overfitting ^[confirmed](https://developers.google.com/machine-learning/crash-course/overfitting "2026-10-20")
- Our own runs on 2026-10-20 (Node v22.21.1, rustc and cargo 1.97.1, Apple clang 21, CMake 4.4.2, Go Playground go1.27.3): every real output and measured time on this page, including the exit codes and the `cin`/`scanf` timings. They have no outside source; rerun them to check ^[inference](- "2026-10-20")

:::check
- From a cold start on a TypeScript, Go or Rust repo, write the test command, the one-test command and the entry point in 5 minutes, and prove each one by running it or with `rg`.
- Write a 5-line trace of one request with file:line, then confirm it with one stack print and delete the print.
- Explain Rust ownership and borrowing in under a minute, using the E0382 and E0502 examples, and say how C++ shows the same bug.
- Name three ways a Go or Rust diff can drop an error silently, and the grep that finds each.
- From memory, write a stress test that finds a planted bug in a C++ solution.
- Finish Lab H inside 90 minutes with every done-when item ticked.
:::
