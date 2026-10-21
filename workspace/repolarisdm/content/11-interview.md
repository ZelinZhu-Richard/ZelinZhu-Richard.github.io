---
title: Interview modes and mocks
short: Interview and mocks
summary: Know which interview facts are confirmed and which are guesses. Practice all three modes under a timer, score yourself with a labeled proxy rubric, and build STAR stories from audits of your own agent-built commits.
---

:::selfcheck
- State Google DeepMind's default rule on AI tools in interviews. Is it confirmed or reported? || Confirmed, from GDM's candidate guide. You may use AI to prepare. Unless you are told otherwise, do not use AI tools in live interviews or interview tasks.
- Say which AI-assisted format is Meta's, and what is reported about Google's pilot. || Meta (reported): 60 minutes, fix a bug → implement → optimize, with an AI chat panel. Google (reported): read, debug and optimize existing code with Gemini, for junior and mid-level roles on select US teams. No source names DeepMind.
- Read only the statement of the [as-of lookup](#asof-problem). Do not solve it: keep it fresh for Mock 3. State the cost of the brute force at n = q = 200,000 and say why it is too slow. || About n·q = 4·10^10 pair checks. The slow O(n·q) loop on this page took 1.04 s at n = q = 10,000. Both sizes grow 20 times, so the work grows 400 times: about 7 minutes against a 2-second target ^[inference](- "2026-10-20"). You need about O((n + q) log n).
- Answer "tell me about yourself" in under 90 seconds, with one number from a command you ran. || Background in 2 sentences, one real agent catch with a number, why Polaris in 2 sentences. See [your first two minutes](#pitch). If you have not recorded it yet, do not tick this.
- Tell a STAR story about one agent mistake you caught in your own code. Keep it under 2 minutes and include at least one number. || Situation, Task, Action, Result. The number can be the diff size, the test count before and after, or the minutes the bug took. If you have no real catch yet, do not tick this. Do the STAR drill below.
- Name four questions you will ask the recruiter before the skills stage. || Examples: the format of each round; whether AI is allowed and which tool; which languages; whether code must run; how long each round is; whether there is a take-home or a project talk.
:::

## Why Polaris cares

Polaris builds tasks that measure how well Gemini does software work. So the team needs people who can drive a coding agent *and* catch its mistakes. The posting asks for experience using AI coding agents ^[confirmed](https://www.google.com/about/careers/applications/jobs/results/114077679900074694-research-engineer-polaris-deepmind "2026-10-19"). But Google DeepMind's default rule bans AI tools in live interviews unless you are told otherwise ^[confirmed](https://storage.googleapis.com/deepmind-media/DeepMind.com/Assets/Docs/interviewing-at-google-deepmind.pdf "2026-10-20"). So you must be strong in both modes. This chapter trains signal 3 on the [[home|overview]] (strong unaided interviews) and turns signal 2 (catching real agent failures) into stories you can tell.

## Three modes: what we know and what we don't {#three-modes}

Our research found no first-hand Polaris interview report as of 2026-10-20 ^[inference](- "2026-10-20"). So keep three kinds of facts apart. Never mix them when you talk.

| Mode | What it looks like | Status | Practice it with |
|---|---|---|---|
| No AI | You code and talk alone. GDM's default for live interviews and interview tasks, unless told otherwise. | ^[confirmed](https://storage.googleapis.com/deepmind-media/DeepMind.com/Assets/Docs/interviewing-at-google-deepmind.pdf "2026-10-20") | Mock 3, Mock 4 |
| Google's AI-assisted pilot | A "code comprehension" round: read, debug and optimize an existing codebase with Gemini. Scored on prompting, output validation and debugging. Junior and mid-level roles, select US teams, from H2 2026. No source names DeepMind. | ^[reported](https://www.entrepreneur.com/business-news/google-is-testing-a-new-rule-transform-job-interviews "2026-10-20") | Mock 2 |
| Meta's AI-enabled round | 60 minutes in CoderPad: files, editor, AI chat. The AI can read files but answers only in chat, so you type all code. Phases: fix a bug → implement → optimize on bigger inputs. | ^[reported](https://www.hellointerview.com/blog/meta-ai-enabled-coding "2026-10-20") | Mock 1, as a practice format only |
| Mechanize's process | 30-minute call; 3-hour build with AI tools strongly encouraged; recorded 1-hour code review with system design; 1-hour final. This is Mechanize, not Polaris. | ^[confirmed](https://www.mechanize.work/how-our-interview-process-works "2026-10-20") | The proxy rubric, Mock 4 |

Why Mechanize appears here: Google made a talent and technology deal with Mechanize in September 2026 ^[reported](https://www.businessinsider.com/google-completes-deal-for-ai-agents-startup-mechanize-2026-9 "2026-10-20"). Tamay Besiroglu, a Mechanize co-founder now at GDM, posted that he recruits for Polaris "evals and environments" ^[reported](https://x.com/tamaybes/status/2105408224879116790 "2026-10-20"). That makes Mechanize's published traits a good proxy for what Polaris values ^[inference](- "2026-10-20"). It does **not** mean Polaris copies Mechanize's interview ^[inference](- "2026-10-20").

What is still unknown: which loop Polaris uses (Google's or GDM's), whether the Google pilot reaches DeepMind, and whether there is a take-home. You find out by asking the recruiter (see [questions](#recruiter)).

:::warn title="How to talk about formats"
In an interview, never say "Polaris uses Meta's format." Say what you know and how sure you are. Example: "I practiced in three modes, because GDM's guide says no AI by default, and I also wanted to be ready for an AI-assisted round."
:::

## The Google DeepMind process {#gdm-process}

These facts come from GDM's own candidate guide and careers page. Both were read on 2026-10-20 ^[confirmed](https://deepmind.google/careers/ "2026-10-20").

| Stage | What happens | Who you meet |
|---|---|---|
| Initial interviews | A 30-minute introductory call about your background and experience. The recruiter tells you about the role and asks why you applied. Prepare with [your first two minutes](#pitch). | Recruiter; sometimes also the hiring manager |
| Skills interviews | Two or three more calls that test the role's competencies. | Interviewers, possibly future peers |
| Final interviews | Core skills, framed around team goals, culture, mission and values. You get time to ask questions. | Team leads and leadership, including your likely manager |
| Decision and offer | The hiring team reviews you against its criteria. If you are the top candidate, your recruiter shares the news and walks you through the offer. | Recruiter |

More rules from the guide ^[confirmed](https://storage.googleapis.com/deepmind-media/DeepMind.com/Assets/Docs/interviewing-at-google-deepmind.pdf "2026-10-20"):

- The process takes 4–10 weeks, sometimes longer.
- Most interviews are virtual. You need a working mic, camera and screen sharing.
- Many interviews are competency-based. GDM recommends the **STAR method** (Situation, Task, Action, Result).
- Every candidate is scored against clearly defined criteria.
- Invited candidates get role-specific preparation material for each stage. Read it first; it beats this page.
- AI: you may use it to prepare. Unless told otherwise, no AI tools in live interviews or interview tasks.
- If you also interview with Google or another Alphabet company, tell your GDM recruiter. The two processes are run by different teams.
- No feedback after a week? Ask your recruiter.
- The guide's tips include "think out loud", "include data" and "prepare your questions". You may keep a notebook and a pen nearby.
- Before interviews, the guide asks you to think about how GDM's mission matters to you personally. It also suggests Google's Interview Warmup tool for practice.

What older GDM Research Engineer loops contained (reported, not Polaris): a 2021 candidate had two coding screens with code that had to run, plus ML screens ^[reported](https://www.teamblind.com/post/deepmind-research-engineer-interview-process-wp1gjgyb "2026-10-20"). A 2024 candidate had two coding rounds, one ML system design and one ML fundamentals round ^[reported](https://www.teamblind.com/browse/Deepmind-Interview-73684 "2026-10-20"). Polaris may weigh ML less than other teams ^[inference](- "2026-10-20"). The optional ML list lives in [[unfamiliar-stacks]].

Your timeline: you plan to apply by Fri Oct 23. The guide says the process takes 4–10 weeks. It does not say whether that includes the wait before the first call. If the process starts soon after you apply, a decision would come between about Nov 20 and Jan 1, with final rounds before that. It can take longer. Ask your recruiter about timelines ^[inference](- "2026-10-20"). Keep mocking during that window.

## Three practice modes {#practice-modes}

Every mock below runs in one of these modes. Set them up once.

**Agent mode.** The agent edits files; you approve each edit. Use Antigravity CLI (`agy`), Google's agent CLI. Gemini 3.8 Flash is the default model on every Antigravity plan, including the free plan with a weekly quota ^[confirmed](https://antigravity.google/docs/plans "2026-10-20"). Plans change often, and Google's docs do not always agree. Recheck the plans page before you rely on this. Google's own advice: explore, plan, then execute; give the agent a test command to run after each change ^[confirmed](https://antigravity.google/docs/cli/best-practices "2026-10-20"). Use plan mode and approve every edit. Save the transcript. For headless runs, read the JSON `status` field, not the exit code ^[confirmed](https://antigravity.google/docs/cli/headless/ "2026-10-20"). All `agy` details here were checked against docs on 2026-10-20, not run. Practice with Gemini, not only with other agents: you want to learn how *Gemini* fails ^[reported](https://www.aced.io/blog/google-ai-coding-interview "2026-10-20").

**Chat-only mode.** The AI never touches your files. You paste code into a chat; it answers in text; you type every line yourself. This matches Meta's setup ^[reported](https://www.hellointerview.com/blog/meta-ai-enabled-coding "2026-10-20"). Use Google AI Studio's chat; GDM's guide suggests trying Gemini there before interviews ^[confirmed](https://storage.googleapis.com/deepmind-media/DeepMind.com/Assets/Docs/interviewing-at-google-deepmind.pdf "2026-10-20").

**No-AI mode.** Turn off every AI extension and inline completion in your editor. Test it: type `def merge(` and wait 5 seconds. If grey text appears, something is still on. Also practice once in a plain text document where you cannot run code. One candidate reported a Google L6 engineering-manager round: 200+ lines of broken code in a Google Doc, with no IDE, compiler or AI ^[reported](https://www.aced.io/blog/google-ai-coding-interview "2026-10-20"). It is not a Research Engineer or GDM report.

## Get realistic mock material {#mock-material}

A mock is useless if you already know the bug. This recipe turns any real bug fix in a public repo into a fresh practice repo. You never see the fix until the end. The fix's own tests become your hidden grader.

Unlike a validated Polaris grader, these tests are tied to one solution. They expect upstream's function names, signatures and error messages. So they can reject a correct fix that is designed differently. That is the same problem as SWE-bench's FAIL_TO_PASS tests ([[task-design#benchmarks-broke]]). Step 5 shows how to read a failure before you trust it.

Save this as `mockrepo.sh` somewhere outside any repo, then `chmod +x mockrepo.sh`:

```bash
#!/usr/bin/env bash
# Usage: mockrepo.sh REPO_URL_OR_PATH FIX_SHA
# Builds a practice repo at the commit before FIX_SHA, with fresh git history.
# Saves the real fix in ~/mock-answers, away from the practice repo. Open it only after the mock.
set -euo pipefail
src=$1
fix=$2
work=$(mktemp -d)
keys="$HOME/mock-answers"
mkdir -p "$keys"
ans="$keys/$(basename "$work").diff"
git clone --quiet "$src" "$work/upstream"
git -C "$work/upstream" diff "$fix^" "$fix" > "$ans"
mkdir "$work/mock"
git -C "$work/upstream" archive "$fix^" | tar -x -C "$work/mock"
rm -rf "$work/upstream"
cd "$work/mock"
git init -q
git add -A
git -c user.name=mock -c user.email=mock@example.invalid commit -qm "mock base"
echo "practice repo: $work/mock"
echo "answer diff:   $ans  ($(wc -l < "$ans" | tr -d ' ') lines; do not open yet)"
```

The fresh `git init` matters. The agent cannot find the fix with `git log --all` ([[M7]], solution lookup). The answer sits in `~/mock-answers`, not in `mock/` or its parent, so `ls ..` does not show it.

That stops casual lookup only. An agent with shell access can read any file you can. In Antigravity CLI the terminal sandbox is off by default. With it on, sandboxed commands have no network, so they cannot fetch the upstream repo ^[confirmed](https://antigravity.google/docs/cli/modes/ "2026-10-20"). Turn it on (checked against docs on 2026-10-20, not run). The [[S0]] canary test checks the read boundary before you start.

After the mock, search the transcript for `mock-answers`, `.diff` and the upstream repo's name ([[S14]]). Did the agent read files outside `mock/`, fetch the upstream repo, or search the web for the issue? Log it as [[M7]]. The agent may also remember the fix from training. If it "knows" the answer too fast, write that in your log. That is a contamination signal, and Polaris cares about it.

**Step 1: pick a fix without reading it.** Clone a mid-size Python repo you have never read. List fix commits that change at least one test file *and* at least one source file. Docs, CI and config files do not count as source. The loop shows only hashes and sizes:

```bash
tp='(^|/)(tests?(/|\.py$)|test_[^/]*$|[^/]*_test\.py$|conftest\.py$)'
git log --no-merges --format='%h' -i --grep='fix' | head -60 | while read -r s; do
  files=$(git show --name-only --format= "$s")
  t=$(printf '%s\n' "$files" | grep -cE "$tp")
  o=$(printf '%s\n' "$files" | grep -vE "$tp" | grep -cvE '^\.github/|\.(md|rst|txt|toml|cfg|ini|ya?ml)$')
  [ "$t" -ge 1 ] && [ "$o" -ge 1 ] && echo "$s  $(git show --shortstat --format= "$s")"
done | sort -R | head -3
```

Real output on 2026-10-20 from [more-itertools](https://github.com/more-itertools/more-itertools) at commit `4aeb433`. Yours will differ, because `sort -R` shuffles:

```text
cf186b5   2 files changed, 7 insertions(+), 2 deletions(-)
adeda34   2 files changed, 21 insertions(+), 2 deletions(-)
11c8280   2 files changed, 6 insertions(+), 8 deletions(-)
```

Pick one with 10–60 changed lines. For a feature (Mock 1, phase 2), use `--grep='^add'` instead of `--grep='fix'`.

**Step 2: build the practice repo.** Run `./mockrepo.sh https://github.com/OWNER/REPO.git SHA`. The path of your local clone from Step 1 works too, and saves a download. It prints two paths. Write the answer path in your notes. Install the repo's test dependencies in a venv inside `mock/` before the timer starts.

In the terminal where you check and grade, store the answer path in a plain shell variable. Do not `export` it: exported variables reach the agent's environment.

```bash
ANSWER=~/mock-answers/tmp.XXXXXXXXXX.diff    # the path mockrepo.sh printed
```

**Step 3: check the hidden grader (before the mock).** Inside `mock/`, with the venv active:

```bash
git apply --include='*test*' "$ANSWER"
python -m pytest -q 2>&1 | tail -1           # must report at least 1 failed or error
git apply -R --include='*test*' "$ANSWER"    # remove the hidden tests again
git status --short                           # no " M" lines may remain
```

`tail -1` shows only pytest's summary line. You learn the count, not the test. If nothing fails, the hidden tests cannot tell a fix from no fix. They would accept doing nothing. Pick another commit. For a feature commit, an error about a missing name is expected here: the feature does not exist yet.

We ran this on 2026-10-20 (Python 3.13.9, pytest 9.1.1) ^[inference](- "2026-10-20"). On more-itertools fix `67fcf64` it printed `1 failed, 767 passed, 21202 subtests passed`. On fix `d71c4ad` it printed `704 passed, 19866 subtests passed`, the same as the base. Its hidden tests pass without the fix, so it is no use as a mock.

**Step 4: get a task statement.** Best: a friend reads the answer diff and writes a short bug report (symptom only). Second best: copy the diff with `pbcopy < "$ANSWER"`, paste it into a fresh AI chat without reading it, and ask:

```text
Write a bug report a user would file: what they did, what they expected,
what happened. Do not mention the cause, the fix, or file names. Under 100 words.
```

For a feature commit (R2 in Mock 1), ask for a request that pins down the interface. Otherwise the hidden tests will reject a correct design with other names:

```text
Write a feature request a user would file. Name the public function or CLI flag
and its exact signature, as in the diff. Do not describe the implementation.
Under 120 words.
```

Save the reply as `ISSUE.md` in `mock/`.

**Step 5: grade yourself after the mock.** Put your own tests in a new test file, such as `tests/test_mine.py`. Never add them to an existing test file. The real fix often edits that file, and then the hidden tests will not apply. From inside `mock/`:

```bash
git apply --stat --include='*test*' "$ANSWER"   # lists what it will touch: test files only
git apply --include='*test*' "$ANSWER"
python -m pytest -q      # or the repo's own test command
```

If the `--stat` list shows a source file whose name contains `test`, stop. Applying it would hand you part of the fix.

If `git apply` says `patch does not apply`, you edited a test file that the fix also edits. Copy your tests into `tests/test_mine.py`. Restore that file with `git checkout -- path/to/that_test.py`. Then apply again. `git stash` does not help here: we tried it, and `git stash pop` refused to overwrite the file.

Read each hidden-test failure before you count it:

- An assertion about the bug's behavior: your fix is wrong or incomplete.
- An `ImportError`, an `AttributeError`, or a mismatch on an exact error message: maybe a false reject. The test expects upstream's names, not your design. Check by hand whether your behavior is correct.

We tested the whole recipe on 2026-10-20 on more-itertools fix `67fcf64` ^[inference](- "2026-10-20"). The base passed: 767 tests. With only the hidden tests, 1 test failed with an `AssertionError` about the buggy behavior (we read the message). With the real fix too, 768 passed. So the hidden tests fail without the fix and pass with it.

Then open the answer diff and compare designs: did you fix the cause or a symptom ([[M2]])?

## Your first two minutes {#pitch}

The first stage is a 30-minute recruiter call about your background and experience. The recruiter also asks why you applied ^[confirmed](https://deepmind.google/careers/ "2026-10-20"). It can come days after you apply. The final stage looks at culture, mission and values. GDM's guide asks you to think about how its mission matters to you personally ^[confirmed](https://storage.googleapis.com/deepmind-media/DeepMind.com/Assets/Docs/interviewing-at-google-deepmind.pdf "2026-10-20").

So prepare answers you will *give*, not only questions you will ask. The posting lists experience with AI coding agents as a minimum ^[confirmed](https://www.google.com/about/careers/applications/jobs/results/114077679900074694-research-engineer-polaris-deepmind "2026-10-19"). Make yours concrete: a tool, a project, one catch, one number.

**"Tell me about yourself" (under 90 seconds).** Three parts:

1. **Background, 2 sentences.** What you build, in which languages, with which agents.
2. **One real agent catch, with a number.** Take it from [[agent-patch-audit#drill-audit-01|audit-01.md]] or from your [STAR stories](#star).
3. **Why Polaris, 2 sentences.** Tie it to the job: hand-built, long software tasks, and graders a model cannot fool. Then say what GDM's mission means to you, in your own words.

Every bracket below is a slot. Fill it only with what is true:

```text
I build [kind of apps] in [languages], mostly by directing coding agents like [tool].
Recently I built [project], which [does what].
When I audited one agent commit, I found [what was wrong].
[A number: tests before -> after, diff size, or minutes.]
That is why Polaris interests me: you hand-build long tasks with graders a model cannot fool.
I want to help measure [what], because [your reason, tied to the mission].
```

**"Why Polaris?" (under 60 seconds).** Reuse part 3. Add one thing you did that looks like the job: a grader you checked, a task you designed, a failure you labeled. Do not mention Chronos as your work until you pass its [[start-here#honesty|ownership gate]].

GDM's guide suggests Google's Interview Warmup tool for practice ^[confirmed](https://storage.googleapis.com/deepmind-media/DeepMind.com/Assets/Docs/interviewing-at-google-deepmind.pdf "2026-10-20"). It fits this drill.

:::drill id="pitch" title="Record 'tell me about yourself' and 'why Polaris'" time="30 min"
1. Fill the template from real material: `audit-01.md`, your STAR notes, a command you ran.
2. Record "tell me about yourself". Then record "why Polaris".
3. Play both back. Time them. Count sentences over 20 words.
4. Cut and record again until both fit.
5. Do this before your first recruiter call. The sprint has no slot for it, so do it in the first week after Nov 2 ([[tracker#after-applying|tracker]]). If a recruiter writes sooner, do it first: it takes 30 minutes.

**Done when:** you have a recording of "tell me about yourself" under 90 seconds and one of "why Polaris" under 60 seconds. Each has at least one number from a command you ran, and no sentence over 20 words.
:::

## The four mocks {#mocks}

Each mock has a timer and a log box. Fill the log as you go: "the AI said … / I checked …". Use the [[cards#card-say-it|Say it out loud card]] in every mock. Record your voice (QuickTime Player or Voice Memos on macOS). Write the time of any moment you want to replay in the log. You will score from the log and those moments.

:::mock id="meta-format" title="Mock 1 · AI-assisted, Meta's format (agent mode) · 60 min" minutes="60"
This is **Meta's** documented round, used as a practice format ^[reported](https://www.hellointerview.com/blog/meta-ai-enabled-coding "2026-10-20"). It is not a Polaris format. In Meta's real round the AI only chats. Run it in agent mode the first time and chat-only the second time.

**Prepare the evening before (not timed):** two practice repos from [the recipe](#mock-material). R1 from a fix commit (with `ISSUE.md`). R2 from a commit that adds a feature with tests (with a feature request in `ISSUE.md`, from the R2 prompt in Step 4). Run the hidden-grader check (Step 3) and install dependencies in both.

1. **0:00–0:05 Orient.** Read both `ISSUE.md` files. In R1, run the full test suite twice. Say the baseline: "N pass, M fail."
2. **0:05–0:20 Phase 1, bug (R1).** Say your own hypothesis first. Then ask the agent: "Read only. Where could this bug be? Give file:line for every claim. Say 'unsure' when unsure." Check two of its claims with `rg`. Write a failing test in a new file, `tests/test_mine.py`. Fix. Read the whole diff. Run the full suite. Say: "My guess is [X], because [evidence]. The agent thinks [Y]. I'll test both."
3. **0:20–0:45 Phase 2, implement (R2).** Write a 3-line spec in a file before you prompt. Ask for a plan. Cut anything outside the request. Build in small steps: edit → diff → tests. Add at least two tests of your own in `tests/test_mine.py`, one for an edge case.
4. **0:45–0:57 Phase 3, optimize.** Write a 10-line generator for inputs 10×, 100× and 1000× bigger than the tests use. Time each size. Find the slow part; fix it; re-run every test. Not finishing this phase is acceptable in Meta's round ^[reported](https://www.hellointerview.com/blog/meta-ai-enabled-coding "2026-10-20").
5. **0:57–1:00 Close.** Root cause, what changed, how you checked, what you did not check.

**After the timer:** apply the hidden tests in R1 and R2 ([Step 5](#mock-material)). Read each failure before you count it. Score with the [proxy rubric](#rubric). Meta's stated criteria are a useful second lens: problem solving, code quality, verification, communication ^[reported](https://www.hellointerview.com/blog/meta-ai-enabled-coding "2026-10-20").
:::

:::mock id="chat-only" title="Mock 2 · Read, debug, optimize (chat-only) · 60 min" minutes="60"
This follows the **reported** shape of Google's pilot: read, debug and optimize existing code with Gemini ^[reported](https://www.entrepreneur.com/business-news/google-is-testing-a-new-rule-transform-job-interviews "2026-10-20"). The AI sees only what you paste. You type every line. The reported scoring words are prompting, output validation and debugging, so narrate all three.

**Prepare:** one practice repo from a fix commit, with `ISSUE.md` and a checked hidden grader ([Step 3](#mock-material)).

1. **0:00–0:05 Baseline.** Read `ISSUE.md`. Run the suite. Say the baseline.
2. **0:05–0:15 Map by hand, no AI.** Find the entry point and the module the issue touches. Write a 5-line map with file:line.
3. **0:15–0:20 Use the AI to read.** Paste ONE function. Ask: "Explain what this does, step by step. Point to the lines." Check two claims by running code. Say: "The AI says [claim]. I ran [input] and got [output], so that claim is [right / wrong]."
4. **0:20–0:35 Reproduce and locate.** Your hypothesis first, then ask the AI for its hypothesis. Write a failing test in `tests/test_mine.py`. Settle disagreements with a run, not with an argument.
5. **0:35–0:45 Fix.** Type the fix yourself. Read the diff. Full suite. Revert your fix: your new test must fail. Restore the fix.
6. **0:45–0:55 Optimize.** Run `python -m pytest -q --durations=5`. Explain the slowest test's cost. Measure one improvement before and after, or write down a measured proposal.
7. **0:55–1:00 Close.** Include one sentence on where the AI was wrong and how you caught it.

**After:** hidden tests ([Step 5](#mock-material)), then the rubric.
:::

:::mock id="no-ai-algo" title="Mock 3 · No-AI algorithms · 45 min" minutes="45"
GDM's default is no AI ^[confirmed](https://storage.googleapis.com/deepmind-media/DeepMind.com/Assets/Docs/interviewing-at-google-deepmind.pdf "2026-10-20"). A Google coding slot is reported as 45 minutes, with about 40 minutes of working time ^[reported](https://prepfully.com/interview-guides/google-software-engineer-coding-interview "2026-10-20"). The problem and its grader are [below](#asof-problem). No AI, no web search. You may run your own code. Run `stress.py` only when the timer ends: it is your grader.

1. **0:00–0:05 Clarify.** Restate the problem. Ask about ties, empty input and sizes, even if the statement answers them. Work the example by hand. Say: "So a vintage published exactly at the query time counts, and on a tie the later row wins. Is that right?"
2. **0:05–0:10 Brute force out loud.** Give it with its cost, O(n·q). Say: "At full size that is 4 times 10 to the 10 steps. Too slow. Sorting each key once and using binary search gives O((n + q) log n)."
3. **0:10–0:25 Part 1.** Code the fast version.
4. **0:25–0:32 Test.** Walk the example by hand. Add two tiny cases: the boundary `published_at == asof`, and a tie.
5. **0:32–0:40 Part 2.** Extend it.
6. **0:40–0:45 Part 3.** Talk only. Then state final complexity for every part.

**After:** run `stress.py`. Score with the [coding rubric](#rubric).

**Every later run:** you know this problem now, so a repeat tests memory, not problem solving. Pick one unseen problem from [[unfamiliar-stacks#topics|the topic list]], for example from CSES Sorting and Searching. Inside the 45 minutes, also write a brute force and a stress test like `stress.py` ([[unfamiliar-stacks#stress-test]]).
:::

:::mock id="deep-dive" title="Mock 4 · Project deep dive · 45 min" minutes="45"
Google reportedly added a technical design talk about your own past work to one of its rounds ^[reported](https://www.entrepreneur.com/business-news/google-is-testing-a-new-rule-transform-job-interviews "2026-10-20"). Mechanize records a 1-hour talk about your code, with system design ^[confirmed](https://www.mechanize.work/how-our-interview-process-works "2026-10-20"). Use [[capstone]] once you have passed [[start-here#honesty|ownership-gate]] items 1–2; before that, use Gym or Paper Piano.

**Ownership rule:** say exactly who built what. "I directed AI agents to build v0. Then I reproduced a grader failure, diagnosed it and changed the grader myself." Only say the second sentence after you have done it.

1. **0:00–0:05 You, then the project.** First "tell me about yourself" in 90 seconds ([your first two minutes](#pitch)). Then 60 seconds on the project: what it is, why it matters, one result with a number. Say: "[Project] is [what] for [whom]. The hard part was [X]. I know it works because [evidence with a number]."
2. **0:05–0:15 Architecture.** Draw the parts on paper. Expect interruptions.
3. **0:15–0:27 Decisions.** Three "why X and not Y" answers. Each one: the tradeoff, the evidence, what would change your mind.
4. **0:27–0:35 Failure.** One STAR story about something that broke and how you found it.
5. **0:35–0:42 Scale.** "Run this grader on 10,000 attempts a day." Sandboxes, timeouts, flaky tests, logging, cost.
6. **0:42–0:45 Your questions.** Two from [the list](#recruiter).

**Interviewer:** a friend, or an AI in chat (preparing with AI is allowed). Prompt:

```text
You are an interviewer for a Research Engineer role on a team that builds
software-engineering evaluation tasks for coding agents. Run a 45-minute deep dive
on my project. Start with "tell me about yourself". Ask one question at a time and
wait for my answer. Push on every claim with "how do you know?" and ask for
file:line evidence. Ask at least three "why X and not Y" questions, one question
about a failure, and one scaling question (10,000 graded attempts per day).
If the project has a grader or tests, ask at least two questions about how I
validated it: could it reject a correct solution or accept a wrong one, and what
sample do my numbers come from? Ask one question about contamination. Do not
praise me. At the end, list my three weakest answers and say why each was weak.
My project README follows.
```

For grader answers, use group 6 of the Say it out loud card and the frame rules in [[grader-validity#sampling-frames|grader validity]]. "It caught all 12 wrong solutions, so it's accurate" is the naive answer: a hand-picked set gives a count, not an error rate. For harder questions, drill [[defend-it]] first.
:::

### The no-AI problem: as-of lookup {#asof-problem}

This problem is Polaris-flavored on purpose. Its boundary rule and tie rule are the same rules a point-in-time grader must check in [[capstone]] ^[inference](- "2026-10-20"). Read only the statement before the mock.

**Part 1.** You get two lists.

- `vintages`: tuples `(key, published_at, value)`. `key` is a string, `published_at` an int, `value` an int. The list is in arrival order, not sorted.
- `queries`: tuples `(key, asof)`.

Return one answer per query: the `value` of the vintage with the same `key` and the largest `published_at` such that `published_at <= asof`. If several vintages of that key share that `published_at`, the one that comes **later** in `vintages` wins. If none qualifies, the answer is `None`. Sizes: up to 200,000 vintages and 200,000 queries. Target: under 2 seconds in Python.

```python
vintages = [("gdp", 10, 100), ("gdp", 20, 105), ("cpi", 15, 7), ("gdp", 20, 106)]
queries = [("gdp", 9), ("gdp", 10), ("gdp", 25), ("cpi", 15), ("oil", 30)]
# asof_lookup(vintages, queries) == [None, 100, 106, 7, None]
```

**Part 2.** Write `asof_distinct(vintages, queries)`. For each query, return how many distinct `value`s that key has among vintages with `published_at <= asof` (0 if none). On the example: `[0, 1, 3, 1, 0]`.

**Part 3 (talk only).** Now vintages arrive as a stream sorted by `published_at`, and queries arrive sorted by `asof`. How do you answer in O(n + q) time and how much memory do you need?

**The grader.** Save your solution as `asof.py` with both functions. Save this as `stress.py` next to it. It compares you with a slow brute force on 5,000 small random cases, then times three sizes.

```python
"""Stress test for asof.py: compare with a slow brute force, then time three input sizes."""
import random
import signal
import sys
import time

import asof


def brute_lookup(vintages, queries):
    out = []
    for key, t in queries:
        best = None  # (published_at, input index, value)
        for i, (k, p, v) in enumerate(vintages):
            if k == key and p <= t and (best is None or (p, i) > best[:2]):
                best = (p, i, v)
        out.append(None if best is None else best[2])
    return out


def brute_distinct(vintages, queries):
    return [len({v for k, p, v in vintages if k == key and p <= t}) for key, t in queries]


def small_case(rng):
    keys = ["a", "b", "c"][: rng.randint(1, 3)]
    vintages = [(rng.choice(keys), rng.randint(0, 5), rng.randint(0, 9)) for _ in range(rng.randint(0, 8))]
    queries = [(rng.choice(keys + ["z"]), rng.randint(-1, 6)) for _ in range(rng.randint(1, 8))]
    return vintages, queries


def too_slow(signum, frame):
    raise TimeoutError


def main():
    seed = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    rng = random.Random(seed)
    signal.signal(signal.SIGALRM, too_slow)
    parts = [("asof_lookup", brute_lookup), ("asof_distinct", brute_distinct)]
    for name, brute in [(n, b) for n, b in parts if hasattr(asof, n)]:
        fn = getattr(asof, name)
        for case in range(5000):
            v, q = small_case(rng)
            want, got = brute(v, q), fn(v, q)
            if want != got:
                print(f"{name}: MISMATCH on case {case} (seed {seed})")
                print(f"  vintages = {v}\n  queries  = {q}\n  want     = {want}\n  got      = {got}")
                return 1
        print(f"{name}: 5000 small random cases match the brute force")
        for n in (1_000, 10_000, 200_000):
            big_v = [(f"k{rng.randrange(1000)}", rng.randrange(10**9), rng.randrange(10**6)) for _ in range(n)]
            big_q = [(f"k{rng.randrange(1000)}", rng.randrange(10**9)) for _ in range(n)]
            start = time.perf_counter()
            signal.alarm(10)
            try:
                fn(big_v, big_q)
            except TimeoutError:
                print(f"{name}: n = q = {n:>7,}: stopped after 10 s (too slow)")
                return 2
            finally:
                signal.alarm(0)
            print(f"{name}: n = q = {n:>7,}: {time.perf_counter() - start:.2f} s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

Run it with `python3 stress.py` (or `python3 stress.py 7` for another seed). The small cases use times 0–5, so equal timestamps and `asof == published_at` happen often. That is deliberate: boundaries are where bugs live.

Real runs on 2026-10-20 (arm64 Mac, Python 3.13.9). A correct solution, seed 7:

```text
asof_lookup: 5000 small random cases match the brute force
asof_lookup: n = q =   1,000: 0.00 s
asof_lookup: n = q =  10,000: 0.00 s
asof_lookup: n = q = 200,000: 0.13 s
asof_distinct: 5000 small random cases match the brute force
asof_distinct: n = q =   1,000: 0.00 s
asof_distinct: n = q =  10,000: 0.00 s
asof_distinct: n = q = 200,000: 0.12 s
```

The same solution with one change, `bisect_left` instead of `bisect_right`:

```text
asof_lookup: MISMATCH on case 0 (seed 7)
  vintages = [('b', 5, 0), ('a', 4, 1)]
  queries  = [('z', -1), ('z', 2), ('a', 0), ('b', 5), ('a', 2), ('a', 5)]
  want     = [None, None, None, 0, None, 1]
  got      = [None, None, None, None, None, 1]
```

Read it: the query `('b', 5)` asks at exactly the publication time 5. The rule says `<=`, so the value is visible. `bisect_left` hides it. In a backtest that is the opposite of leakage: you throw away data you really had. Both directions are bugs.

A correct but slow O(n·q) loop:

```text
asof_lookup: 5000 small random cases match the brute force
asof_lookup: n = q =   1,000: 0.01 s
asof_lookup: n = q =  10,000: 1.04 s
asof_lookup: n = q = 200,000: stopped after 10 s (too slow)
```

:::reveal title="Show a reference solution (only after the mock)"
```python
from bisect import bisect_right
from collections import defaultdict


def _index(vintages):
    by_key = defaultdict(list)
    for i, (key, published_at, value) in enumerate(vintages):
        by_key[key].append((published_at, i, value))  # i breaks ties: later input wins
    for rows in by_key.values():
        rows.sort()
    return by_key


def asof_lookup(vintages, queries):
    by_key = _index(vintages)
    times = {k: [p for p, _, _ in rows] for k, rows in by_key.items()}
    out = []
    for key, t in queries:
        j = bisect_right(times.get(key, []), t)  # rows [0, j) have published_at <= t
        out.append(by_key[key][j - 1][2] if j else None)
    return out


def asof_distinct(vintages, queries):
    by_key = _index(vintages)
    times, counts = {}, {}
    for key, rows in by_key.items():
        seen, running = set(), []
        for _, _, value in rows:
            seen.add(value)
            running.append(len(seen))
        times[key], counts[key] = [p for p, _, _ in rows], running
    out = []
    for key, t in queries:
        j = bisect_right(times.get(key, []), t)
        out.append(counts[key][j - 1] if j else 0)
    return out
```

Part 3: keep a pointer into the vintage stream and a dict `latest[key]`. For each query, advance the pointer while `published_at <= asof` and overwrite `latest[key]`. A later row with the same time overwrites an earlier one, so the tie rule holds. Time O(n + q). Memory O(number of keys). Checked against the brute force on 5,000 sorted random cases:

```python
def asof_stream(vintages, queries):
    """vintages sorted by published_at (arrival order kept for ties); queries sorted by asof."""
    latest, out, i = {}, [], 0
    for key, t in queries:
        while i < len(vintages) and vintages[i][1] <= t:
            k, _, v = vintages[i]
            latest[k] = v  # a later row with the same time overwrites: later input wins
            i += 1
        out.append(latest.get(key))
    return out
```

A trap to mention out loud: sorting by `(published_at, value)` breaks the tie rule. Sorting by `published_at` alone is fine in Python, because `sort` is stable.
:::

## Score yourself: proxy rubrics {#rubric}

**Proxy rubric (inference): Mechanize's traits, on a Google-style 1–4 scale as reported by Prepfully.** The rows are Mechanize's published traits ^[confirmed](https://www.mechanize.work/how-our-interview-process-works "2026-10-20"). Their link to Polaris is our inference. The 1–4 scale copies the scale Prepfully reports for Google's coding rounds ^[reported](https://prepfully.com/interview-guides/google-software-engineer-coding-interview "2026-10-20"). This is **not** Polaris's rubric. Nobody outside Google knows that rubric.

Start scoring within 10 minutes of the mock, from your log. Replay only the moments you flagged. If a friend watched, use their score.

The tables below keep only your latest scores, one set per rubric. The next mock overwrites them. So after scoring, paste one line into that mock's log box: `date · mock · row scores · average`.

| Score | Meaning (our definition) |
|---|---|
| 1 | Not shown, or shown wrongly (you accepted a wrong agent claim). |
| 2 | Shown only after a hint, or too late to matter. |
| 3 | Shown without a hint, with evidence you can point to (a command output, a test). |
| 4 | Like 3, and it changed the outcome: you caught something the agent and the tests missed. |

Use this one for Mocks 1, 2 and 4:

:::rubric id="proxy-mechanize"
- Made fast progress in code you had never seen
- Used the agent well: clear prompts, small asks, useful output
- Knew when to step in and take over from the agent
- Explained what changed and why, line by line
- Made sound technical decisions under time pressure
- Produced high-quality work quickly (not just quick work)
- Noticed a brittle, incomplete or accidentally-working solution
- Debugged a subtle failure the agent did not fix on its own
- Explained tradeoffs clearly
- Explained what made the task hard
:::

Use this one for Mock 3. The four areas are the ones Prepfully reports for Google's coding rounds ^[reported](https://prepfully.com/interview-guides/google-software-engineer-coding-interview "2026-10-20"):

:::rubric id="coding-four"
- Algorithms: picked a fitting approach and stated its cost
- Coding: clean, correct code that runs, with sensible names
- Communication: talked through the plan, the doubts and the checks
- Problem solving: asked about edge cases, tested, recovered from mistakes
:::

If you score 3 or more on every row of a mock, skip that mock in the next rotation. Run the mock for your weakest mode instead ^[inference](- "2026-10-20"). Put the saved effort into your weakest row.

:::compare
- Says "the AI fixed it" and moves on. || Says "the new test failed before the fix and passes now. I reverted the fix and it failed again."
- Pastes the agent's code, then explains it after being asked. || Reads every changed line before running it and can say why each line exists.
- Stays silent while thinking, then announces an answer. || Narrates in short sentences: baseline, hypothesis, check, result.
- Claims "Polaris uses an AI round" from a blog post. || Says what is confirmed, what is reported, and what they asked the recruiter.
- Tells a story where "we built it" and the agent's role is unclear. || Says exactly what the agent did, where they overrode it, and what they verified themselves.
- Answers "how do you know it works?" with "the tests pass." || Answers with the tests, the revert check, one edge case they added, and one case they did not cover.
:::

## Say it out loud {#say-it}

Every round scores how you think, and the interviewer only hears what you say. GDM's guide asks you to think out loud and to say so when you are not sure ^[confirmed](https://storage.googleapis.com/deepmind-media/DeepMind.com/Assets/Docs/interviewing-at-google-deepmind.pdf "2026-10-20"). English is not your first language. That is fine. Short, clear sentences beat long, fast ones.

- Use the [[cards#card-say-it|Say it out loud card]]. It has 26 short lines in seven groups, from clarifying a problem to talking about a grader. Print it.
- Pause instead of filling silence. A two-second pause sounds like thinking.
- Say numbers slowly: "two hundred thousand", "O of n log n".
- Write key words on paper before you speak: the bug, the input, the check.
- When an agent or a chat makes a claim, say whose claim it is: "The AI says X. I haven't checked it yet."

:::drill id="say-it-warmup" title="Narrate one fix with the card" time="20 min"
1. Pick any small bug you fixed before, or the example in [[agent-patch-audit]].
2. Start a voice recording. Explain it for 5 minutes, using only sentences from the card, filled in.
3. Play it back. Count: sentences over 20 words, "um"s, places where you went silent for more than 5 seconds.
4. Rewrite your three worst moments as card sentences. Record them again.

**Done when:** a second 5-minute recording has fewer long sentences and silences than the first, and you can say the five closing sentences without reading.
:::

## STAR stories from your own commits {#star}

GDM recommends STAR answers and asks you to include data ^[confirmed](https://storage.googleapis.com/deepmind-media/DeepMind.com/Assets/Docs/interviewing-at-google-deepmind.pdf "2026-10-20"). Polaris wants concrete agent experience. Your best material is already in your portfolio repo: Gym, Paper Piano and the Flash card station were built with coding agents. Do not invent stories. Mine real ones by auditing real commits.

You need four stories ^[inference](- "2026-10-20"):

1. **A catch.** An agent mistake you found, and how.
2. **A hard bug.** Something that took real debugging.
3. **A decision.** A tradeoff you made, against the agent's first idea if possible.
4. **An honest limit.** Something you chose not to claim, and why.

### Step 1: pick two commits

In your portfolio repo:

```bash
git log --oneline --no-merges -- workspace/gym workspace/ppiano workspace/flash | head -20
```

When this page was written (2026-10-20), the five newest commits in the whole repo were as below. They come from `git log --oneline -5`, not from the filtered command above. Your own run of the filtered command is what counts.

```text
84a9b33 Add Gym with local push-up counting and body-controlled flight
36ef792 Add literal finger counting and capo controls to Gesture Synth
13817dd Make Gesture Synth easier to play and add performance view
b113741 Add Paper Piano with gesture and calibrated paper modes
d8a57fb Make holographic card movement more pronounced
```

Pick one big "Add …" commit and one smaller change commit. If you already wrote `audit-01.md` ([[agent-patch-audit#drill-audit-01|audit-01]]), that commit counts as commit 1. Audit only one new commit here. Each project folder has its own tests: `workspace/gym/tests`, `workspace/ppiano/tests`, `workspace/flash/tests`.

### Step 2: audit each commit in review mode

This is a short form of review mode. Full review mode in [[agent-patch-audit]] is [[S0]], [[S1]], [[S2]]–[[S4]], [[S6]], [[S10]]–[[S15]]. Here, [[S1]] is the parent-commit run in S11. Skip S2–S4 if you already know the app. Skip S6 for a feature commit. Your real repo is only read. Everything else happens in a temp copy.

[[S0]] Isolate. Run this from your portfolio repo:

```bash
cd "$(git rev-parse --show-toplevel)"   # git clone . works only at the repo root
SHA=36ef792                        # your pick
APP=workspace/ppiano               # the folder that commit changed
src=(-- "$APP" ":(exclude)$APP/vendor" ":(exclude)$APP/assets")   # your own code only
tmp=$(mktemp -d)
git clone --quiet . "$tmp/repo"    # practice copy; the original is only read
cd "$tmp/repo" && git checkout --quiet "$SHA"
```

Always quote `"$SHA^"` in zsh. Some zsh setups treat a bare `^` as a pattern.

`src` limits each diff to first-party code. Gym's and Paper Piano's `vendor/` folders hold third-party files such as MediaPipe models, and Paper Piano's also holds OpenCV.js. If a commit added them, its full diff is huge, and minified code floods the red-flag scan. An exclude for a folder that does not exist is harmless.

[[S10]] Read the diff, not the summary:

```bash
git show --stat --format='%h %ad %s' --date=short "$SHA"
git show "$SHA" "${src[@]}" | rg -n '^\+.*(eval\(|new Function|innerHTML|\.only\(|\.skip\(|catch *(\([^)]*\))? *\{ *\})'
git show "$SHA" -- '*test*' | rg -n '^-.*assert'     # deleted assertions: a test-gaming smell (M3)
```

The second line flags risky added lines in your own browser code: `eval`, `new Function` and `innerHTML` ([[M10]]), and focused or skipped tests ([[M3]]). It also flags one-line empty `catch` blocks, such as `catch {}` or `catch (e) { }` ([[M4]]). A line scan cannot see an empty `catch` block that spans several lines. A hit is a question, not a verdict. Here is real output from a toy repo on 2026-10-20 (zsh, ripgrep). Its `vendor/` file had `innerHTML` and `eval(` too, and `src` kept it out:

```text
13:+try { f(); } catch {}
14:+try { f(); } catch (e) { }
15:+try { f(); } catch (err) {}
17:+export function render(el, n) { el.innerHTML = `<b>${n}</b>`; }
```

Line 16 of that diff, `catch (e) { log(e); }`, was not flagged: it handles the error.

Is `n` ever user text? If yes, that is an injection bug. If it is always a number, say so and move on.

[[S11]] Re-run the tests yourself, at the commit and at its parent:

```bash
node --test "$APP/tests/*.test.mjs" 2>&1 | grep -E '^# (tests|pass|fail)'
git checkout --quiet "$SHA^"
node --test "$APP/tests/*.test.mjs" 2>&1 | grep -E '^# (tests|pass|fail)'
git checkout --quiet "$SHA"
```

The quotes pass the pattern to Node, which expands it itself. Watch for a trap. If the folder did not exist at the parent, Node runs nothing and still exits 0. Real output (Node v22.21.1, 2026-10-20) for a pattern that matches no files:

```text
# tests 0
# pass 0
# fail 0
```

Run it without the pipe to see Node's own exit code. After a pipe, `$?` is `grep`'s exit code, not Node's. `node --test "$APP/tests/*.test.mjs" >/dev/null 2>&1; echo "exit=$?"` printed `exit=0`. Zero tests is not a pass ([[M6]]). Also note any test that only passes because of files that are not committed. The clone has only committed files, so a "works on my machine" problem shows up here.

[[S12]] Attack one claim. Pick one sentence the commit added to a README or `VALIDATION.md`. Real examples from your repo's docs: Gym's README says future dates do not lengthen today's streak. Paper Piano's README says that at capo 2, 1 → 4 → 5 → 1 becomes D → G → A → D. Write one new test in `$APP/tests/attack.test.mjs` that tries to break the claim. Then the revert check:

```bash
git checkout --quiet "$SHA^" -- path/to/the/changed/file.js
node --test "$APP/tests/attack.test.mjs" 2>&1 | grep -E '^# (tests|pass|fail)'   # must fail
git checkout --quiet "$SHA" -- path/to/the/changed/file.js
```

On a toy repo on 2026-10-20, a revert check like this printed `# tests 2`, `# pass 1`, `# fail 1` with the fix reverted. That is what you want: the test guards the change. For an "Add …" commit the file did not exist before. Instead, break one line by hand, check that your test fails, and restore it with `git checkout -- path/to/file.js`.

[[S13]] Fresh review. Save your part of the commit with `git show "$SHA" "${src[@]}" > "$tmp/commit.diff"`. Run `wc -l < "$tmp/commit.diff"` first. Over about 2,000 lines, review one file at a time ^[inference](- "2026-10-20"). Open a new agent or chat session that has never seen this project. Give it only that file and this prompt:

```text
You are reviewing a commit you did not write. You see only the commit message and the diff.
List concrete defects: bugs, missing edge cases, claims in docs that the code does not
support, and tests that would still pass if the feature were broken. For each one give
file:line, a failing input or scenario, and how to check it. No style comments.
If you find nothing, say "none found".
```

Reproduce each finding before you believe it. Drop style-only findings.

[[S14]] Transcript audit. If you saved the agent's transcript for this commit, list its claims and match each one to real output. If you did not save it, write "no transcript" in your notes. Start saving transcripts today. That is part of the story too.

[[S15]] Log. Add one row per finding to `mistakes.csv`, with the columns `date,task,what went wrong,mistake row,caught at step,minutes`. Put the commit SHA in the `task` field. Every page uses this header, so the rows can go straight into your master file.

### Step 3: collect the numbers

| Number | Command |
|---|---|
| Diff size (your code) | `git show --shortstat --format= "$SHA" "${src[@]}"` |
| Tests before → after | the two `node --test` runs in S11 |
| Test files changed | `git diff --stat "$SHA^" "$SHA" -- '*test*'` |
| Agent claims checked, and how many were wrong | your S13 and S14 notes |
| Minutes to find each problem | your timer |

If the audit finds nothing wrong, that is a real result too. Your story becomes "how I checked", not "what I caught". Never upgrade a non-finding into a catch.

### Step 4: write the story

Template:

```text
Title:      [short name you can say in 5 words]
Situation:  [project, tool, month] (1 sentence)
Task:       [what had to be true, and the constraint] (1 sentence)
Action:     [what YOU did, in order; what the agent did; the moment you disagreed] (3-4 sentences)
Result:     [numbers: tests before -> after, diff size, minutes; what shipped] (1-2 sentences)
Reflection: [what you do differently now] (1 sentence)
Evidence:   [commit SHAs, test names, file:line] (for you, not to recite)
```

Example skeleton. Every bracket is a slot for what really happened. Nothing in brackets is a fact about your work:

```text
Title:      [Capo transposition: the test that was not a test]
Situation:  In [month], I added [capo controls] to [Paper Piano] with [agent].
Task:       [All eight chords had to move by 0-11 semitones without changing X.]
Action:     I audited the commit myself. I read the [N]-line diff and re-ran the
            [N] tests at the commit and at its parent. Then I attacked one claim
            from the README: [claim]. My new test [failed / passed]. With the change
            reverted it [failed / passed], which showed [what].
Result:     [I found X and fixed it in commit Y / found nothing]. Tests went from
            [A] to [B]. It took [M] minutes.
Reflection: Now I [save transcripts / write the attack test before I accept a patch].
```

Story seeds from your own repo docs. Check which ones are really yours before you use them:

- Gym's README says physical camera accuracy has not been measured. That can be an **honest limit** story: why you chose not to claim accuracy.
- Gym's `VALIDATION.md` (2026-10-15) records a mobile overflow that was found and repaired at 390 px. If you found it, that can be a **catch** story.
- Gym's README says it uses UTC day ordinals to avoid daylight-saving errors in streaks. That can be a **decision** story, and it connects to the time rules in [[capstone]].
- Paper Piano's README says both hands are required in counting mode, so losing one hand cannot select a lower count. That can be a **decision** story about failing safe.

Tell each story out loud. Time it. Aim for under 2 minutes. Then ask yourself the follow-up an interviewer would ask: "How do you know?"

:::drill id="star-from-commits" title="Audit two of your own commits and write two STAR stories" time="1–2 h"
1. Pick two commits (Step 1): one "Add …", one change. If you already wrote `audit-01.md`, that is commit 1, and you audit only one new commit.
2. Run Step 2 on each, timed. Save your notes, `commit.diff`, the attack test and the S13 findings in the temp folder. Do not commit anything to your portfolio repo during this drill.
3. Fill the number table (Step 3).
4. Write two stories with the template (Step 4). Tell each one out loud and record it.
5. Score each recording with the proxy rubric rows that apply.

**Done when:** you have two STAR stories under 2 minutes each, each with at least one number from a command you ran, plus `mistakes.csv` rows (or a written "no defects found" with the checks you ran).
:::

## Questions for the recruiter, stage by stage {#recruiter}

The guide says your recruiter can answer process questions ^[confirmed](https://storage.googleapis.com/deepmind-media/DeepMind.com/Assets/Docs/interviewing-at-google-deepmind.pdf "2026-10-20"). Ask early. The answers decide which mock you practice next.

**At the recruiter call (initial stage):**

- Does this role use Google DeepMind's interview loop or Google's?
- How many rounds are there, and what does each one test?
- Will any round allow AI tools? If yes, which tool and which model?
- Is there a take-home, a work trial, or a project presentation?
- After I pass its ownership gate: may I share a link to an evaluation task I directed agents to build and then validated myself?
- What timeline should I expect?
- (If true) I am also interviewing with Google or another Alphabet company. The guide asks you to say so.

**Before the skills stage:**

- Which languages may I use? Is Python or C++ fine?
- Will my code need to run, or will I write in a shared document?
- Which editor or platform will we use? Can I try it before?
- Will I read and debug existing code, or write from scratch?
- Is there an ML fundamentals or ML design round for this role?
- How long is each round, and is any of it in person?

**Before the final stage:**

- Who will I meet, and what will each person focus on?
- Will there be a design discussion about my past work? Should I prepare a project walk-through?

**After each stage:**

- When should I expect feedback? (No answer after a week: ask again, as the guide says.)

**Questions for your interviewers** (end of a round). These show you think like the team ^[inference](- "2026-10-20"):

- How do you decide a task's grader is good enough to ship?
- What is the most common reason a task fails review?
- How do you check that a model has not seen a task's solution before?
- Which languages or kinds of repos are underrepresented in your tasks?
- What does a strong first month on Polaris look like?

:::drill id="recruiter-questions" title="Write your recruiter and interviewer questions" time="15 min"
1. Copy the lists above into a note you can open during calls.
2. Cut each stage to your top 3 questions. Add one question only you would ask, from your own project.
3. After each real call, write the answers next to the questions, and update your mock plan.

**Done when:** you have a note with 3 questions per stage, 3 for interviewers, and an empty "answers" column ready for the first call.
:::

## Mock schedule {#schedule}

Sprint (before Nov 2): one timed Mock 3 on Oct 30 or 31 ([[tracker#block-4|tracker]]). Nothing else on this page is in the sprint. Nov 1–2 are protected: no mocks.

After you apply (the 4–10 week window), follow the [[tracker#after-applying|tracker]]: every week, Mock 1 (agent), Mock 2 (chat-only) and Mock 3 (no AI), about 3 hours. Every other week, swap one of them for Mock 4, the project deep dive. Record [your first two minutes](#pitch) in the first week. Before each real stage, run one extra mock in the format the recruiter confirmed. Re-audit one new commit every two weeks, and refresh your stories.

:::drill id="mock-rotation" title="Run all four mocks once and find your weakest trait" time="4.5 h over 2 weeks"
1. Build and check the practice repos the mocks need ([recipe](#mock-material), about 1 h in total).
2. Run Mocks 1, 2 and 3 in your first week. In the second week, run Mock 4 in place of one of them. Use the timer and the log box (about 3.5 h for the four).
3. Start scoring within 10 minutes, from your log. Replay only the moments you flagged. Paste the score line into that mock's log box.
4. Write down your lowest-scoring row across all four mocks.
5. Plan the next mock to train that row on purpose.

**Done when:** four mocks have logs with a pasted score line, and you have named your weakest row and one concrete change for the next mock.
:::

## Sources

- ^[confirmed](https://storage.googleapis.com/deepmind-media/DeepMind.com/Assets/Docs/interviewing-at-google-deepmind.pdf "2026-10-20") [Interviewing at Google DeepMind](https://storage.googleapis.com/deepmind-media/DeepMind.com/Assets/Docs/interviewing-at-google-deepmind.pdf) — stages, 4–10 weeks, STAR, AI policy, tips. Undated PDF, read 2026-10-20.
- ^[confirmed](https://deepmind.google/careers/ "2026-10-20") [Google DeepMind careers page](https://deepmind.google/careers/) — what each stage involves.
- ^[confirmed](https://www.google.com/about/careers/applications/jobs/results/114077679900074694-research-engineer-polaris-deepmind "2026-10-19") [Research Engineer, Polaris posting](https://www.google.com/about/careers/applications/jobs/results/114077679900074694-research-engineer-polaris-deepmind) — the role.
- ^[confirmed](https://www.mechanize.work/how-our-interview-process-works "2026-10-20") [Mechanize: how our interview process works](https://www.mechanize.work/how-our-interview-process-works) — Mechanize's stages and traits (Mechanize, not Polaris).
- ^[reported](https://www.entrepreneur.com/business-news/google-is-testing-a-new-rule-transform-job-interviews "2026-10-20") [Entrepreneur, summarizing Business Insider (2026-05-08)](https://www.entrepreneur.com/business-news/google-is-testing-a-new-rule-transform-job-interviews) — Google's AI-assisted code comprehension pilot and loop changes.
- ^[reported](https://www.hellointerview.com/blog/meta-ai-enabled-coding "2026-10-20") [Hello Interview: Meta's AI-enabled coding round](https://www.hellointerview.com/blog/meta-ai-enabled-coding) — Meta's format and criteria; mostly candidate reports.
- ^[reported](https://www.aced.io/blog/google-ai-coding-interview "2026-10-20") [Aced: Google AI coding interview guide](https://www.aced.io/blog/google-ai-coding-interview) — prep advice; a no-IDE candidate report.
- ^[reported](https://prepfully.com/interview-guides/google-software-engineer-coding-interview "2026-10-20") [Prepfully: Google coding interview guide](https://prepfully.com/interview-guides/google-software-engineer-coding-interview) — four areas scored 1 to 4; 45-minute slot (page updated June 2026).
- ^[reported](https://www.businessinsider.com/google-completes-deal-for-ai-agents-startup-mechanize-2026-9 "2026-10-20") [Business Insider: Google's deal with Mechanize](https://www.businessinsider.com/google-completes-deal-for-ai-agents-startup-mechanize-2026-9) — September 2026.
- ^[reported](https://x.com/tamaybes/status/2105408224879116790 "2026-10-20") [Tamay Besiroglu on X (2026-09-30)](https://x.com/tamaybes/status/2105408224879116790) — recruiting for Polaris; text seen via summaries.
- ^[reported](https://www.teamblind.com/post/deepmind-research-engineer-interview-process-wp1gjgyb "2026-10-20") [Blind: GDM Research Engineer loop (2021)](https://www.teamblind.com/post/deepmind-research-engineer-interview-process-wp1gjgyb) and ^[reported](https://www.teamblind.com/browse/Deepmind-Interview-73684 "2026-10-20") [Blind: GDM interview posts (2024)](https://www.teamblind.com/browse/Deepmind-Interview-73684) — older candidate reports.
- ^[confirmed](https://antigravity.google/docs/plans "2026-10-20") [Antigravity plans](https://antigravity.google/docs/plans), ^[confirmed](https://antigravity.google/docs/cli/best-practices "2026-10-20") [CLI best practices](https://antigravity.google/docs/cli/best-practices) and ^[confirmed](https://antigravity.google/docs/cli/headless/ "2026-10-20") [headless mode](https://antigravity.google/docs/cli/headless/) — agent-mode setup (docs read, commands not run).
- ^[confirmed](https://antigravity.google/docs/cli/modes/ "2026-10-20") [Antigravity CLI modes](https://antigravity.google/docs/cli/modes/) — the terminal sandbox is off by default in the CLI; sandboxed commands have no network (docs read, not run).
- ^[confirmed](https://github.com/more-itertools/more-itertools "2026-10-20") [more-itertools](https://github.com/more-itertools/more-itertools) — the public repo we used to test the mock-repo recipe (fixes `67fcf64` and `d71c4ad`, history at `4aeb433`). We also ran the Step 1 filter on [itsdangerous](https://github.com/pallets/itsdangerous).
- ^[inference](- "2026-10-20") Commands, the mock-repo recipe, `stress.py` and the toy-repo checks on this page were run on 2026-10-20 on an arm64 Mac (zsh, Python 3.13.9, pytest 9.1.1, Node v22.21.1). The portfolio-repo commands were not run by the playbook's authors; you run them.

:::check
- Explain, in three sentences, which interview facts are confirmed, which are reported, and which are only practice formats.
- Build a fresh practice repo with `mockrepo.sh`, check that its hidden tests fail on the base, and explain why the answer diff lives outside `mock/`.
- Solve Part 1 of the as-of lookup without AI in 20 minutes, then pass `stress.py` on two seeds.
- Run one mock in each of the three modes and score it with the right rubric.
- Tell two STAR stories from audits of your own commits, each with a number you measured.
- Recite the closing five sentences from the Say it out loud card without reading.
:::
