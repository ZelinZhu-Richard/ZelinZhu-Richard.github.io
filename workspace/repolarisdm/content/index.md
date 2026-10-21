---
title: Polaris Playbook
summary: A Polaris-only study guide that turns your preparation hours into credible evidence that you can do the job.
---

## The goal: credible evidence {#goal}

This playbook has one job. It helps you produce **credible evidence** that you can do Polaris work: building tasks that measure how well Gemini does software engineering ^[confirmed](https://www.google.com/about/careers/applications/jobs/results/114077679900074694-research-engineer-polaris-deepmind "2026-10-20").

Three signals matter most:

1. **One hard, well-validated software-engineering eval task.** This is the Chronos capstone: a realistic task with a grader that you have tested and can defend.
2. **A defensible record of diagnosing real coding-agent failures.** This comes from the Agent Patch Audit and your mistake log.
3. **Strong unaided interview performance.** That means coding without AI and defending your decisions out loud. GDM's default is no AI tools in interviews ^[confirmed](https://storage.googleapis.com/deepmind-media/DeepMind.com/Assets/Docs/interviewing-at-google-deepmind.pdf "2026-10-20").

Finishing chapters is not the goal. Polishing this website is not the goal. If an hour does not move one of the three signals, skip it.

| Signal | Where you build it | The evidence you end up with |
|---|---|---|
| 1. A validated eval task | [[task-design]], [[grader-validity]], [[capstone]] | A task, a Grader Validity Card with stated sampling frames, and a passed ownership gate |
| 2. Diagnosed agent failures | [[agent-patch-audit]], [[prove]], [[debug]] | A mistake log: each catch with its type, the step that caught it, and the minutes it took |
| 3. Unaided interviews | [[interview]], [[defend-it]] | Timed mock scores and a list of weak answers you fixed |

**The end product** is three finished portfolio projects: two software-engineering eval tasks, a write-up of where agents failed on long tasks, and one finished model-weakness study.
Each has a "Done when" line and fits inside the sprint and the final-project days.
Steps: [[tracker#portfolio-projects|Portfolio projects]]. Checklist: [[cards#card-portfolio|the portfolio card]].

## Two pillars, one loop {#pillars}

- **Catch** is the main skill. You analyze an unfamiliar repo, find the bug, and catch the agent's own mistakes. Chapters 2–6.
- **Build** is the main deliverable. You turn what you catch into Polaris-style tasks with graders that cannot be fooled. Chapters 7–9 and 13.
- They feed each other. Each agent mistake you catch is a task idea. Each task you build is a place to catch more mistakes.

Every change you make or review follows the same 5-move loop:

1. **Understand.** Baseline yourself, map the repo with tools, let the agent map it, then check its claims.
2. **Reproduce.** Write a failing test that fails for the right reason, before any fix.
3. **Hypothesize.** Your own guess first, then the agent's. Settle disagreements with a deterministic tool.
4. **Change or review.** Small diffs and guardrails. Read the diff, not the summary.
5. **Challenge.** Re-run everything yourself and attack the fix.

For hard or suspicious patches, the loop expands into the full Agent Patch Audit, steps [[S0]] to [[S15]]. One rule runs through all of it: "tests pass" is evidence, not proof.

## Start in 10 minutes {#start}

1. Skim [[start-here]]: the job decoded, your route to Nov 2, and the Day-1 tool checklist. (4 min; do the chapter properly today, about 1 h)
2. Open the [[placement]] test. Tick only what you can do now, without notes or AI. Chapters you fully pass go on your skip list. Start it now and finish it today. (2 min to start)
3. Read the 5-move loop and the S0–S15 step table in [[agent-patch-audit]]. It is the method behind every lab. (2 min)
4. Read [[start-here#honesty|the ownership gate]], so you know what "done" means for Chronos. (1 min)
5. Open the [[tracker]]. Your schedule and every drill live there. Export your progress once a week. (1 min)

## What is confirmed and what is not {#status}

| Claim | Status |
|---|---|
| You may use AI to prepare. Unless told otherwise, no AI tools in live GDM interviews or interview tasks. | ^[confirmed](https://storage.googleapis.com/deepmind-media/DeepMind.com/Assets/Docs/interviewing-at-google-deepmind.pdf "2026-10-20") |
| Antigravity CLI (`agy`) replaced Gemini CLI on 2026-06-18 for Google AI Pro and Ultra subscribers and for users of the free Gemini Code Assist for individuals. | ^[confirmed](https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/ "2026-10-20") |
| Google pilots an AI-assisted code-comprehension round with Gemini. No source names DeepMind. | ^[reported](https://www.entrepreneur.com/business-news/google-is-testing-a-new-rule-transform-job-interviews "2026-10-20") |
| Mechanize's co-founder now recruits for Polaris "evals and environments" after Google's deal with Mechanize. | ^[reported](https://www.businessinsider.com/google-completes-deal-for-ai-agents-startup-mechanize-2026-9 "2026-10-20") ^[reported](https://x.com/tamaybes/status/2105408224879116790 "2026-10-20") |
| DeepSWE has 113 hand-written tasks ^[confirmed](https://deepswe.datacurve.ai/blog/deepswe "2026-10-20"). It is the closest public analogue to Polaris tasks. | ^[inference](- "2026-10-20") |
| Polaris interviews follow Mechanize's or Meta's format. | Not supported. No first-hand Polaris interview report was found on X, Blind, Reddit, LinkedIn or Glassdoor as of 2026-10-20 ^[inference](- "2026-10-20") |

The full facts table, with what to do about each fact, is in [[start-here#facts|Start here]].

## How to read this site {#how-to-read}

- **Badges.** ^[confirmed](https://storage.googleapis.com/deepmind-media/DeepMind.com/Assets/Docs/interviewing-at-google-deepmind.pdf "2026-10-20") means we read the primary source. ^[reported](https://www.entrepreneur.com/business-news/google-is-testing-a-new-rule-transform-job-interviews "2026-10-20") means a secondary source says it. ^[inference](- "2026-10-20") means it is our reasoning. Hover a badge to see the date it was checked.
- **`agy` commands** were checked against docs on 2026-10-20, not run. Confirm them on your machine on day 1.
- **Hours** are your personal preparation time. The time AI agents spent building this site and Chronos v0 is tracked separately and never counts as your prep.
- **Honesty.** Chronos v0 is agent-built. It becomes your project when you pass the ownership gate. Say so in every interview.
- **This site is public.** Anyone with the link can read it, and search engines may list it. It is not linked from the site's main navigation. Keep private details out of it.
- **Progress** is saved only in this browser. Keep the [[cards]] open or printed while you practice.
- **Protected days.** Nov 1–2 have no prep. The sprint plan in [[tracker#sprint|the tracker]] is built around that.
