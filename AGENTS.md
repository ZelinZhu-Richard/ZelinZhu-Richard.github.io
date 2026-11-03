# AGENTS.md

Rules for AI agents (Codex, Claude Code) working in this repository. CLAUDE.md imports this file. Update the "Order of work" list when an item ships.

## The repo
- GitHub: ZelinZhu-Richard/ZelinZhu-Richard.github.io. It is public: anything pushed here is public.
- Live site: https://zelinzhu-richard.github.io/
- Deploy: every push to `main` runs .github/workflows/deploy.yml (npm ci, npm test, npm run build, then GitHub Pages). Pushing or merging to `main` publishes the live site.
- Main checkout: ~/dev/personal_portfolio. Keep new review worktrees, reports, screenshots and other working material inside its `workspace/` folder. Leave pre-existing external worktrees alone unless Richard explicitly authorizes their use.

## Workspace and holdout
- The folder the session starts in is its project root. Keep agent activity inside it. Do not reorganize an existing checkout unless Richard asks.
- `workspace/` holds working material. `holdout/` is a protected sibling inside the project; never move it outside the project.
- The main agent is the holdout custodian. Read holdout only for a deliberate evaluation step, announced to Richard beforehand. Worker agents treat holdout as nonexistent: never list, read, copy or reference it.
- Do not read `_private/` folders or personal application/deadline data during development. Preserve them locally and exclude them from publication.
- If Richard authorizes a worker, start it in the working subfolder and block reads outside that root when enforceable. Claude Code workers require `permissions.blockReadsOutsideWorkingDirectories: true`.

## How every change is made
1. Start each new feature (Blog, learning-progress page, Daily, a game launch, ...) from the latest GitHub main, in its own worktree and branch. From the main checkout:
   ```sh
   git fetch origin
   git worktree add workspace/site-<name> -b codex/<name> origin/main
   ```
   Ignore each local worktree container in the parent checkout. New pages still belong in the review checkout's own `workspace/<name>/` source folder.
2. Never work on `main` directly and never push to `main`.
3. Before handing back: npm test, npm run build and npm run verify pass, and summarize what changed. State any checks that could not be completed.
4. Open a PR into `main` when Richard has authorized publication, or stop and ask with a concrete review result. The merge happens only while Richard is present and says so.
5. Keep branches short-lived. If origin/main moves, update the review branch before the PR without rewriting published history.

## Shared hot spots
- public/index.html (the captured, minified phoenix homepage) causes most conflicts. Only one branch may change it at a time. Before editing it, ask Richard whether another open branch touches it. Never hand-merge its minified lines.
- After intentional changes to public/, run npm run manifest. Regenerate generated output instead of merging it.
- New pages live in workspace/<name>/ with a build.mjs wired into tools/build.mjs (see workspace/video). Don't add new features under public/.

## Web previews and testing
- Use Codex's built-in browser (`iab` / `@Browser`) explicitly and show previews beside the chat. Use `open_in_codex` for preview URLs and artifacts when available.
- Development servers and automated terminal checks are allowed. Do not use personal browsers, Chrome/Edge extensions, native desktop automation or OS commands that launch browsers.
- If the built-in browser is unavailable, report the limitation and complete terminal checks. Do not enable disabled features or substitute a personal browser without Richard's request.
- For the November 2 sync, use 127.0.0.1:8200. Do not disturb port 8101, existing processes, ~/dev/site-xiaoyaoyou or branch game/xiaoyaoyou.

## Order of work (November 2026)
1. Sync local work with GitHub main.
2. Launch 逍遥游 (built on the game/xiaoyaoyou branch) on the site.
3. Blog.
4. Other pages: learning progress, Daily.

## Never
- Commit secrets: .env files, API keys, tokens, Supabase service_role or sb_secret keys. A confirmed Supabase anon/publishable key is allowed.
- Commit private material: _private folders, holdout/, workspace/polaris-capstone/, personal trackers' data or personal application/deadline plans.
- Commit local review worktrees, run evidence, .claude/worktrees/, .claude/settings.local.json, independent repository copies, node_modules, dist or logs.
- Push game/* branches. A pre-push hook blocks them; they are build branches and reach the site only through a feature/review branch.
- Force-push, rewrite published history, run git reset --hard, or delete branches, worktrees or existing files without Richard's OK. Rebuilding generated output in a new review checkout is allowed.
- Run gc, prune, repack or reflog expire during the sync or cleanup. Resolve the nested skills-site alternates dependency under a separately approved plan before any parent object cleanup.
- Hand-write the shark background or production metadata. The build injects them, and tools/verify.mjs checks production URLs, no noindex (except the existing private HQ shell) and no dev paths.
- Bypass a feature's explicit release gate. Hair Cut remains deferred until its required real-camera and physical-device evidence passes.
