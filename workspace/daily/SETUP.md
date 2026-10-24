# Daily and HQ on Supabase: setup

The code for the Supabase phase (PLAN.md section 1 "Later: Supabase", section 17 item 9, section 21) is in the repo. Until you paste a project URL and key into `app/cloud-config.js` (step 7), nothing changes: Daily and HQ stay local-first. These are the steps only you can do, in order. Run every CLI command from the repo root with `--workdir workspace/daily`.

What you get when it's done:

- **/daily/**: Owner view signs in with GitHub. Every action runs the engine in the `game-action` Edge Function: the server's clock, the server's random draws, logged in `game_events`. Your browser never sees the RNG seed. Visitors see the live public view (`daily_public`), no more hand-committed snapshots. Days close on the hour by cron (`day-close`), even with no tab open. Email reminders (`remind`) are optional, and so are Claude-written tier suggestions in list setup (`generate-variants`).
- **/hq/**: "Sign in with GitHub". Your data sits in owner-only `hq_*` tables. The anon role reads nothing, and any other signed-in user reads and writes nothing.

You need: a Supabase account, a GitHub account, the Supabase CLI (`brew install supabase/tap/supabase`), Docker Desktop running (the CLI bundles functions in Docker), and, optionally, an Anthropic API key and a Resend account.

## 1. Create the project

Create a new project in the Supabase dashboard (region: an East US one, close to New York time). Write down the **project ref**, the `abcd…` part of `https://abcd….supabase.co`.

## 2. GitHub sign-in

1. On GitHub, open Settings → Developer settings → OAuth Apps → New OAuth App.
   - Homepage URL: `https://zelinzhu-richard.github.io`
   - Authorization callback URL: `https://<project-ref>.supabase.co/auth/v1/callback`
2. Generate a client secret. In the Supabase dashboard, open Authentication → Sign In / Providers → GitHub, turn it on, and paste the client ID and secret.
3. In Authentication → URL Configuration:
   - Site URL: `https://zelinzhu-richard.github.io/daily/`
   - Redirect URLs (add each one):
     - `https://zelinzhu-richard.github.io/daily/`
     - `https://zelinzhu-richard.github.io/daily/eggs/`
     - `https://zelinzhu-richard.github.io/hq/`
     - for `npm run dev`: `http://127.0.0.1:5173/daily/`, `http://127.0.0.1:5173/daily/eggs/`, `http://127.0.0.1:5173/hq/`
4. Recommended: in Sign In / Providers → Email, turn off sign-ups so GitHub is the only way in. RLS protects the data either way.

## 3. Create the tables

```bash
supabase login
```

```bash
supabase link --project-ref <project-ref> --workdir workspace/daily
```

```bash
supabase db push --workdir workspace/daily
```

This applies `supabase/migrations/`: the game tables, the HQ tables, Row Level Security, and the pg_cron schedule. The schedule does nothing until step 6.

## 4. Function secrets

Make a cron secret with `openssl rand -hex 32`. Then write the secrets into `workspace/daily/supabase/functions/.env`. That file is gitignored, so the values stay out of your shell history and out of git.

```
CRON_SECRET=<the 64 hex characters>
ANTHROPIC_API_KEY=<optional: enables "Suggest tier text" in list setup>
RESEND_API_KEY=<optional: email reminders>
REMIND_EMAIL_TO=<optional: where reminders go>
REMIND_EMAIL_FROM=<optional: a sender your Resend domain allows, e.g. Daily <daily@your-domain>>
```

```bash
supabase secrets set --env-file workspace/daily/supabase/functions/.env --workdir workspace/daily
```

Leave out the optional lines you don't want. Without `ANTHROPIC_API_KEY` the suggestion button says it isn't set up. Without the three email values, reminders stay in the page, as they are now. Don't set `ALLOWED_ORIGINS` on the hosted project; it exists for local development only. The model for suggestions is `claude-opus-5-5` (`supabase/functions/_shared/config.ts`). To use another, set the `VARIANTS_MODEL` secret.

## 5. Deploy the functions

```bash
supabase functions deploy --workdir workspace/daily
```

This deploys `game-action`, `day-close`, `remind` and `generate-variants`. `config.toml` turns off the gateway's JWT check for each one, because each function checks its own caller: the owner's session, or the cron secret. The functions import the game engine from `workspace/daily/engine/` (the same files the browser runs), so a deploy always ships the current rules.

Check it. The answer should be `{"ok":true,"changed":false,"reason":"no game"}`; that reply already ran the engine:

```bash
curl -s -X POST https://<project-ref>.supabase.co/functions/v1/day-close -H "x-daily-cron: <CRON_SECRET>"
```

## 6. Point the cron at the functions (Vault)

In the dashboard SQL editor, run the following, with the same CRON_SECRET as step 4:

```sql
select vault.create_secret('https://<project-ref>.supabase.co/functions/v1', 'daily_functions_url');
select vault.create_secret('<CRON_SECRET>', 'daily_cron_secret');
```

The schedule (UTC; the functions convert to New York time):

- `daily-day-close` at :05 every hour. It closes each finished day (22:00) and opens today (05:00). It catches up after any outage.
- `daily-remind-*` at the reminder slots: 19:00 and 21:15 evening, 07:30 morning. Each slot fires at both of its possible UTC hours, and `remind` keeps only the run that matches New York time, so daylight saving needs no edits.

To rotate the secret later: set a new `CRON_SECRET` (step 4), then run `select vault.update_secret((select id from vault.secrets where name = 'daily_cron_secret'), '<new>');`.

## 7. Paste the URL and key

In the dashboard, open Project Settings → API Keys and copy the **publishable** key (`sb_publishable_…`; the legacy `anon` key also works). Put it and the project URL in `workspace/daily/app/cloud-config.js`:

```js
export const CLOUD = Object.freeze({
  url: 'https://<project-ref>.supabase.co',
  anonKey: 'sb_publishable_…',
});
```

Both values are public by design. Never paste the secret key or the `service_role` key: `buildDaily` refuses them, and `tools/verify.mjs` fails the build on `sb_secret_…`, `sk-ant-…` and service_role JWTs anywhere in `dist/`. HQ uses the same file. The HQ build then allows exactly that origin in its CSP `connect-src`, which stays `'none'` while the config is empty.

Then check the build, commit the config, and push. GitHub Pages deploys the site.

```bash
npm test && npm run build
```

## 8. Add yourself to the allowlist

1. Open https://zelinzhu-richard.github.io/daily/, choose **Owner view**, and sign in with GitHub. You'll see "That GitHub account is not the owner. Not authorised." That's expected: your user now exists, but it isn't allowlisted yet.
2. In the SQL editor, find your user id:

   ```sql
   select id, email, raw_user_meta_data->>'user_name' as github from auth.users;
   ```

3. Allowlist it. The allowlist is in a schema the API doesn't expose, and no migration ever names you:

   ```sql
   insert into private.app_owner (user_id, note) values ('<your user id>', 'owner');
   ```

## 9. Move your data in

- **Daily.** Open /daily/ on the device that holds your current save (localStorage). Choose Owner view and sign in. Asked "Move this device's save to the cloud?", choose **Upload the save**. The server checks the save, gives it a new server-only random seed (the old one was made in, and was readable by, the browser), and catches up any days that ended. The local copy stays on that device under `daily:v1:uploaded`. A save file from Settings → Export save also works: in Owner view, use Settings → Import save, which replaces the cloud game.
- **HQ.** Open /hq/ and sign in with GitHub. If this browser holds your HQ data, you'll be asked "Copy this device's data to the cloud?"; choose yes. Otherwise use Import JSON with `workspace/hq/_private/hq-seed.json` or an HQ export. It replaces everything, in one transaction.

Other devices: sign in, and they read the cloud copy. Nothing more to move.

## 10. Check it

- /daily/ as a visitor (a private window) shows "Public view" from the live data. In Owner view the chip reads "Owner view · synced".
- In the SQL editor, `select source, ok, events->0->>'type', at from public.game_events order by id desc limit 5;` lists your recent actions.
- After the next :05, run `select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;` and `select status_code, content from net._http_response order by id desc limit 5;`. Both should show successful runs.
- /hq/ in a private window shows only "Sign in with GitHub".

## Local development

```bash
DAILY_CRON_SECRET=local-only-cron-secret-0123456789 supabase start --workdir workspace/daily
```

```bash
DAILY_CRON_SECRET=local-only-cron-secret-0123456789 npm run test:db
```

`test:db` (in `supabase/tests/`, outside `npm test`) wipes the local Daily and HQ tables and its own test users, then checks:

- RLS for anon, for a signed-in stranger, and for the owner
- the HQ round trip
- the game through the browser's own `SupabaseBackend`, using the vendored supabase-js: create, act, refusals, stale versions, the RNG log, and the sanitized public view
- uploading a local save
- `day-close`, `remind` and `generate-variants`
- the pg_cron → Vault → pg_net path

It refuses to run against anything but a local stack.

To try the pages against the local stack without editing the committed config, run this once on `http://127.0.0.1:5173` in the browser console. HQ's CSP only allows a configured origin, so HQ needs a build with the config set.

```js
localStorage.setItem('daily:cloud', JSON.stringify({ url: 'http://127.0.0.1:54321', anonKey: '<ANON_KEY from supabase status>' }))
```

Locally, GitHub sign-in is off (`config.toml`). Tests sign in with email and password instead.

## Going back

Empty `url` and `anonKey` in `app/cloud-config.js` and push: Daily and HQ are local-first again, and the cloud data stays where it is. To get a local save out of the cloud, use Settings → Export save in Owner view, then Import save while in local mode.

## Not done yet

- Visitor Cheers (the optional public `cheer` function, PLAN.md section 1) and Web Push. Reminders are email or in-page only.
- Tuning numbers stays a code change in `engine/config.js`. Deploy the functions and the site together. If they run different rules, the owner view says so until both are live, and the server's rules always decide.
