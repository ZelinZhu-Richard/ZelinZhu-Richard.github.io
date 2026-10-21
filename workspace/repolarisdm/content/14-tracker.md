---
title: Tracker and schedule
short: Tracker
summary: Know what to do on each day until Nov 2, what comes after you apply, and how to run the Chronos extension. Log only your own hours and review them every week.
---

:::selfcheck
- Name your next three tasks, with their dates and hours. || Find today's block in [[tracker#sprint|the sprint]]. Your next three tasks are its first three unticked items. On Tue Oct 20 they are: the placement test and Start here (1.5 h), the Day-1 `agy` check (1 h), and the 5-move loop (3 h).
- Which days are protected, and what do you do on them? || Sun Nov 1 and Mon Nov 2, for school deadlines. No prep, no Gemini runs, no reading.
- Say how the sprint hours split. || Chronos and its grader 13 h, debugging and patch audits 6 h, no-AI coding and mocks 5 h, résumé and application 4 h, C++ and algorithms 2 h. That is 30 h, plus 1 h of block reviews.
- It is Tue Oct 27, evening. The block-2 C++ and Lab C items are still open, and you are 3 hours behind. What do you cut? || Follow the cut order. The open C++ items (1 h now, 0.5 h on Oct 28–29), then half of the [[runs-and-weaknesses]] reading (0.5 h), then Lab C patches 01–04 (1 h). That is 3 h. Never the gate, Lab F, the application or Nov 1–2.
- An agent worked 6 hours on Chronos for you today. How many prep hours do you log? || Zero. Agent time lives in `BUILD_LOG.md`. Your log holds only the minutes you worked yourself.
- When do you send the Chronos link to a recruiter? || When a recruiter contacts you, and only after you pass the ownership gate. Send the public part only, after you run the leak check in Day 7 of the [final project](#final-project).
:::

## Why Polaris cares

One Polaris task takes about a week from idea to approval ^[confirmed](https://www.google.com/about/careers/applications/jobs/results/114077679900074694-research-engineer-polaris-deepmind "2026-10-19").
So the job rewards finishing one validated thing, not starting ten.
GDM's hiring process takes 4–10 weeks, depending on the role, and can take longer ^[confirmed](https://storage.googleapis.com/deepmind-media/DeepMind.com/Assets/Docs/interviewing-at-google-deepmind.pdf "2026-10-20"). So you keep preparing after you apply.
Your tools also move fast: the Antigravity CLI went from v1.2.8 (Sep 22) to v1.4.0 (Oct 16, 2026) ^[confirmed](https://antigravity.google/docs/changelog "2026-10-20").
This page keeps your hours on the three signals, keeps your own time apart from agent time, and makes you recheck your tools every week.

## How this page works {#how-it-works}

- Every checkbox on this page is saved. Ticks live only in this browser.
- All hours are **your** preparation time. Agent time is never counted here. See [two clocks](#two-clocks).
- Keep one notes folder that lasts: `mkdir -p ~/polaris-notes`. It sits outside the portfolio repo and outside the capstone. Keep `prep-log.csv`, `prep_hours.py`, `agy-notes.md`, the `agy-help-*.txt` files and your master `mistakes.csv` there. After each audit, copy its new mistake rows into the master file.
- At the bottom, the page lists every drill from every chapter. Ticking a drill there also ticks it on its chapter page.
- Under that list are the backup buttons. Export your progress at every weekly review.

## Sprint: Oct 20 – Nov 2 {#sprint}

About 30 focused hours over 12 days, then two protected days ^[inference](- "2026-10-20").
It spends 13 of 31 hours (about 42%) on Chronos, more than any other category ^[inference](- "2026-10-20"). One validated task is the strongest signal.

| Category | Hours | Log it as | Signal it builds |
|---|---|---|---|
| Chronos and its grader | 13 | `chronos` | 1. A validated eval task |
| Debugging and patch audits | 6 | `audits` | 2. Diagnosed agent failures |
| No-AI coding and mocks | 5 | `mocks` | 3. Unaided interviews |
| Résumé, write-up, application | 4 | `application` | Gets you into the process |
| C++ and algorithms | 2 | `algorithms` | 3. Unaided interviews |
| Block reviews (4 × 15 min) | 1 | `review` | Keeps the plan honest |
| **Total** | **31** | | |

| Dates | Hours | Focus | Evidence when the block ends |
|---|---|---|---|
| Tue Oct 20 – Fri Oct 23 | 8.5 | Placement test, [[start-here]], the 5-move loop in [[agent-patch-audit]], résumé. **Apply by Fri Oct 23.** | Skip list, `agy-notes.md`, `audit-01.md`, a submitted application |
| Sat Oct 24 – Tue Oct 27 | 10 | [[task-design]] and [[grader-validity]], then own Chronos v0: ownership-gate items 1–2. Lab F, a harness smoke test. | Saved failing-check output, a written diagnosis with file:line, Lab F done, one graded test attempt |
| Wed Oct 28 – Thu Oct 29 | 5 | Gemini runs on Chronos, failure analysis, [[runs-and-weaknesses]]. | A run log with raw outcomes, one label per attempt (passes too) |
| Fri Oct 30 – Sat Oct 31 | 6.5 | One timed no-AI mock, [[defend-it]] drills, ownership-gate items 3–4. | Mock score, a new grader check, 10 recorded answers |
| Sun Nov 1 – Mon Nov 2 | 0 | **Protected for school deadlines.** | Nothing. A recruiter message can wait until Tue Nov 3. |

Block hours do not include the 15-minute review at the end of each block. That is about 2–3 hours a day. Oct 30–31 is the heaviest stretch at about 3.25 hours a day, so do not let earlier work slide into it.

**Cut order** if you fall behind. Cut from the top. Stop when you have the hours back.

1. C++ items you have not done (up to 2 h).
2. Reading items: read only the sections each item links in [[task-design]], [[grader-validity]] and [[runs-and-weaknesses]] (up to 2 h).
3. Lab C patches 01–04 in block 2 (1 h).
4. The two-minute round in block 4 (35 min). Keep the own-words drill: it prepares gate item 4.

Never cut: the application, gate items 1–4, Lab F, the harness smoke test, the one no-AI mock, Nov 1–2. Cut scope, not sleep.

### Oct 20–23: start and apply (8.5 h) {#block-1}

- [ ] Take the [[placement]] test and read [[start-here]]. Write your skip list. This counts as application time: Start here decodes the posting and plans your application. *1.5 h · application*
- [ ] Do the [[start-here#day-1|Day-1 agy check]] (45 min). Then read [[runs-and-weaknesses#spike|the run-path table]] and write in `agy-notes.md` which path you will try first (15 min). You need both for the Gemini runs. *1 h · chronos*
- [ ] Learn the 5-move loop and the [[S0]]–[[S15]] table in [[agent-patch-audit]]. Use the loop on one of your own agent-built commits and write `audit-01.md`. *3 h · audits*
- [ ] Tailor the résumé, pick your strongest existing project, and submit the application yourself by Fri Oct 23 ([[start-here#drill-apply-by-oct-23|the apply drill]]; it uses `audit-01.md` from the item above). *2.5 h · application*
- [ ] Set up `template.cpp`, then two CSES Introductory problems, timed, no AI ([[unfamiliar-stacks#sprint-2h|the 2 sprint hours]]). *0.5 h · algorithms*
- [ ] Block review on Fri Oct 23. *15 min · review*

### Oct 24–27: own Chronos v0 (10 h) {#block-2}

Chronos v0 is agent-built. It becomes your project when you pass [[start-here#honesty|the ownership gate]]. Read first. Then do the gate items yourself, without AI.

If Chronos v0 or its pilot results are not ready on Sat Oct 24, do the two readings, Lab F and Lab C first. Move gate items 1–2 to Mon–Tue. If Chronos is still not ready on Tue Oct 27, gate items 1–2 move to Day 1 of the [final project](#final-project).

- [ ] [[task-design]]: [[task-design#anatomy|task anatomy]], [[task-design#harbor|the Harbor layout]], and [[task-design#zero|why a 0% task is usually a broken task]]. *1 h · chronos*
- [ ] [[grader-validity]]: [[grader-validity#classifier|false accepts and false rejects]], [[grader-validity#sampling-frames|sampling frames]], [[grader-validity#four-times|the four times]] and [[grader-validity#metamorphic|future-invariance]]. *1.5 h · chronos*
- [ ] Gate item 1 (no AI): pick one failed attempt from the **pilot**, the Claude agents that tried Chronos during the build. Run the grader yourself and save the failing check's output. *1.5 h · chronos*
- [ ] Gate item 2 (no AI): explain the root cause in your own words, with file:line, and name the time rule it broke. The time rules come from the four times: event time, publication time, revision availability (each vintage counts only from its own `published_at`), and as-of time (a vintage counts only if `published_at <= asof`). *1.5 h · chronos*
- [ ] Lab F ([[grader-validity#lab-f|Break the Grader]]). Its time box is 3 hours. Stop at 2 hours, write down where you are, and finish it after you apply. *2 h · chronos*
- [ ] Harness smoke test: one attempt on Chronos through the capstone harness, and the [tool recheck](#recheck-tools) with your quota written down. *30 min · chronos*
- [ ] [[prove#lab-c|Lab C]], patches 01–04 ([[lab:lab-c]]): judge each one and name the step that catches it. *1 h · audits*
- [ ] The stress-test drill and two Sorting and Searching problems, timed, no AI ([[unfamiliar-stacks#sprint-2h|the 2 sprint hours]]). *1 h · algorithms*
- [ ] Block review on Tue Oct 27. *15 min · review*

### Oct 28–29: run Gemini, read the failures (5 h) {#block-3}

- [ ] Run Gemini on Chronos (`agy` paths checked against docs on 2026-10-20, not run). First, run the reference solution and a do-nothing agent through the same harness. They must score 1 and 0 ([[runs-and-weaknesses#toy-baselines|baselines first]]). Then run 5 attempts of one **configuration**: one model, one effort level, one harness, one prompt. Write all four in the run log, as in [[runs-and-weaknesses#run-frame|the frame sentence]]. Use the capstone harness. It copies only the task's starting snapshot into a fresh temp folder with a new git history. So the agent never sees the capstone's grader, reports or results. Try three paths in order ([[runs-and-weaknesses#harness-paths|run paths]]): `agy` headless JSON, then the Managed Agents API, then interactive `agy` runs with saved transcripts. Write down which path worked. *1.5 h · chronos*
- [ ] Label every attempt, passes too, with the [[runs-and-weaknesses#label-schema|label schema]]. First decide whether the grader was right (**adjudication**: agree, false accept or false reject). A false reject is a grader bug: fix the grader before you call it a Gemini weakness. A false accept is a grader bug too: the attempt passed but breaks the spec. Then, for real failures, write: the **first wrong turn** (the first step where the agent's belief left the evidence), the **phase** (localize, repair or verify), the mistake-card row ([[M1]]–M10), and an isolation verdict from a transcript scan for lookups ([[M7]]). See [[S14]]. *2 h · audits*
- [ ] [[runs-and-weaknesses]]: [[runs-and-weaknesses#pass-k|pass@k against pass^k]], and [[runs-and-weaknesses#five-runs|why five runs are too few]]. *1 h · chronos*
- [ ] One timed problem, no AI. Say the complexity out loud before you code ([[unfamiliar-stacks#sprint-2h|the 2 sprint hours]]). *0.5 h · algorithms*
- [ ] Block review on Thu Oct 29. *15 min · review*

A long run can take an hour of wall-clock time ^[inference](- "2026-10-20"). That is machine time. Log only the minutes you spend setting it up and reading it. Headless `agy -p` stops waiting after 5 minutes by default. The flag is `--print-timeout`, and its default is written `5m`. Set a longer timeout yourself ^[confirmed](https://antigravity.google/docs/cli/headless/ "2026-10-20"). This was checked against docs on 2026-10-20, not run.

Report raw outcomes first. Five attempts give a wide interval: 3 successes out of 5 gives a Wilson 95% interval of about 23%–88% ^[inference](- "2026-10-20"). We computed it with the Wilson score formula. It assumes independent attempts with one fixed success chance. Its frame is "5 attempts, one configuration, one task". It says nothing about Gemini in general.

### Oct 30–31: mock, defend, finish the gate (6.5 h) {#block-4}

- [ ] [[interview#mocks|Mock 3, no-AI algorithms]], timed and scored from the recording. *1.5 h · mocks*
- [ ] [[defend-it#how-to-drill|Defend-it drills]]: one two-minute round drawn from the eight sprint questions (35 min), then the own-words drill (60 min). *1.5 h · mocks*
- [ ] The two-musts drill: answer [[defend-it#q1|Q1]] and [[defend-it#q9|Q9]] cold, 15 min on Oct 30 and 15 min on Oct 31. If you miss a part, do the drill's third day after Nov 2. *30 min · mocks*
- [ ] Gate item 3 (no AI): add or change one grader check. Show it catches a new wrong solution you wrote. Re-run the Grader Validity Card. *1.5 h · chronos*
- [ ] Gate item 4: answer 10 questions from `DEFEND.md` aloud, without notes. Record the weak answers and fix them. *1.5 h · mocks*
- [ ] Block review on Sat Oct 31. Then close the laptop until Tue Nov 3. *15 min · review*

## Weekly review {#weekly-review}

In the sprint, review at the end of each block (15 minutes). After you apply, review once a week (30 minutes) in a fixed slot.

:::drill id="weekly-review" title="Run the weekly review" time="30 min"
1. Export your progress with the backup button at the bottom of this page. Keep the file in `~/polaris-notes`.
2. Run `python3 prep_hours.py prep-log.csv` (see [two clocks](#two-clocks)). After Nov 2, add the Tuesday your week started, for example `python3 prep_hours.py prep-log.csv 2026-11-03`. Compare your hours with the plan, per category.
3. Write one line per signal: what new evidence exists since the last review? A file, a commit, a score. "Read a chapter" is not evidence.
4. Count the new rows in your master [[prove#mistakes-csv|mistakes.csv]]. Turn one row into a task idea.
5. If you are more than 2 hours behind, apply the cut order now. Do not plan to "catch up" on Nov 1–2.
6. Pick your next three tasks. Put each one in your calendar with a date and an hour estimate.
7. Check that your school commitments are still in the calendar and still protected.

**Done when:** the export file is saved, the hours table is printed, you have one evidence line per signal, and your next three tasks are in the calendar.
:::

## Two clocks: your time and build time {#two-clocks}

Two different clocks run in this project. Never add them up.

- **The build clock.** AI agents built this playbook and Chronos v0. Their time is logged per phase in `BUILD_LOG.md`, kept with the capstone.
- **Your clock.** The minutes you work yourself: reading, coding, mocks, judging a transcript, defending a design. You log them in `prep-log.csv`.
- **Machine time in between.** Gemini runs, test suites and grader repeats. Log only the minutes you spend on them, not their wall-clock time.

Why this matters: GDM interviews are no-AI by default ^[confirmed](https://storage.googleapis.com/deepmind-media/DeepMind.com/Assets/Docs/interviewing-at-google-deepmind.pdf "2026-10-20"). Agent hours say nothing about what you can do alone. Once you pass the gate, say it plainly in interviews: "v0 was built by AI agents that I directed. Then I worked without AI. I reproduced one grader-detected failure and traced its root cause to file:line. I wrote a new wrong solution, added a grader check that catches it, and re-ran the validity card."

The log has one row per session:

```text
date,minutes,category,what,evidence
2026-10-20,50,application,placement test and Ch 0,skip list in notes.md
2026-10-20,45,chronos,Day-1 agy check,agy-notes.md
2026-10-21,90,audits,5-move loop on one of my commits,audit-01.md
2026-10-22,30,algorithms,two easy problems in C++,
```

`category` must be one of the six names in the table. `evidence` names the file, commit or score the session produced. If `what` contains a comma, put it in double quotes: `"read Ch 5, part 1"`.

After Nov 2, map new work to the same six names:

- Chapters 1–6, chapter 10, and Labs A, C, D, E and H → `audits`
- Chapters 7–9, Lab F, the capstone, the extension days and [[gpu-practice]] → `chronos`
- Chapters 11–12 and every mock → `mocks`
- C++ problems → `algorithms`
- Reviews, tool rechecks and the placement retake → `review`
- Messages to recruiters and application updates → `application`

```python
"""Sum your own prep minutes by category and compare them with the plan.

Usage: python3 prep_hours.py prep-log.csv [SINCE_DATE]
SINCE_DATE (YYYY-MM-DD) skips older rows. Use it for a weekly review.
Log only your own time. Agent build time and model run time never go here.
"""
import csv
import sys
from collections import defaultdict

PLAN_HOURS = {"chronos": 13, "audits": 6, "mocks": 5, "application": 4,
              "algorithms": 2, "review": 1}

since = sys.argv[2] if len(sys.argv) > 2 else ""
minutes = defaultdict(int)
with open(sys.argv[1], newline="", encoding="utf-8-sig") as f:
    reader = csv.DictReader(f)
    for row in reader:
        line = reader.line_num
        if None in row or None in row.values():
            sys.exit(f"line {line}: needs exactly 5 fields; "
                     "put text with commas in quotes")
        if row["date"] < since:
            continue
        cat = row["category"].strip()
        if cat not in PLAN_HOURS:
            sys.exit(f"line {line}: unknown category {cat!r} on {row['date']}")
        if not row["minutes"].strip().isdigit():
            sys.exit(f"line {line}: minutes must be a whole number")
        if not row["evidence"].strip():
            print(f"no evidence: {row['date']} {cat} {row['what']}",
                  file=sys.stderr)
        minutes[cat] += int(row["minutes"])

total = 0.0
for cat, plan in PLAN_HOURS.items():
    done = minutes[cat] / 60
    total += done
    print(f"{cat:<12} {done:4.1f} h of {plan:>2} h   left {plan - done:4.1f} h")
print(f"{'total':<12} {total:4.1f} h of {sum(PLAN_HOURS.values())} h")
```

`encoding="utf-8-sig"` also reads a CSV saved by Excel or Numbers, which may start with an invisible byte-order mark. We ran the script on 2026-10-20 with Python 3.13.9 on the **hand-made** log above: once in full, once from Oct 21, and once after we added a row with the category `reading`, to check that unknown categories fail.

```text
$ python3 prep_hours.py prep-log.csv; echo "exit=$?"
no evidence: 2026-10-22 algorithms two easy problems in C++
chronos       0.8 h of 13 h   left 12.2 h
audits        1.5 h of  6 h   left  4.5 h
mocks         0.0 h of  5 h   left  5.0 h
application   0.8 h of  4 h   left  3.2 h
algorithms    0.5 h of  2 h   left  1.5 h
review        0.0 h of  1 h   left  1.0 h
total         3.6 h of 31 h
exit=0
$ python3 prep_hours.py prep-log.csv 2026-10-21; echo "exit=$?"
no evidence: 2026-10-22 algorithms two easy problems in C++
chronos       0.0 h of 13 h   left 13.0 h
audits        1.5 h of  6 h   left  4.5 h
mocks         0.0 h of  5 h   left  5.0 h
application   0.0 h of  4 h   left  4.0 h
algorithms    0.5 h of  2 h   left  1.5 h
review        0.0 h of  1 h   left  1.0 h
total         2.0 h of 31 h
exit=0
$ echo '2026-10-22,20,reading,a chapter,notes.md' >> prep-log.csv
$ python3 prep_hours.py prep-log.csv; echo "exit=$?"
no evidence: 2026-10-22 algorithms two easy problems in C++
line 6: unknown category 'reading' on 2026-10-22
exit=1
```

We also tested three bad rows. A row with a field missing and a row with an unquoted comma both stop with `needs exactly 5 fields` and exit 1. A row with `1h` as minutes stops with `minutes must be a whole number`.

After Nov 2, set `PLAN_HOURS` to your weekly targets. Keep all six names; use 0 for a category you skip that week. Then run the script with the Tuesday your week started, as in the [weekly review](#weekly-review).

:::drill id="prep-time-log" title="Start your prep-time log" time="15 min"
1. In `~/polaris-notes` (see [how this page works](#how-it-works)), create `prep-log.csv` with the header row above.
2. Save `prep_hours.py` next to it.
3. Log today's sessions, one row each, with real minutes and real evidence.
4. Run the script. Then add one row with a wrong category and check that the script exits 1. Delete that row.

**Done when:** the script prints your real hours for today, it fails on a wrong category, and no row in the log counts agent or machine time.
:::

## Recheck tools every week {#recheck-tools}

Google's agent tools change several times a week. Between v1.2.8 (Sep 22) and v1.4.0 (Oct 16, 2026), the Antigravity CLI shipped 17 more releases ^[confirmed](https://antigravity.google/docs/changelog "2026-10-20"). The docs sometimes disagree with each other ^[inference](- "2026-10-20"). A command you remember may be gone. So you keep a dated copy of the help text and diff it each week.

:::drill id="recheck-tools" title="Recheck your tools" time="20 min"
Work in `~/polaris-notes`. `agy --version` is in the Getting started docs. `agy --help` is not in the official CLI reference (checked 2026-10-20). Third-party cheat sheets report it ^[reported](https://computingforgeeks.com/antigravity-cli-cheat-sheet/ "2026-10-20"). Neither was run. On your first run, check that `agy --help` prints help and exits. If it does not, copy the text of the in-session `/help` panel into `agy-help-$today.txt` instead. We tested the diff logic in zsh with a stand-in `agy` function.

```bash
today=$(date +%F)
agy --version > "agy-version-$today.txt" 2>&1
agy --help > "agy-help-$today.txt" 2>&1
last=$(ls agy-help-*.txt | sort | tail -n 2 | head -n 1)
diff "$last" "agy-help-$today.txt" && echo "no help changes since $last"
```

On the first run it compares the file with itself. After that, lines that start with `>` are new and lines that start with `<` are gone.

1. Run the block above. Read every changed line.
2. Read the new entries in the [Antigravity changelog](https://antigravity.google/docs/changelog) and the [Gemini CLI changelog](https://www.geminicli.com/docs/changelogs) since your last check.
3. Open the `agy` session in a fresh folder, never in your notes folder: `(cd "$(mktemp -d)" && agy)`. Type `/changelog`, `/model` and `/usage`. The docs say `/changelog` shows the CLI's own release notes and `/usage` shows your quota ^[confirmed](https://antigravity.google/docs/cli/features "2026-10-20"). Write down your default model and your quota before you plan Gemini runs.
4. Run one tiny headless job from the [[start-here#day-1|Day-1 checklist]], in a fresh folder too. Check that the JSON still has a `status` field.
5. Re-open the [official posting](https://www.google.com/about/careers/applications/jobs/results/114077679900074694-research-engineer-polaris-deepmind). Is it still open? Note the pay range and the date.
6. Write every change in `agy-notes.md` with today's date. List any playbook command that no longer works.

**Done when:** today's dated help file is saved, and `agy-notes.md` has a dated entry with: the `agy` version, the number of changed help lines (or "none"), every changelog item that affects a playbook command, your default model, your remaining quota, the `status` value of one headless run, and the posting's state (open or closed, pay range).
:::

## After you apply: 4–10 weeks {#after-applying}

GDM's guide says the process takes 4–10 weeks, depending on the role, and can take longer. The stages are Initial, Skills, Final, then Decision and offer ^[confirmed](https://storage.googleapis.com/deepmind-media/DeepMind.com/Assets/Docs/interviewing-at-google-deepmind.pdf "2026-10-20").
The careers page says the Initial stage is a 30-minute recruiter call, and Skills adds 2–3 more calls. The page adds that the exact steps differ for every role, so ask your recruiter what the Polaris loop looks like ^[confirmed](https://deepmind.google/careers/ "2026-10-20").
The guide does not say whether the 4–10 weeks include the wait before the first call ^[inference](- "2026-10-20"). So plan for the long end. This weekly plan starts on Tue Nov 3. It is our plan for about 10 hours a week ^[inference](- "2026-10-20").

**Every week (about 5.5 h):**

| Item | Time | Why |
|---|---|---|
| Mock 1 (agent), Mock 2 (chat-only) and Mock 3 (no AI). Every other week, swap one for [[interview#mocks\|Mock 4]], the project deep dive on Chronos. | about 3 h | Nobody knows the Polaris format. See [[interview]]. |
| Algorithms, no AI | 15 min a day | The posting prefers competitive-programming or math-olympiad experience ^[confirmed](https://www.google.com/about/careers/applications/jobs/results/114077679900074694-research-engineer-polaris-deepmind "2026-10-19"). Daily practice keeps your no-AI coding sharp. |
| Weekly review and recheck tools | about 50 min | Hours, evidence, next three tasks, tool changes |

**The other 4.5 h go to this queue, top to bottom.** Each line moves at least one signal. The queue will not finish in 4 weeks. It is ordered by signal value, so stop wherever the process stops you.

- [ ] Close any open ownership-gate item first (Day 1 of the [final project](#final-project)).
- [ ] [[map]] with Lab A.
- [ ] [[prove]] with Lab C.
- Final project, Day 2: Gemini runs. Tick it in the final-project list.
- Final project, Day 3: learn from the failures.
- [ ] [[change]], then [[debug]] with Labs E and D.
- [ ] [[task-design]], [[grader-validity]] and [[runs-and-weaknesses]] in full, with every drill done.
- [ ] [[unfamiliar-stacks]] with Lab H. It prepares you for Day 4.
- Final project, Day 4: a second task in another stack.
- [ ] [[interview]] and [[defend-it]] in full.
- Final project, Days 5–7.
- [ ] The [[toolbelt]] sections you still need.
- [ ] [[gpu-practice]], if you have Colab GPU time left.
- [ ] Retake the [[placement]] test. Compare with your first skip list.

**When the process moves:**

- [ ] In the first week after Nov 2, before any recruiter call, record [[interview#pitch|your first two minutes]] (30 min).
- [ ] When a recruiter contacts you, ask about each stage: the format, whether AI tools are allowed, and which language.
- [ ] When a stage is booked, pause the queue. Until that stage, spend the queue hours on one extra mock in the confirmed format, [[interview#mocks|Mock 4 (project deep dive)]] on Chronos, and the [[defend-it#drills|two-minute rounds]].
- [ ] Read the prep material GDM sends for your role. The careers page says invited candidates get it ^[confirmed](https://deepmind.google/careers/ "2026-10-20").
- [ ] If you also interview with Google, tell your GDM recruiter. The two run separate processes ^[confirmed](https://storage.googleapis.com/deepmind-media/DeepMind.com/Assets/Docs/interviewing-at-google-deepmind.pdf "2026-10-20").
- [ ] Send the Chronos link only after you pass the ownership gate and run the Day 7 leak check.

## Final project: the Chronos extension {#final-project}

The capstone, [[capstone]], ends with the ownership gate. The extension makes Chronos stronger after that. Pick one mode:

- **Daily mode:** 30 minutes to 2 hours a day. Work the days in order. One "day" can take several sessions.
- **Full-day mode:** 1 to 7 full days. You can stop after any day. Each day leaves a result you can show.

Do Day 1 first. Day 2 needs Gemini quota, so check `/usage` first (checked against docs on 2026-10-20, not run).

- [ ] **Day 1 · Own it.** Ownership-gate items 1–2, without AI: reproduce one grader-detected failure, then diagnose it with file:line and the time rule it broke. If you passed them in the sprint, tick this and go on.
- [ ] **Day 2 · Gemini runs.** At least 20 attempts per configuration, through the capstone harness, with the baselines first. If you get fewer, report what you have with intervals. Report raw outcomes first, with the frame "N attempts, one configuration, one task". For scale: 10 successes out of 20 gives a Wilson 95% interval of about 30%–70% ^[inference](- "2026-10-20"). Same assumption as before: independent attempts with one fixed success chance.
- [ ] **Day 3 · Learn from the failures.** Label every attempt as in [block 3](#block-3): adjudication first, then first wrong turn, phase and mistake-card row. Turn real Gemini failures into new wrong solutions in the private corpus. Gate item 3 (again, if you did it in the sprint): add a check that catches one of them and re-run the Grader Validity Card.
- [ ] **Day 4 · Task 2.** Build a second task in another stack, for example TypeScript. Validate it with `gvt`, the Grader Validity Toolkit.
- [ ] **Day 5 · Audit public graders.** Apply a defined mutant space to a sample of public Harbor-format tasks. State the frame: which task list, how you sampled it (seed), and which mutation operators. A hand-picked sample gives counts, not rates.
- [ ] **Day 6 · Tech report v1.** Update `REPORT.md`: motivation, time model, grader design, validity results with frames, pilot and Gemini results, threats to validity, and unresolved limitations.
- [ ] **Day 7 · Defend and publish.** Gate item 4 again with new questions. Polish. Choose what to publish: the public part only. Then run the leak check in the capstone repo. Every private file carries a canary GUID line ([[task-design#canary-strings|canary strings]]). Put yours in place of the capital-letter placeholder:

  ```bash
  CANARY='PASTE-YOUR-CANARY-GUID'
  git status --short
  git ls-files | grep -n -i -E 'hidden|oracle|reference|wrong|label|private'
  git grep -n -F -e "$CANARY" HEAD; echo "tree exit=$?"
  git log --all -p | grep -c -F -e "$CANARY"
  ```

  `git status --short` must print nothing: commit or remove every change first. `git ls-files` lists every file a push would publish; open each name the filter prints and confirm it is public. No hidden test, oracle, reference solution, wrong solution or label may be in the list. `git grep` must find nothing (`tree exit=1`), and the history count must be `0`. We ran these lines in zsh on a toy repo on 2026-10-20. Then run the [[task-design#preflight|pre-flight checklist]]. Only then push and send the link.

Hidden tests, the oracle, reference solutions, wrong solutions and adjudication labels never go public. That rule holds on every day.

:::compare
- Counts chapters read as progress. || Counts evidence: a failure reproduced, a grader check added, a mock score.
- Adds the agents' build hours to "hours I put in". || Keeps two clocks: build time in `BUILD_LOG.md`, own time in `prep-log.csv`.
- Fills Nov 1–2 with catch-up work. || Cuts scope in the stated order and keeps the protected days empty.
- Trusts last month's `agy --help`. || Diffs the help text every week and writes the changes down.
- Says "Gemini solved it 60% of the time" after five runs. || Says "3 of 5 attempts, one configuration, one task; Wilson 95% about 23%–88%" ^[inference](- "2026-10-20").
- Counts every failed run as a Gemini weakness. || Adjudicates every attempt first, passes too, and fixes grader false rejects before calling anything a weakness.
- Sends the capstone link the day the agents finish it. || Passes the ownership gate, runs the Day 7 leak check, then sends the public part.
:::

## Sources

- Google Careers, Research Engineer, Polaris, Google DeepMind (job 114077679900074694) ^[confirmed](https://www.google.com/about/careers/applications/jobs/results/114077679900074694-research-engineer-polaris-deepmind "2026-10-19")
- Google DeepMind, *Interviewing at Google DeepMind* (candidate guide, PDF): 4–10 weeks depending on the role, stages, no-AI default, separate Google process ^[confirmed](https://storage.googleapis.com/deepmind-media/DeepMind.com/Assets/Docs/interviewing-at-google-deepmind.pdf "2026-10-20")
- Google DeepMind careers page: what each stage contains, steps differ by role, role prep material ^[confirmed](https://deepmind.google/careers/ "2026-10-20")
- Antigravity changelog, CLI section (v1.2.8 on Sep 22, v1.4.0 on Oct 16, 2026) ^[confirmed](https://antigravity.google/docs/changelog "2026-10-20")
- Gemini CLI changelog ^[confirmed](https://www.geminicli.com/docs/changelogs "2026-10-20"); weekly preview and stable releases ^[confirmed](https://github.com/google-gemini/gemini-cli "2026-10-20")
- Antigravity docs, Getting started (`agy --version`) ^[confirmed](https://antigravity.google/docs/getting-started/ "2026-10-20")
- Antigravity docs, CLI reference (slash commands incl. `/help`; no `--help` flag listed) ^[confirmed](https://antigravity.google/docs/cli/reference/ "2026-10-20")
- Computingforgeeks, Antigravity CLI cheat sheet (reports `--help`) ^[reported](https://computingforgeeks.com/antigravity-cli-cheat-sheet/ "2026-10-20")
- Antigravity docs, Headless mode (`-p`, `--output-format json`, `status`, `--print-timeout` default `5m`) ^[confirmed](https://antigravity.google/docs/cli/headless/ "2026-10-20")
- Antigravity docs, CLI features (`/changelog`, `/model`, `/usage`) ^[confirmed](https://antigravity.google/docs/cli/features "2026-10-20")

:::check
- You can name your next three tasks, their dates and their hours without looking.
- Your calendar shows Nov 1–2 with no prep in it.
- Your `prep-log.csv` holds this week's sessions and no agent or machine time.
- You did the tool recheck this week and wrote the changes in `agy-notes.md`.
- You exported your progress at your last review.
:::
