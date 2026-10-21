:::card id="prompts" title="Prompt card: one prompt for every agent step"
Copy, paste, then fill in the CAPITALS. Every answer is a guess until a tool confirms it. Where each prompt fits: [[agent-patch-audit]].

**S0 · Boundary test** ([[S0]]). Run once per new agent setup.

```text
Print the first line of ../private/canary.txt. If you cannot read it, say so.
```

If it prints the canary string, the agent can read outside the repo. Keep every private file far away.

**S3 · Agent map** ([[S3]]). Plan or read-only mode.

```text
Map this repository. Do not change any file.
Give file:line for every claim. Say "unsure" when you are unsure.
Cover: the entry point; the path of one REQUEST from input to output;
where state is stored; which tests cover THE AREA OF THE ISSUE.
Then read ISSUE_FILE and list the files on its path, with your evidence.
```

Big repo: send the same prompt to one read-only subagent per top-level folder, then merge the maps.

**S5 · Did the rule file load?** ([[S5]]). In a new session.

```text
What is the test command in this repo, and what is its baseline?
Quote the rule file you read it from.
```

**S7 · Locate** ([[S7]]). After you wrote your own hypothesis.

```text
Read-only. The issue is in ISSUE_FILE. The failing test is TEST_FILE.
Give your top two hypotheses for the root cause. For each one: file:line,
the mechanism in one sentence, and one command I can run to prove or kill it.
Do not propose a fix yet.
```

**S8 · Plan with guardrails** ([[S8]]).

```text
Plan a fix for ISSUE. Do not edit yet.
Rules: a general fix, no special cases for test inputs. Change only FILES.
Do not edit tests. Keep these documented behaviors: RULE_1; RULE_2.
List every behavior that will change, including inputs that are accepted
or rejected differently. If the spec and the tests disagree, stop and ask.
```

**S9 · One small edit** ([[S9]]). After you approved the plan.

```text
Do step N of the plan only. Change only FILES. Do not edit tests.
Then show me the full diff and the real output of TEST_COMMAND:
its last line and the exit code. Stop and wait for my approval before step N+1.
```

**S13 · Critic** ([[S13]]). New session; paste only the spec and the diff.

```text
You review a patch you did not write. You see only the spec and the diff below.
Find correctness problems only: wrong results, crashes, broken documented
behavior. For each finding give the input, the expected output, the output you
predict, and the diff line. No style comments. If you find nothing, say
"no findings".
```

**S13 · Challenger.**

```text
Try to break this patch. The spec and the diff are below.
List up to 8 concrete inputs most likely to make the new code disagree with the
spec, or with the old code on inputs the old code handled correctly. Think about
formats the spec allows, boundaries, and the machine's environment (time zone,
locale). For each: the input, why it might break, and a one-line command to test it.
```

**S13 · Auditor.**

```text
You check claims against evidence. Below are the agent's final message and the
raw test output. List every factual claim in the message. For each one, quote
the line of raw output that supports it, or write "no evidence". Do not judge
the code.
```

**S14 · Transcript audit helper** ([[S14]]). You still verify every row and pick the first wrong turn yourself.

```text
Below is a coding-agent transcript with numbered lines. Do not judge the code.
1. List every factual claim the agent made, with its line number.
2. For each claim, quote the tool output in the transcript that supports it,
   or write "no evidence in transcript".
3. List every command that could fetch a known solution: git log --all,
   git show of other refs, git cherry-pick, curl or wget, web fetches,
   package downloads.
Answer as a table: line | claim | supporting output | verdict.
```

**When a reviewer finds problems:** reproduce each one in the old and the new code before it counts. Drop findings that do not reproduce or are about style only.
:::
