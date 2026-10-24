-- Daily on Supabase: the owner allowlist and the game tables (PLAN.md section 1 "Later: Supabase").
--
-- Who can do what:
--   - Only Edge Functions (the service role) write game tables, and only they read the raw game state,
--     which holds the RNG seed. The owner's browser gets a copy with the seed redacted from game-action.
--   - The owner (a signed-in user listed in private.app_owner) can read the event log, task lists and
--     reminder log.
--   - Everyone, signed in or not, can read the sanitized public snapshot (daily_public) and the game config.
-- The allowlist is filled by hand (SETUP.md); no migration ever names a real user.

create schema if not exists private;
revoke all on schema private from public;
-- RLS policies call public.is_owner(), which reads private.app_owner as its definer; nothing in this schema
-- is exposed by the Data API (it is not in config.toml [api] schemas).

create table private.app_owner (
  user_id uuid primary key references auth.users (id) on delete cascade,
  note text,
  added_at timestamptz not null default now()
);
alter table private.app_owner enable row level security;

-- True when the caller's JWT belongs to an allowlisted owner. Security definer so it can read the private
-- allowlist; it reveals nothing beyond the caller's own status.
create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from private.app_owner where user_id = (select auth.uid()));
$$;
revoke all on function public.is_owner() from public, anon;
grant execute on function public.is_owner() to authenticated, service_role;

-- Append-only guard for log tables.
create or replace function private.forbid_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = '42501';
end;
$$;

-- ---------- game_state: the one save, full engine state as JSONB ----------

create table public.game_state (
  id smallint primary key default 1 check (id = 1),
  state jsonb not null,
  version integer not null default 1 check (version > 0), -- optimistic concurrency: bumped on every write
  config_hash text not null, -- sha256 of the engine CONFIG that wrote this state
  updated_at timestamptz not null default now()
);
alter table public.game_state enable row level security;
-- No policies: anon and authenticated can't read or write it; the service role bypasses RLS.
revoke all on public.game_state from anon, authenticated;

-- ---------- game_events: append-only log of every action ----------

create table public.game_events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  now_ms bigint not null, -- the engine's `now` for this entry
  source text not null check (source in ('create', 'import', 'action', 'advance', 'day-close')),
  action jsonb, -- the owner's action { type, ...payload }; null for advance and day-close
  ok boolean not null, -- false: the engine refused the action and nothing changed
  error jsonb, -- { code, message } when ok is false
  rng jsonb not null, -- { from, to, draws }: counter positions before/after and every value drawn
  events jsonb not null default '[]'::jsonb, -- engine events, in order
  version integer not null -- game_state.version after this entry
);
create index game_events_at on public.game_events (at desc);
alter table public.game_events enable row level security;
create policy "owner reads events" on public.game_events
  for select to authenticated using ((select public.is_owner()));
revoke all on public.game_events from anon;
revoke insert, update, delete, truncate on public.game_events from authenticated;
revoke update, delete, truncate on public.game_events from service_role;
create trigger game_events_append_only before update or delete on public.game_events
  for each row execute function private.forbid_change();
create trigger game_events_no_truncate before truncate on public.game_events
  for each statement execute function private.forbid_change();

-- ---------- task_lists: the monthly lists (locked = this month's, unlocked = next month's) ----------

create table public.task_lists (
  month text primary key check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  tasks jsonb not null, -- engine TaskDefs (goals and purposes included, so owner-only)
  locked_at timestamptz,
  swaps integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.task_lists enable row level security;
create policy "owner reads lists" on public.task_lists
  for select to authenticated using ((select public.is_owner()));
revoke all on public.task_lists from anon;
revoke insert, update, delete, truncate on public.task_lists from authenticated;

-- ---------- game_config: the tunables the deployed engine runs with (mirror of engine/config.js) ----------

create table public.game_config (
  id smallint primary key default 1 check (id = 1),
  hash text not null, -- sha256 of JSON.stringify(CONFIG); the browser sends its own and must match
  config jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.game_config enable row level security;
create policy "anyone reads the config" on public.game_config
  for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on public.game_config from anon, authenticated;

-- ---------- the public snapshot: engine publicSnapshot(), already sanitized ----------
-- No seed, settings, goal links or real-life rewards log (ARCHITECTURE.md "Public snapshot").

create table public.game_public (
  id smallint primary key default 1 check (id = 1),
  snapshot jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.game_public enable row level security;
create policy "anyone reads the public snapshot" on public.game_public
  for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on public.game_public from anon, authenticated;

create view public.daily_public with (security_invoker = true) as
  select snapshot, updated_at from public.game_public where id = 1;
revoke all on public.daily_public from anon, authenticated;
grant select on public.daily_public to anon, authenticated;

-- ---------- reminder_log: one row per reminder slot per day (remind is idempotent) ----------

create table public.reminder_log (
  day_key text not null check (day_key ~ '^\d{4}-\d{2}-\d{2}$'),
  slot text not null,
  sent_at timestamptz not null default now(),
  channel text not null,
  ok boolean not null,
  detail text,
  primary key (day_key, slot)
);
alter table public.reminder_log enable row level security;
create policy "owner reads reminders" on public.reminder_log
  for select to authenticated using ((select public.is_owner()));
revoke all on public.reminder_log from anon;
revoke insert, update, delete, truncate on public.reminder_log from authenticated;

-- ---------- daily_commit: one write, one transaction (Edge Functions only) ----------
-- Saves the new state if the stored version still equals p_expected (null: create, only when no game exists),
-- appends the log entry, refreshes the public snapshot and upserts the task lists. Returns the new version,
-- or null when the version moved on (the caller answers 409 with the fresh state) or a game already exists.

create or replace function public.daily_commit(
  p_expected integer,
  p_state jsonb,
  p_config_hash text,
  p_event jsonb,
  p_snapshot jsonb,
  p_lists jsonb
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v integer;
begin
  if p_expected is null then
    insert into public.game_state (id, state, version, config_hash)
      values (1, p_state, 1, p_config_hash)
      on conflict (id) do nothing
      returning version into v;
  else
    update public.game_state
      set state = p_state, version = version + 1, config_hash = p_config_hash, updated_at = now()
      where id = 1 and version = p_expected
      returning version into v;
  end if;
  if v is null then
    return null;
  end if;

  insert into public.game_events (now_ms, source, action, ok, rng, events, version)
    values ((p_event ->> 'now_ms')::bigint, p_event ->> 'source', p_event -> 'action', true,
            coalesce(p_event -> 'rng', '{}'::jsonb), coalesce(p_event -> 'events', '[]'::jsonb), v);

  insert into public.game_public (id, snapshot, updated_at)
    values (1, p_snapshot, now())
    on conflict (id) do update set snapshot = excluded.snapshot, updated_at = excluded.updated_at;

  insert into public.task_lists (month, tasks, locked_at, swaps, updated_at)
    select month, tasks, locked_at, coalesce(swaps, 0), now()
    from jsonb_to_recordset(coalesce(p_lists, '[]'::jsonb))
      as x(month text, tasks jsonb, locked_at timestamptz, swaps integer)
    on conflict (month) do update
      set tasks = excluded.tasks, locked_at = excluded.locked_at, swaps = excluded.swaps, updated_at = excluded.updated_at;

  return v;
end;
$$;
revoke all on function public.daily_commit(integer, jsonb, text, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.daily_commit(integer, jsonb, text, jsonb, jsonb, jsonb) to service_role;
