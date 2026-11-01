# NIGHT.md — unattended overnight brief (Claude Code builds, Codex reviews)

You are taking over as the builder of this game from Codex, and you will work UNATTENDED for about 10 hours while Richard sleeps. Work only in this worktree (~/dev/site-xiaoyaoyou, branch game/xiaoyaoyou). Never push. Never touch other worktrees, the main site checkout, or anything outside games/xiaoyaoyou/ (reading ~/game-assets is fine).

## Goal for tonight

A showable first draft: a polished vertical slice that demonstrates both technical skill and aesthetic judgment, good enough to feature on Richard's personal site:

title screen → the north sea, with Kun swimming among pine-topped rock pillars, lit and atmospheric like ref/key-north-sea.png → classical text lines with the translation layer → seal end card.

Quality over quantity: one beautiful slice beats three rough beats.

## Phase 1: handoff (~20 min)

1. Read games/xiaoyaoyou/GAME.md, PLAN.md (Interactive mode, Decisions, Lessons from Kun, Harness contract, milestones), REVIEW_RUBRIC.md, LOG.md (newest entries first), every image in ref/, and skim tools/*, blender/* and src/*.
2. Write games/xiaoyaoyou/tools/codex_review.md: a reusable reviewer prompt based on REVIEW_RUBRIC.md.
   - Codex judges ONLY from fresh capture screenshots, metrics and the relevant ref/ key art, never from your notes.
   - It returns PASS / FIX / BLOCK, with concrete issues and severities.
   - It never edits files.

   Check `codex exec --help` for the image-input, read-only sandbox and output flags (model gpt-6.1-sol). Then run one test review on the current M2 evidence to prove the loop works. If you can't get the Codex loop working within 20 minutes, use a fresh Claude subagent as the reviewer instead (it sees only the screenshots, metrics, rubric and key art), and log that you did.
3. Test whether `codex` here can generate images. Record the result: yes or no.
4. Create games/xiaoyaoyou/MORNING.md with the start time and a report skeleton. Put a ~10-line Phase 1 report at the top: current milestone, open to-dos, the test review's verdict, and the image-generation result. Commit NIGHT.md and MORNING.md.
5. Continue straight into the night plan. Don't wait for a reply.

## The night plan (in order, time-boxed)

**A. M3 per PLAN.md** (playable north sea with pine-topped rock pillars, as in the key art). About 2.5 h at most.

**B. M4 per PLAN.md** (light, fog, light shafts, depth, Kun's glow and fin translucency, matched to the key art). About 3 h at most. This is the biggest aesthetic win, so give it the most care.
- You may tune Kun's exposed fin constants (scale, sweep, dihedral) against the key art. Log every change.
- Kun's geometry is otherwise frozen.

**C. M5 per PLAN.md** (text, fonts, seal end card), plus the deferred title polish: ref/key-north-sea.png as a full-bleed title background with a soft vignette behind the title. About 2 h at most.

**D. Stretch, only if A–C are READY:**
1. `?showcase=1`: a 60–90 s cinematic autoplay camera through the north sea that Richard can screen-record for X.
2. games/xiaoyaoyou/making-of/index.html: a static "how it was built" page drawn from the evidence.
   - Content: reference sheet → Blender passes → overlays and IoU → browser; the pipeline (image references → code-built Blender meshes → three.js); key numbers.
   - Copy only the few images it needs into making-of/img/, keeping that folder under ~8 MB.
   - It must follow the same site-wide HTML rules as the game page.

**E. Final 30 min:** a full capture, a budget check, the mobile layout, and finalizing MORNING.md.

Do NOT start M6 (Peng) tonight. The second hero model needs Richard's eye.

## Unattended rules (they replace "wait for my OK", for tonight only)

- A milestone is **READY FOR RICHARD** when every PLAN.md criterion passes on a fresh capture AND the Codex review returns PASS.
  - Up to 2 fix rounds per milestone.
  - If it's still FIX or BLOCK after that, log NEEDS RICHARD with the evidence and the options you see. Then move on to the next phase if it doesn't depend on this one.
  - Don't tick checkboxes. Record status in LOG.md and MORNING.md; Richard approves in the morning.
- Never loosen acceptance criteria, never fake evidence, and never mark something done that a screenshot contradicts.
- Before each Codex review, look at the screenshots yourself next to the key art and fix anything obviously off. Judge in the gameplay camera, not only the test views.
- Commit after every meaningful step; git is the undo button. Keep `git status` clean at the end.
- No new downloads or installs; use what's in ~/game-assets.
- No image generation tonight unless the Phase 1 test showed codex can do it. If a step truly needs a new image, write the exact prompt (and which ref/ image to attach) into MORNING.md, and use the best existing reference meanwhile.
- Classical text: use only the lines already fixed in PLAN.md, all marked verify: true. English drafts are marked draft: true.
- If something fails twice the same way, change approach or skip it and log it. Don't loop.
- Stay well inside the safe zone so the auto-mode classifier never has to block you: no rm -rf, no git reset --hard, no curl | sh, nothing outside this worktree.

## MORNING.md (keep it updated as you go; finalize it at the end)

1. A one-screen summary.
2. Per milestone: READY or NEEDS RICHARD, with links to the evidence and the review gallery.
3. The 5 screenshots Richard should look at first.
4. Every judgment call you made, and every Kun constant you changed.
5. The Codex verdicts.
6. The NEEDS RICHARD list, with options for each item.
7. Image prompts Richard should generate.
8. What to do next.
