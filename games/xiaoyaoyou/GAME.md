SLUG=xiaoyaoyou
PORT=8101
BRANCH=game/xiaoyaoyou
WORKTREE=/Users/richardzhu/dev/site-xiaoyaoyou

Isolation rules:
- write only inside games/xiaoyaoyou/;
- never push;
- never touch other site files;
- use only this PORT for local servers;
- ~/game-assets is read-only shared input, never write there;
- Blender temp files go in games/xiaoyaoyou/_dev/tmp.

Start each session in this worktree on this branch. Keep all plans, logs,
assets, code, and tests inside games/xiaoyaoyou/. Use factory startup for Blender.
Do not run the repository-wide build: the current build excludes root games/.
Use the Codex built-in in-app browser in the right panel for web previews.
Do not read protected data, other worktrees, or the main working checkout.
Never change Git configuration or hooks, bypass push guards, change branches,
or trigger deployment workflows. Request approval only for a specific scoped
command when Blender or a commit requires sandbox access.

Shared tools (read-only):
- /Users/richardzhu/game-assets/node_modules/
- /Users/richardzhu/game-assets/.venv/bin/pyftsubset
- /Users/richardzhu/game-assets/fonts/lxgw-wenkai/ (font plus OFL.txt)
- /Users/richardzhu/game-assets/fonts/eb-garamond/ (font plus OFL.txt)

Before using run_night.sh, prepare PLAN.md with unchecked milestones and
acceptance criteria, and LOG.md inside this game directory.
