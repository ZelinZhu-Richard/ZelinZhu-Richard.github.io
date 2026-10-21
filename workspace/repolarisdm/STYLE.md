# STYLE.md — how to write playbook pages

Read `PLAN.md` first. This file is the contract for content files in `content/`. The build fails on syntax errors,
so check your page with: `node build.mjs /tmp/somewhere` (run inside this folder) and `PLAYBOOK_ALLOW_PLACEHOLDERS=1 PLAYBOOK_BUILDING=1 node --test tests/*.test.mjs`.

## 1. Voice

- The reader is Richard: a strong "vibe coder" who is not a native English speaker. Write for him in the second person ("you").
- Short sentences. Usually under 20 words. One idea per sentence. Plain words.
- Define every term the first time you use it, in one short clause ("a **grader** — the code that scores an attempt").
- Concrete first: a command, an example, a number. Then the rule.
- No filler, no hype, no "In this chapter we will…". No emoji.
- Never pretend: if we did not run something, say so. `agy` commands: "checked against docs on 2026-10-20, not run".
- Polaris-only. Every section must say or show why it matters for this job.

## 2. File shape

File name: `content/NN-slug.md` (slug and number from PLAN.md §4). Start with front matter:

```
---
title: The Agent Patch Audit
short: Agent Patch Audit
summary: One or two plain sentences that say what the reader will be able to do after this chapter.
---
```

Do NOT write a `# ` heading. The title comes from front matter. Use `##`, `###`, `####` only.
A heading may set its id: `## Mistake card {#mistake-card}`. Otherwise the id is made from the text.

## 3. Chapter contract (every chapter, in this order)

1. `:::selfcheck` — 3 to 6 items. Each item is a task the reader can try, with an answer after `||`.
2. `## Why Polaris cares` — 3 to 6 sentences, tied to the job (cite the posting or a fact with a badge).
3. The core sections (`##`). Teach with examples, commands, real output.
4. At least one `:::compare` (vibe coder vs senior engineer).
5. Drills: at least two `:::drill` blocks. Each has `id`, `title`, `time` and a `**Done when:**` line.
6. `## Sources` — a list. Every item has a badge and a link.
7. `:::check` — the closing check, 3 to 6 items.

## 4. Markup (the only syntax the renderer accepts)

Normal Markdown: paragraphs, `**bold**`, `*italic*` (asterisks only), `` `code` ``, links `[text](https://…)`,
lists (`-` or `1.`; indent nested items by 2 spaces), task lists `- [ ] text` (become saved checkboxes),
fenced code blocks with a language, pipe tables, `> quotes`, `---` rules. No raw HTML (it is escaped).

Links: external links must start with `https://`. Internal links use cross-references (below), never relative paths.

**Fact badges** — put right after the claim:
- `^[confirmed](https://source.example "2026-10-20")` — you or the research read the primary source.
- `^[reported](https://news.example "2026-10-20")` — a secondary source says it.
- `^[inference](- "2026-10-20")` — our reasoning; no source needed.
The date is when the source was checked. Use sources from `research/research-2026-10-20.json` when possible.

**Cross-references:**
- `[[agent-patch-audit]]` → link to a chapter (label = its title). `[[map#s2-tool-map|tool map]]` → with anchor and label.
- `[[S4]]` → link to step S4 of the audit. `[[M3]]` → link to the mistake card.
- `[[lab:lab-a]]` → link to Lab A's folder on GitHub. `[[home]]` → overview. `[[placement]]`, `[[cards]]`.
Anchors must exist: the build checks every internal link and anchor.

**Directives** (start with `:::name attrs`, end with a line `:::`):

```
:::selfcheck
- Explain what a grader is in one sentence. || The code that turns an attempt into a number, e.g. 0 or 1.
- Run a single pytest test by name. || `pytest -k name` or `pytest path::test_name`.
:::

:::drill id="map-a-repo" title="Map tallyhub in 15 minutes" time="20 min"
Steps as normal Markdown.

**Done when:** you have a 5-line map and every line points to a file:line you opened.
:::

:::compare
- Asks the agent "what does this repo do?" and trusts the answer. || Runs the tests first, maps with tools, then checks five agent claims against the code.
:::

:::note title="Optional title"
Text. Also :::tip and :::warn.
:::

:::reveal title="Show the worked answer"
Hidden until clicked.
:::

:::mock id="meta-format" title="60-minute AI-assisted mock" minutes="60"
Phases as Markdown. The page adds a timer and a saved log box.
:::

:::tally id="lab-c" title="Lab C score"
- Patch 01 judged correctly
:::

:::rubric id="mock-1"
- Makes progress in unfamiliar code
:::

:::card id="method" title="The 5-move loop"
Card content (used on the cards page, files in content/cards/).
:::
```

`:::check` works like `:::selfcheck` (closing check). Only one of each per page. Items in `selfcheck`, `check`,
`compare`, `tally` and `rubric` must be `- ` list items (one per line; long items may wrap with indentation).

## 5. Hard rules (the build or tests fail, or the page must not be published)

- Never copy the job posting. At most one quoted phrase from it per page, under 15 words, in quotes, with the link.
- Never write these strings: `noindex`, `http://localhost:` + port, `127.0.0.1:` + port, `/Users/`, any `holdout` path,
  the word `CHRONOS-CANARY`, email addresses, school or college names, application details.
- Never claim Polaris's interview format. Say what is confirmed (GDM's no-AI default), what is reported (Google's pilot),
  and what is a practice format (Meta's round). Mechanize facts are about Mechanize.
- Never present synthetic transcripts as real model output.
- Use `lldb` on macOS, not `gdb`. Apple clang has no LeakSanitizer.
- Numbers need a badge. Statistics need their sampling assumptions.
- Python code you show must run. Shell commands must be correct for macOS zsh unless you say otherwise.
