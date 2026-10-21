---
title: Start here
short: Start here
summary: Learn what the Polaris job asks for and which facts are solid. Then pick your route to Nov 2 and set up your tools on day 1.
---

:::selfcheck
- Say in two sentences what a Polaris task is. || A prompt that asks Gemini to do a realistic, long software-engineering job, plus a grader or rubric that turns the attempt into a number. The team builds a few such tasks by hand instead of many synthetic ones.
- Name the three signals this playbook tries to produce, and where each one is built. || One hard, well-validated eval task (Chronos, [[capstone]]). A record of catching real coding-agent failures ([[agent-patch-audit]] plus your mistake log). Strong unaided interview performance ([[interview]], [[defend-it]]).
- Which interview format is confirmed for Polaris, and what is GDM's default rule on AI tools? || No Polaris format is confirmed. No first-hand Polaris interview report was found on X, Blind, Reddit, LinkedIn or Glassdoor as of 2026-10-20. GDM's rule is confirmed: you may use AI to prepare, but unless you are told otherwise, no AI tools in live interviews or interview tasks. Google's AI-assisted round is reported. The 60-minute three-phase round is Meta's.
- A headless `agy` run exits with code 0. Is the job done? How do you check? || Not necessarily. Read the `status` field of the JSON output (only `SUCCESS` counts), save stderr (the docs say soft-denied tools print a notice there), and re-run the checks yourself.
- What must you do before you call Chronos "my project"? || Pass the ownership gate: reproduce a grader-detected failure, diagnose it with file:line, change the grader and show it catches a new wrong solution, and defend the design aloud.
- Open your `agy-notes.md`. Read out the exit code, `status` and stderr notice of your own soft-deny run, and the date you applied (or your fixed slot on or before Fri Oct 23). || Tick this only if all of it is written down from a real run and a real plan. If not, do the [[start-here#day-1|Day-1 checklist]] and the [[start-here#drill-apply-by-oct-23|apply drill]] first. You cannot test out of them from memory.
:::

## Why Polaris cares

Polaris engineers build tasks that measure how well Gemini does long software-engineering work ^[confirmed](https://www.google.com/about/careers/applications/jobs/results/114077679900074694-research-engineer-polaris-deepmind "2026-10-20").
The team builds a few realistic tasks by hand, and one task takes about a week ^[confirmed](https://www.google.com/about/careers/applications/jobs/results/114077679900074694-research-engineer-polaris-deepmind "2026-10-20").
So the hiring question is narrow: can you build such a task, and can you tell when an agent's work is wrong?
Google DeepMind (GDM) also interviews without AI by default ^[confirmed](https://storage.googleapis.com/deepmind-media/DeepMind.com/Assets/Docs/interviewing-at-google-deepmind.pdf "2026-10-20").
This chapter points every hour you spend at evidence for those questions. Everything else is optional.

## The three signals {#signals}

This playbook aims at three kinds of evidence ^[inference](- "2026-10-20"). Each one answers part of the hiring question above.

| Signal | Where you build it | Evidence you end with |
|---|---|---|
| 1. One hard, well-validated SWE eval task | [[task-design]], [[grader-validity]], [[capstone]] | The task, a Grader Validity Card with stated sampling frames, and a passed ownership gate |
| 2. A record of diagnosing real coding-agent failures | [[agent-patch-audit]], [[prove]], [[debug]] | A mistake log: each catch with its type, the step that caught it, and the minutes it took |
| 3. Strong unaided interview performance | [[interview]], [[defend-it]] | Timed mock scores and a list of weak answers you fixed |

If an hour does not move one of these, skip it.

## The job, decoded {#the-job-decoded}

Read the posting yourself first: [Research Engineer, Polaris](https://www.google.com/about/careers/applications/jobs/results/114077679900074694-research-engineer-polaris-deepmind).
Below is our paraphrase, checked on 2026-10-20. Nothing here copies the posting.

| The posting says (paraphrase) | What it means for your prep | Where you train it |
|---|---|---|
| You design tasks that test Gemini on software engineering. A task is a prompt plus a grader or rubric. | You must write precise prompts and graders that give the right number. | [[task-design]], [[grader-validity]] |
| The team hand-builds a small number of realistic, complex tasks, about one week each. | Quality beats volume. One validated task is worth more than ten quick ones. | [[capstone]] |
| Tasks measure **long-horizon** software engineering. | Long-horizon means many steps over hours or days. You must audit long agent runs, not just one-line fixes. | [[change]], [[prove]] |
| You find weaknesses of the latest models. | You read transcripts and name the first wrong turn. | [[runs-and-weaknesses]] |
| You build data and pipelines that improve Gemini. | Your graders may be used under training pressure, so they must resist cheating. | [[grader-validity]], [[runs-and-weaknesses]] |
| Minimum: experience with AI coding agents; strong analysis and problem solving. | Show concrete agent work you checked yourself. | [[agent-patch-audit]] |
| Preferred: competitive programming or math olympiads (IMO, USAMO, Putnam, IOI). | A short algorithms track helps in no-AI rounds. | [[unfamiliar-stacks]] |
| No degree and no prior work experience required. | Your evidence is what you build and how you defend it. | [[defend-it]] |

An aggregator page that links to this job shows different text. It adds qualifications (software development experience, hackathons, rubric and benchmark design) and shows a lower base range, $147k–$210k ^[reported](https://www.globalsouthopportunities.com/2026/10/11/engineer/ "2026-10-20").
The official page showed none of these extras on 2026-10-20. Trust the official page.

**Pay.** The posting showed a base range of $164k–$252k when we checked it ^[confirmed](https://www.google.com/about/careers/applications/jobs/results/114077679900074694-research-engineer-polaris-deepmind "2026-10-20").
It also shows total compensation of $550k–$1.1M, including a 15% target bonus, equity and a sign-on bonus ^[confirmed](https://www.google.com/about/careers/applications/jobs/results/114077679900074694-research-engineer-polaris-deepmind "2026-10-20").
Tamay Besiroglu's hiring post on X gives the same total ^[reported](https://x.com/tamaybes/status/2108803217505362105 "2026-10-20").
Recheck the official page before you rely on any number.

### Words you need

| Word | Meaning here |
|---|---|
| **eval task** | One test case for a model: a prompt, an environment (repo plus tools), and a grader. |
| **grader** | The code that scores an attempt, for example 0 to 1. |
| **rubric** | A written list of criteria a human or model judge scores against. |
| **long-horizon** | Work that needs many steps over hours or days, with milestones. |
| **harness** | The program that sets up a clean workspace, runs the agent, and grades the result. |
| **hidden tests** | Grader tests the agent never sees. They catch solutions tuned to the visible tests. |
| **reward hacking** | The agent raises its score without doing the task, for example by editing tests. |
| **contamination** | The model saw the task or its answer during training, so a pass proves little. |

## Facts that shape your prep {#facts}

Every claim on this site carries a status. **Confirmed** means we read the primary source. **Reported** means a secondary source says it. **Inference** means it is our reasoning. Recheck before you act: tools and hiring processes change.

| Fact | Status | What you do about it |
|---|---|---|
| GDM's candidate guide: you may use AI to prepare. Unless told otherwise, no AI tools in live interviews or interview tasks. | ^[confirmed](https://storage.googleapis.com/deepmind-media/DeepMind.com/Assets/Docs/interviewing-at-google-deepmind.pdf "2026-10-20") | Practice in no-AI mode every week. |
| GDM's stages: Initial, Skills, Final, then Decision and offer. It takes 4–10 weeks. The guide recommends the STAR method. | ^[confirmed](https://storage.googleapis.com/deepmind-media/DeepMind.com/Assets/Docs/interviewing-at-google-deepmind.pdf "2026-10-20") | Apply early. Keep preparing while the process runs. |
| No first-hand Polaris interview report was found on X, Blind, Reddit, LinkedIn or Glassdoor. | ^[inference](- "2026-10-20") | Distrust any "Polaris interview format" you read. Ask the recruiter. |
| Candidates report GDM Research Engineer loops on other teams (2021–2026): coding rounds at LeetCode medium to hard, where the code must run, plus ML fundamentals and ML design. Nothing shows Polaris uses the same loop. | ^[reported](https://www.teamblind.com/post/deepmind-research-engineer-interview-process-wp1gjgyb "2026-10-20") ^[reported](https://www.teamblind.com/browse/Deepmind-Interview-73684 "2026-10-20") ^[reported](https://www.glassdoor.com/Interview/Google-DeepMind-Interview-Questions-E1596815.htm "2026-10-20") | Do some no-AI algorithms every day from day 1: the sprint's 2 hours, then 15 minutes a day. Ask the recruiter which rounds Polaris uses. If ML rounds are confirmed, use [[unfamiliar-stacks#ml-basics\|the ML basics list]]. |
| Google pilots an AI-assisted "code comprehension" round: read, debug and optimize code with Gemini. Junior and mid roles, select US teams, H2 2026. No source names DeepMind. | ^[reported](https://www.entrepreneur.com/business-news/google-is-testing-a-new-rule-transform-job-interviews "2026-10-20") | Practice chat-only mode. Validate every AI answer out loud. |
| The "60 minutes: fix a bug, build a feature, optimize" format is Meta's AI-enabled round. | ^[reported](https://www.hellointerview.com/blog/meta-ai-enabled-coding "2026-10-20") | Use it as a practice format only, labeled as Meta's. |
| Mechanize's own interview: a 30-minute call, then a 4-hour take-home, then a 1-hour final. The take-home is a 3-hour build with AI tools strongly encouraged, plus a recorded 1-hour code review with system design. | ^[confirmed](https://www.mechanize.work/how-our-interview-process-works "2026-10-20") | This is Mechanize's process, not Polaris's. Its trait list is a useful proxy. |
| Google made a talent and technology deal with Mechanize in Sept 2026. Mechanize co-founder Tamay Besiroglu, now at GDM, recruits for Polaris "evals and environments" on X. | ^[reported](https://www.businessinsider.com/google-completes-deal-for-ai-agents-startup-mechanize-2026-9 "2026-10-20") ^[reported](https://x.com/tamaybes/status/2105408224879116790 "2026-10-20") | It explains why Mechanize's traits matter. It does not mean Polaris copies Mechanize's interview. |
| Antigravity CLI (`agy`) replaced Gemini CLI on 2026-06-18 for Google AI Pro and Ultra subscribers and for users of the free Gemini Code Assist for individuals. Paid API keys and Code Assist Standard or Enterprise keep Gemini CLI. | ^[confirmed](https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/ "2026-10-20") | Learn `agy`. Do the Day-1 checklist below. |
| Gemini 3.8 Flash is the core agent model on every Antigravity plan. Users without AI Pro or Ultra get a weekly quota. | ^[confirmed](https://antigravity.google/docs/plans "2026-10-20") | Your free runs use Flash. Polaris cares about the newest model: Gemini 4 Argon became GA on 2026-10-13 and is not on the free tier ^[confirmed](https://ai.google.dev/gemini-api/docs/latest-model "2026-10-20"). A task Flash fails may be easy for Argon. Record the exact model ID for every run. Never call a Flash result "Gemini". Check `/usage` on Oct 27, before the Oct 28–29 runs. |
| DeepSWE: 113 hand-written tasks over 91 repos. TypeScript 35, Go 34, Python 34, JavaScript 5, Rust 5. | ^[confirmed](https://deepswe.datacurve.ai/blog/deepswe "2026-10-20") | It is the closest public analogue to Polaris tasks (our inference). Learn to read TypeScript and Go. |
| In one 2026 study, under standard evaluation, three open models attempted shortcuts (upstream lookup, git-history mining, memorized code) in 60.7–90.1% of trajectories on SWE-bench Multilingual and 55.5–89.1% on DeepSWE. The ranges run across the three models. They count attempts, not successful exploits. | ^[confirmed](https://arxiv.org/abs/2609.06780 "2026-10-20") | Isolate every agent run ([[S0]]). Search transcripts for lookups ([[S14]]). |
| "Overselling" (claiming more success than the transcript shows) appeared in 34.7% of 4,788 sessions in the public SWE-chat dataset (1.8% severe). An LLM judge scored each transcript against a rubric. Most sessions used Claude Opus 4.6. | ^[confirmed](https://www.lesswrong.com/posts/smE9h9RnaK7FWKBZ2/measuring-coding-agent-misalignment-in-the-wild-1 "2026-10-20") | Re-run every claimed result yourself ([[S11]]). |

"Tests pass" is evidence, not proof. A finite test suite never proves that a spec is met. This idea returns in every chapter.

## Pick your route {#routes}

All hours on this site are **your** preparation time. The time AI agents spent building this site and Chronos v0 is logged separately, in the capstone's build log. It never counts as your prep.

### Sprint: about 30 hours before Nov 2 {#sprint}

This is our plan for the next 12 days ^[inference](- "2026-10-20"). It spends almost half the time on one validated task, because that is the strongest signal.

| Block | Hours | Chapters | Evidence it produces |
|---|---|---|---|
| Chronos and its grader | 13 | [[capstone]], [[grader-validity]], [[task-design]] | Ownership-gate items 1–4, a Grader Validity Card you can explain |
| Debugging and patch audits | 6 | [[agent-patch-audit]], [[debug]], [[prove]] | A mistake log with real catches |
| No-AI coding and mocks | 5 | [[interview]], [[defend-it]] | Timed mock scores, weak answers fixed |
| Résumé, write-up, application | 4 | this page, [[capstone]] | A submitted application |
| C++ and algorithms | 2 | [[unfamiliar-stacks]] | Warm hands for a no-AI round |
| **Total** | **30** | | |

The [[tracker#sprint|tracker]] adds four 15-minute block reviews, so it counts 31 hours.

| Dates | What you do |
|---|---|
| Oct 20–23 | Placement test, this chapter, the 5-move loop in [[agent-patch-audit]]. Tailor the résumé. Pick your strongest existing project. **Apply by Fri Oct 23.** |
| Oct 24–27 | Own Chronos v0: ownership-gate items 1–2. Read [[task-design]] and [[grader-validity]]. Do Lab F. |
| Oct 28–29 | Run Gemini on Chronos. Analyze the failures. Read [[runs-and-weaknesses]]. |
| Oct 30–31 | One timed no-AI mock. [[defend-it]] drills. Ownership-gate items 3–4. |
| Nov 1–2 | **Protected. No prep, no runs, no reading.** |

That is about 2.5 hours a day. The [[tracker#sprint|tracker]] lists every item with its hours. When this page and the tracker differ, the tracker wins. If you fall behind, use [[tracker#sprint|the tracker's cut order]]: C++ items you have not done, then reading items, then Lab C patches 01–04, then the two-minute round. Never cut the application, ownership-gate items 1–4, Lab F, the harness smoke test, the one no-AI mock or the protected days. Cut scope, not sleep.

### Full route: after you apply {#full-route}

GDM's process takes 4–10 weeks ^[confirmed](https://storage.googleapis.com/deepmind-media/DeepMind.com/Assets/Docs/interviewing-at-google-deepmind.pdf "2026-10-20"). Use that time for the full route.

- Chapters 0–14 add up to about 68–72 hours by our estimates, plus 15 minutes a day of algorithms and 1–7 capstone extension days. The optional [[gpu-practice]] chapter adds 8–15 hours, so about 76–87 hours in all ^[inference](- "2026-10-20").
- At 10 hours a week, chapters 0–14 take about 7 weeks.
- Order: in week 1, read [[interview]], so your weekly mocks have a method. Then Catch (chapters 1–6, with the [[toolbelt]] used just in time), Build (7–9), the rest of Interview (10 and 12), then the capstone extension plan.
- When a recruiter schedules a stage, spend the week before it on [[interview]] and [[defend-it]].
- Every week: Mock 1, Mock 2 and Mock 3, one in each of the three modes. Every other week, swap one of them for Mock 4, the project deep dive. Add a "recheck tools" pass, because `agy` changes weekly ^[inference](- "2026-10-20"). The [[tracker#after-applying|tracker]] holds the weekly plan.
- Send the capstone link to the recruiter when you are contacted, after you pass the ownership gate.

## How the placement page works {#placement-how}

The [[placement]] page builds itself. It collects every self-check from every chapter onto one page.

1. Open it and tick an item only if you can do it **now**, without notes and without AI.
2. Each item hides its answer under "Show the answer". Check yourself after you try.
3. When you tick every item of a chapter, its verdict changes from "study" to "skip". The chapter joins your skip list. This page is the exception in practice: its last item asks for your own Day-1 and application results, so you cannot skip it from memory.
4. The page also shows a rough estimate of the hours left on the full route. It adds up the hours of the chapters you have not skipped. It counts the optional [[gpu-practice]] hours too, so on a fresh start it shows more than the 68–72 hours of chapters 0–14.
5. Each chapter page has a "mark this chapter as tested out" button under its self-check. It has the same effect.
6. Ticks live only in this browser. Export them from the [[tracker]] page now and then.

Be strict. A wrong "skip" costs you more than an hour of review. Retake the test after you apply.

## Apply early {#apply-early}

Our advice: apply by **Fri Oct 23** with your tailored résumé and your strongest existing project ^[inference](- "2026-10-20"). Do not wait for Chronos.

Why early:

- No closing date is posted. Oct 23 is your own target, not a deadline ^[inference](- "2026-10-20").
- The process takes 4–10 weeks, so you keep preparing while it runs ^[confirmed](https://storage.googleapis.com/deepmind-media/DeepMind.com/Assets/Docs/interviewing-at-google-deepmind.pdf "2026-10-20").
- The capstone link can go to the recruiter later, once you pass the ownership gate.

What goes into the application (our advice):

- One bullet on concrete agent work: what you built, what the agent got wrong, how you caught it. The posting's minimum qualification is experience using AI coding agents ^[confirmed](https://www.google.com/about/careers/applications/jobs/results/114077679900074694-research-engineer-polaris-deepmind "2026-10-20").
- Numbers. GDM's guide tells candidates to "include data" to show impact ^[confirmed](https://storage.googleapis.com/deepmind-media/DeepMind.com/Assets/Docs/interviewing-at-google-deepmind.pdf "2026-10-20").
- Any competitive programming or olympiad result. It is a preferred qualification.
- A link to your strongest project, in the résumé header and in its bullet. The form may have no field for links ^[inference](- "2026-10-20").
- Nothing you cannot defend without AI. Do not list Chronos as yours until you pass the gate.

When a recruiter contacts you, ask before each stage: What is the format? Are AI tools allowed? Which language? If you also interview with Google, tell your GDM recruiter: the two run separate processes ^[confirmed](https://storage.googleapis.com/deepmind-media/DeepMind.com/Assets/Docs/interviewing-at-google-deepmind.pdf "2026-10-20"). Ask for a referral only from someone who can vouch for your work, as the guide says.

## Day-1 tool checklist {#day-1}

Every `agy` command here was checked against docs on 2026-10-20, not run. The docs change weekly and sometimes contradict each other ^[inference](- "2026-10-20"). Your job on day 1 is to find out what **your** version really does, and write it down in `agy-notes.md`.

Keep `agy-notes.md` outside the throwaway folder, for example in your notes folder. macOS may delete old temp folders.

Work in a throwaway folder, never in your home folder or the portfolio repo:

```bash
cd "$(mktemp -d)" && git init -q && pwd
```

- [ ] Install `agy`. The docs give a one-line `curl ... | bash` installer. Download it first and read it, then run it:

  ```bash
  curl -fsSL https://antigravity.google/cli/install.sh -o agy-install.sh
  less agy-install.sh
  bash agy-install.sh
  agy --version
  ```

  The docs say the binary goes to `~/.local/bin/agy`. If zsh says `command not found`, add `export PATH="$HOME/.local/bin:$PATH"` to `~/.zshrc`. Also run the same line in this terminal, so you stay in the throwaway folder.
- [ ] Sign in. Run `agy` once. If no saved session exists, the docs say it opens your browser for Google sign-in. Do this yourself; never let an agent sign in for you. When it asks whether you trust the folder, say yes only for the throwaway folder.
- [ ] Save the help text and check each flag this playbook uses:

  ```bash
  agy --help > agy-help.txt 2>&1
  for f in -p --print --prompt --output-format --mode --sandbox \
           --print-timeout --model --dangerously-skip-permissions; do
    if grep -qE -- "(^|[ ,])$f([^a-z-]|\$)" agy-help.txt; then echo "found   $f"
    else echo "MISSING $f"; fi
  done
  ```

  We tested this loop in zsh on a hand-made help file on 2026-10-20, not on real `agy` output. `--print` does not match `--print-timeout`. Write down every flag that is missing. Some chapters depend on them. The docs list `--print` and `--prompt` as aliases of `-p`, so an alias missing from the help may still work. Try it once.
- [ ] Type `/context` in the interactive session. The docs say it shows context-window use and checkpoints. Note what it shows.
- [ ] Type `/agents`. The docs say it opens the subagents panel. Note whether the built-in `research` subagent appears, and how you call it.
- [ ] Try plan mode. Run `ls -la` and save the list. Start `agy --mode=plan` (or press Shift+Tab to cycle modes) and ask it to create `hello.txt`. Then run `ls -la` again. Write down what happened: it only planned, it asked for approval, or it wrote the file. The docs do not say plan mode blocks writes, so never treat it as a safety boundary.
- [ ] Run one headless job and read its `status` field:

  ```bash
  agy -p "In one sentence, what is a git rebase?" --output-format json > run.json 2> run.err
  echo "exit=$?"
  jq -r '.status, .num_turns' run.json
  cat run.err
  ```

  The docs list these statuses: `SUCCESS`, `ERROR`, `CANCELED`, `INTERRUPTED`, `INVALID`, `WAITING`, `RUNNING`. Copy `run.json` to your notes folder; the status-gate drill uses it.
- [ ] Run the soft-deny experiment. The docs say a tool that needs approval nobody gave is "soft-denied": the run goes on, exits 0, and prints a notice on stderr that names the tool. Unconfigured actions, shell commands among them, default to Ask ^[confirmed](https://antigravity.google/docs/permissions?tab=cli "2026-10-20"). Ask for one in headless mode and see what really happens:

  ```bash
  agy -p "Run the shell command ls -la and report the output." --output-format json > deny.json 2> deny.err
  echo "exit=$?"
  jq -r .status deny.json
  cat deny.err
  ```

  Write down the exit code, the status, and the stderr notice. The docs do not say which status a soft-denied run gets. Your run shows what your version does.
- [ ] Check whether `/memory` and `/init` exist. Gemini CLI has both: `/memory show` prints the combined context, and `/init` writes a starter `GEMINI.md`. The `agy` features page does not list either. If they are missing, test your rule file another way. Put one harmless rule in `AGENTS.md`, such as "End every answer with the word PINEAPPLE". Then see whether it obeys. The docs say `agy` reads both `GEMINI.md` and `AGENTS.md`.
- [ ] Type `/permissions` and write down the options. The docs list different names on different pages, so trust only what your screen shows.
- [ ] Type `/model` and `/usage`. Note your default model and your quota. Chronos runs will spend it.
- [ ] Note how you will authenticate for scripted runs. The Plans page says bring-your-own-key for extra rate limits is not offered. The Authenticate page describes an API-key mode: `modelProvider` set to `gemini` in the settings file, plus `GEMINI_API_KEY`. Setting `GEMINI_API_KEY` alone has no effect. Find out which applies to you. Never paste a key into a prompt, a file in a repo, or a chat.

## Three practice modes {#modes}

No public source describes the Polaris interview format ^[inference](- "2026-10-20"). So you train all three modes and ask the recruiter which one each stage uses.

| Mode | What you may use | What it mirrors | Where you practice |
|---|---|---|---|
| **Agent** | A coding agent (`agy`) that reads, runs and edits code. You direct and verify. | Daily Polaris work ^[inference](- "2026-10-20"). Mechanize's take-home, where AI tools are strongly encouraged ^[confirmed](https://www.mechanize.work/how-our-interview-process-works "2026-10-20") | Labs, Chronos, [[agent-patch-audit]] |
| **Chat-only** | An AI chat that can read the code and answer. You type every line yourself. | Meta's AI-enabled round ^[reported](https://www.hellointerview.com/blog/meta-ai-enabled-coding "2026-10-20"). Google's pilot uses Gemini ^[reported](https://www.entrepreneur.com/business-news/google-is-testing-a-new-rule-transform-job-interviews "2026-10-20"). No source we read describes its interface ^[inference](- "2026-10-20") | [[interview\|Interview mocks]] |
| **No AI** | Your head, an editor, and maybe a compiler. | GDM's default rule ^[confirmed](https://storage.googleapis.com/deepmind-media/DeepMind.com/Assets/Docs/interviewing-at-google-deepmind.pdf "2026-10-20") | Algorithms, project deep dive, [[defend-it]] |

One rule holds in every mode: say your own hypothesis first, then check it with a tool. In agent mode, an agent claim is a guess until a deterministic tool confirms it.

## The honesty rule for the capstone {#honesty}

Chronos v0 is built by AI agents that you direct. That is allowed and normal for this job. Hiding it is not.

- Say it in the README and in every interview: "v0 is agent-built. It becomes your project when you pass this gate." The gate is the next item.
- The ownership gate has four parts. You do each one yourself, with no agent:
  1. Reproduce one grader-detected failure from the pilot. Run the grader and see the failing check.
  2. Diagnose it. Explain the root cause in your own words, with file:line, and name the time rule it broke.
  3. Change the grader. Add or change one check, show it catches a new wrong solution you wrote, and re-run the validity card.
  4. Defend the design. Answer 10 questions from the capstone's `DEFEND.md` aloud, without notes. Record the weak answers and fix them.
- On the Oct 23 résumé, leave Chronos out. After you pass the gate, add it with honest wording, for example: "Directed AI coding agents to build Chronos, a long-horizon SWE eval task; reproduced, diagnosed and extended its grader myself."
- Report numbers with their sampling frame. "Rejected 12 of 12 hand-written wrong solutions" is a count, not an error rate. An interval needs a stated random sample.
- The pilot attempts are Claude agents, not Gemini. Label them that way. Never present a synthetic transcript as real model output.
- Solver agents must not see hidden tests, reference solutions or revealing git history. The capstone must report how this was checked. If it does not, treat its pilot numbers as invalid.
- The public playbook and the private benchmark files stay separate. Hidden tests, the oracle and reference solutions never go into this site or any public repo. Nothing is pushed until you approve the staged diff.
- This playbook is public. Anyone with the link can read it, and search engines may list it. It is not linked from the site's main navigation, but that does not make it private.

Why this matters: GDM's default is no AI in interviews. There, only what you understand counts. The gate makes sure you understand all of it. Details are in [[capstone]].

:::compare
- Starts at chapter 1 and reads every page in order. || Takes the placement test, skips what it proves, and spends the hours on the three signals.
- Waits to apply until the capstone is "done". || Applies by Oct 23 with the strongest existing project, and sends the capstone link later.
- Trusts a blog post about "the Polaris interview format". || Separates confirmed, reported and inference, and asks the recruiter about format and AI rules before each stage.
- Copies `agy` commands from memory or a blog. || Runs `agy --help` and records what this version really has.
- Treats exit code 0 from a headless run as success. || Reads `status`, saves stderr, and re-runs the checks itself.
- Calls the agent-built capstone "my project" on day one. || Says "v0 is agent-built", then passes the ownership gate before calling it theirs.
:::

## Drills

:::drill id="decode-posting" title="Decode the posting yourself" time="15 min"
1. Open the [official posting](https://www.google.com/about/careers/applications/jobs/results/114077679900074694-research-engineer-polaris-deepmind). Do not read our table first.
2. In `job-notes.md`, write six lines in your own words: what a task is, what a grader is, the three duties, the minimum qualifications, the preferred ones, and the base pay you see today with the date.
3. Compare with [the job, decoded](#the-job-decoded). Note every difference.

**Done when:** `job-notes.md` has six lines in your words, today's date, and either a list of differences or "none found".
:::

:::drill id="route-and-calendar" title="Take the placement test and fix your route" time="45 min"
1. Do the [[placement]] test. Be strict.
2. Choose the sprint or a lighter plan. Write one sentence on why.
3. Put the sprint blocks into your calendar, Oct 20–31. Block Nov 1–2 as protected.
4. Write your skip list at the top of your notes.

**Done when:** your calendar has the blocks, Nov 1–2 are empty of prep, and your skip list is written down.
:::

:::drill id="day-one-agy" title="Day-1 agy check" time="45 min"
Work through the [Day-1 tool checklist](#day-1) in a throwaway folder. Keep `agy-notes.md` open, outside that folder, and write as you go.

**Done when:** `agy-notes.md` records your `agy` version, the missing flags, what `/context` and `/agents` show, whether `/memory` and `/init` exist, the plan-mode result, one headless `status`, and the exit code, status and stderr of the soft-deny experiment.
:::

:::drill id="status-gate" title="Write a status gate for headless runs (no AI)" time="20 min"
Eval harnesses usually run agents headless ^[inference](- "2026-10-20"). A harness that trusts exit code 0 will count failed runs as successes. This drill is not in the sprint plan ([[tracker#block-1|tracker]]). Do it after you apply.

1. Without AI, write `agy_status.py`. It reads one JSON file, prints the status, and exits 0 only if `status` is `SUCCESS`. A missing status must fail.
2. Test it on three hand-made files: one `SUCCESS`, one `INTERRUPTED`, one with no `status` field.
3. Then test it on the real `run.json` from the Day-1 check.

**Done when:** your script exits 0 for the success file and 1 for the other two, and you ran it on one real `agy` output.

:::reveal title="Show our version and its real output"
```python
"""Exit 0 only if an agy headless JSON result says status == SUCCESS."""
import json
import sys

with open(sys.argv[1]) as f:
    result = json.load(f)
status = result.get("status", "MISSING")
print(f"status={status} turns={result.get('num_turns')}", flush=True)
if status != "SUCCESS":
    print(f"error={result.get('error', '(none given)')}", file=sys.stderr)
    sys.exit(1)
```

We ran it on 2026-10-20 with Python 3.13.9 on three **hand-made** files. They use the field names from the docs. They are not real `agy` output. The docs define `num_turns` as the number of user turns, so a single `-p` run has 1.

```bash
echo '{"status":"SUCCESS","response":"hand-made example","num_turns":1}' > ok.json
echo '{"status":"INTERRUPTED","error":"hand-made example","num_turns":1}' > bad.json
echo '{"response":"hand-made example"}' > nostatus.json
```

```text
$ python3 agy_status.py ok.json; echo "exit=$?"
status=SUCCESS turns=1
exit=0
$ python3 agy_status.py bad.json; echo "exit=$?"
status=INTERRUPTED turns=1
error=hand-made example
exit=1
$ python3 agy_status.py nostatus.json; echo "exit=$?"
status=MISSING turns=None
error=(none given)
exit=1
```

A status gate is necessary, not enough. The docs do not say which `status` a soft-denied run gets, so it may still be `SUCCESS`. Your soft-deny experiment shows what your version does. So a real harness also saves stderr and runs the grader itself.
:::
:::

:::drill id="apply-by-oct-23" title="Apply by Oct 23" time="2.5 h"
1. Pick your strongest existing project. Write two sentences on what you built and what you checked yourself.
2. Open `audit-01.md`, the audit of one of your own agent-built commits from the [[agent-patch-audit#drill-audit-01|audit-01 drill]]. It is a separate 3-hour item in [[tracker#block-1|the tracker]], so do it before this drill. Its hours are not part of this drill's 2.5 hours. If it found nothing wrong, it says how you checked. Never invent a catch.
3. Write one résumé bullet from that audit: what you built, what the agent got wrong, and how you caught it. Use a real number. A possible shape: "Built [project] with [agent]; caught [N] agent mistakes (for example, a symptom-only fix and deleted logic) by re-running tests and reading diffs." If the audit found nothing, describe how you checked instead.
4. Put your strongest project's link in the résumé header and in its bullet. The form may have no field for links.
5. Remove any claim you could not defend in a no-AI interview.
6. Submit the application yourself on the official page.
7. Log the date and the résumé version in your notes. Write down your three questions for the recruiter.

**Done when:** you have `audit-01.md`, you have submitted the application, saved the exact résumé you sent, and written down the date and your three recruiter questions.
:::

## Sources

- Google Careers, Research Engineer, Polaris, Google DeepMind (job 114077679900074694; duties, qualifications, base and total pay) ^[confirmed](https://www.google.com/about/careers/applications/jobs/results/114077679900074694-research-engineer-polaris-deepmind "2026-10-20")
- Google DeepMind, *Interviewing at Google DeepMind* (candidate guide, PDF) ^[confirmed](https://storage.googleapis.com/deepmind-media/DeepMind.com/Assets/Docs/interviewing-at-google-deepmind.pdf "2026-10-20")
- Google Developers Blog, transition from Gemini CLI to Antigravity CLI (2026-05-19) ^[confirmed](https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/ "2026-10-20")
- Antigravity docs, Getting started (install, `agy --version`) ^[confirmed](https://antigravity.google/docs/getting-started/ "2026-10-20")
- Antigravity docs, Authenticate (API-key mode, `modelProvider`) ^[confirmed](https://antigravity.google/docs/install/ "2026-10-20")
- Antigravity docs, CLI features (`/context`, `/agents`, `/permissions`, `/model`, `/usage`) ^[confirmed](https://antigravity.google/docs/cli/features "2026-10-20")
- Antigravity docs, Subagents (built-in `research`) ^[confirmed](https://antigravity.google/docs/subagents/ "2026-10-20")
- Antigravity docs, Permissions (unconfigured actions default to Ask) ^[confirmed](https://antigravity.google/docs/permissions?tab=cli "2026-10-20")
- Antigravity docs, Execution modes (`--mode=plan`, Shift+Tab) ^[confirmed](https://antigravity.google/docs/cli/modes/ "2026-10-20")
- Antigravity docs, Headless mode (`-p` and its aliases, `--output-format json`, `status`, `num_turns`, soft-deny) ^[confirmed](https://antigravity.google/docs/cli/headless/ "2026-10-20")
- Antigravity docs, Plans (core agent model, weekly quota, no BYOK for extra rate limits) ^[confirmed](https://antigravity.google/docs/plans "2026-10-20")
- Antigravity docs, migrating from Gemini CLI (`GEMINI.md` and `AGENTS.md`) ^[confirmed](https://antigravity.google/docs/cli/gcli-migration "2026-10-20")
- Gemini API docs, latest model (Gemini 4 Argon GA on 2026-10-13, not on the free tier) ^[confirmed](https://ai.google.dev/gemini-api/docs/latest-model "2026-10-20")
- Gemini CLI docs, commands (`/memory`, `/init`) ^[confirmed](https://geminicli.com/docs/reference/commands "2026-10-20")
- Mechanize, How our interview process works ^[confirmed](https://www.mechanize.work/how-our-interview-process-works "2026-10-20")
- Business Insider, Google completes deal for Mechanize (Sept 2026) ^[reported](https://www.businessinsider.com/google-completes-deal-for-ai-agents-startup-mechanize-2026-9 "2026-10-20")
- Tamay Besiroglu on X, Polaris "evals and environments" post (2026-09-30) ^[reported](https://x.com/tamaybes/status/2105408224879116790 "2026-10-20")
- Tamay Besiroglu on X, Polaris hiring post with total compensation (2026-10-10) ^[reported](https://x.com/tamaybes/status/2108803217505362105 "2026-10-20")
- Entrepreneur, summary of Business Insider's report on Google's AI-assisted interview pilot ^[reported](https://www.entrepreneur.com/business-news/google-is-testing-a-new-rule-transform-job-interviews "2026-10-20")
- Hello Interview, Meta's AI-enabled coding round ^[reported](https://www.hellointerview.com/blog/meta-ai-enabled-coding "2026-10-20")
- Blind, a GDM Research Engineer interview report (2021, comments to 2023) ^[reported](https://www.teamblind.com/post/deepmind-research-engineer-interview-process-wp1gjgyb "2026-10-20")
- Blind, DeepMind interview posts (2024 Research Engineer loop) ^[reported](https://www.teamblind.com/browse/Deepmind-Interview-73684 "2026-10-20")
- Glassdoor, Google DeepMind interview reports (2026 Research Engineer loops) ^[reported](https://www.glassdoor.com/Interview/Google-DeepMind-Interview-Questions-E1596815.htm "2026-10-20")
- Aggregator page that links to the job (different qualifications, lower base range) ^[reported](https://www.globalsouthopportunities.com/2026/10/11/engineer/ "2026-10-20")
- Datacurve, DeepSWE ^[confirmed](https://deepswe.datacurve.ai/blog/deepswe "2026-10-20")
- Ludwig et al., *Shortcutting the Fix* (arXiv 2609.06780; three open models, standard evaluation) ^[confirmed](https://arxiv.org/abs/2609.06780 "2026-10-20")
- Transluce, *Measuring coding agent misalignment in the wild* (SWE-chat, n = 4,788, LLM judge with a rubric) ^[confirmed](https://www.lesswrong.com/posts/smE9h9RnaK7FWKBZ2/measuring-coding-agent-misalignment-in-the-wild-1 "2026-10-20")

:::check
- You can name the three signals and the chapter that builds each one.
- You have applied, or you have a fixed slot on or before Fri Oct 23 to do it.
- Your `agy-notes.md` answers every Day-1 item, including the soft-deny experiment.
- You can say, for any practice session, which mode it uses and which real format it mirrors.
- You can recite the four ownership-gate steps from memory.
:::
