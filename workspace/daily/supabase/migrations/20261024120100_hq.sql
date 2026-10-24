-- HQ on Supabase (PLAN.md section 21): the same six collections as workspace/hq/store.js, owner-only.
-- The anon role can read nothing; a signed-in user who is not the owner can read and write nothing.
-- Rows use the export shape's fields (snake_case here); hq_export / hq_apply / hq_replace speak the export
-- shape itself (camelCase), so an HQ export file is a straight copy in and out.

create table public.hq_categories (
  id text primary key check (id ~ '^[A-Za-z0-9_-]{1,100}$'),
  name text not null check (char_length(name) between 1 and 40),
  position double precision not null default 0
);

create table public.hq_priorities (
  id text primary key check (id ~ '^[A-Za-z0-9_-]{1,100}$'),
  scope text not null check (scope in ('today', 'month')),
  period text not null check (
    (scope = 'today' and period ~ '^\d{4}-\d{2}-\d{2}$') or (scope = 'month' and period ~ '^\d{4}-\d{2}$')
  ),
  slot smallint not null check (slot between 1 and 5),
  text text not null default '' check (char_length(text) <= 4000),
  done boolean not null default false,
  constraint hq_priorities_slot unique (scope, period, slot) deferrable initially deferred
);

create table public.hq_deadlines (
  id text primary key check (id ~ '^[A-Za-z0-9_-]{1,100}$'),
  title text not null check (char_length(title) between 1 and 200),
  kind text not null default '' check (char_length(kind) <= 200),
  category text not null references public.hq_categories (id) deferrable initially deferred,
  date date,
  approx boolean not null default false,
  date_label text check (char_length(date_label) <= 24),
  sort_order double precision not null default 0
);
create index hq_deadlines_category on public.hq_deadlines (category);

create table public.hq_tasks (
  id text primary key check (id ~ '^[A-Za-z0-9_-]{1,100}$'),
  deadline_id text not null references public.hq_deadlines (id) on delete cascade deferrable initially deferred,
  text text not null check (char_length(text) between 1 and 4000),
  done boolean not null default false,
  position double precision not null default 0
);
create index hq_tasks_deadline on public.hq_tasks (deadline_id);

create table public.hq_thoughts (
  id text primary key check (id ~ '^[A-Za-z0-9_-]{1,100}$'),
  text text not null check (char_length(text) between 1 and 4000),
  created_at timestamptz not null
);

create table public.hq_ideas (
  id text primary key check (id ~ '^[A-Za-z0-9_-]{1,100}$'),
  title text not null check (char_length(title) between 1 and 200),
  note text not null default '' check (char_length(note) <= 4000),
  bucket text not null default 'later' check (bucket in ('next', 'later')),
  position double precision not null default 0
);

-- Owner-only RLS on every table, and no grants at all for anon.
do $$
declare t text;
begin
  foreach t in array array['hq_categories', 'hq_priorities', 'hq_deadlines', 'hq_tasks', 'hq_thoughts', 'hq_ideas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "owner only" on public.%I for all to authenticated using ((select public.is_owner())) with check ((select public.is_owner()))', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end;
$$;

-- Everything, in the export shape: { format, version, categories, priorities, deadlines, tasks, thoughts, ideas }.
-- Security invoker: RLS decides, so a non-owner gets empty lists (the caller checks is_owner first).
create or replace function public.hq_export()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'format', 'hq-export',
    'version', 1,
    'categories', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'position', position) order by position, id) from public.hq_categories), '[]'::jsonb),
    'priorities', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'scope', scope, 'period', period, 'slot', slot, 'text', text, 'done', done) order by scope, period, slot) from public.hq_priorities), '[]'::jsonb),
    'deadlines', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'kind', kind, 'category', category, 'date', date, 'approx', approx, 'dateLabel', date_label, 'sortOrder', sort_order) order by sort_order, id) from public.hq_deadlines), '[]'::jsonb),
    'tasks', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'deadlineId', deadline_id, 'text', text, 'done', done, 'position', position) order by deadline_id, position, id) from public.hq_tasks), '[]'::jsonb),
    'thoughts', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'text', text, 'createdAt', to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) order by created_at, id) from public.hq_thoughts), '[]'::jsonb),
    'ideas', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'note', note, 'bucket', bucket, 'position', position) order by position, id) from public.hq_ideas), '[]'::jsonb)
  );
$$;

-- One change set in one transaction: { delete: { collection: [ids] }, upsert: { collection: [export rows] } }.
-- Foreign keys and the priority slot are deferred, so the order inside a change set doesn't matter.
create or replace function public.hq_apply(changes jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  del jsonb := coalesce(changes -> 'delete', '{}'::jsonb);
  up jsonb := coalesce(changes -> 'upsert', '{}'::jsonb);
begin
  if not public.is_owner() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  set constraints all deferred;

  delete from public.hq_tasks where id in (select jsonb_array_elements_text(coalesce(del -> 'tasks', '[]'::jsonb)));
  delete from public.hq_priorities where id in (select jsonb_array_elements_text(coalesce(del -> 'priorities', '[]'::jsonb)));
  delete from public.hq_thoughts where id in (select jsonb_array_elements_text(coalesce(del -> 'thoughts', '[]'::jsonb)));
  delete from public.hq_ideas where id in (select jsonb_array_elements_text(coalesce(del -> 'ideas', '[]'::jsonb)));
  delete from public.hq_deadlines where id in (select jsonb_array_elements_text(coalesce(del -> 'deadlines', '[]'::jsonb)));
  delete from public.hq_categories where id in (select jsonb_array_elements_text(coalesce(del -> 'categories', '[]'::jsonb)));

  insert into public.hq_categories (id, name, position)
    select id, name, coalesce(position, 0)
    from jsonb_to_recordset(coalesce(up -> 'categories', '[]'::jsonb)) as x(id text, name text, position double precision)
    on conflict (id) do update set name = excluded.name, position = excluded.position;

  insert into public.hq_deadlines (id, title, kind, category, date, approx, date_label, sort_order)
    select id, title, coalesce(kind, ''), category, date, coalesce(approx, false), "dateLabel", coalesce("sortOrder", 0)
    from jsonb_to_recordset(coalesce(up -> 'deadlines', '[]'::jsonb))
      as x(id text, title text, kind text, category text, date date, approx boolean, "dateLabel" text, "sortOrder" double precision)
    on conflict (id) do update set title = excluded.title, kind = excluded.kind, category = excluded.category,
      date = excluded.date, approx = excluded.approx, date_label = excluded.date_label, sort_order = excluded.sort_order;

  insert into public.hq_tasks (id, deadline_id, text, done, position)
    select id, "deadlineId", text, coalesce(done, false), coalesce(position, 0)
    from jsonb_to_recordset(coalesce(up -> 'tasks', '[]'::jsonb))
      as x(id text, "deadlineId" text, text text, done boolean, position double precision)
    on conflict (id) do update set deadline_id = excluded.deadline_id, text = excluded.text, done = excluded.done, position = excluded.position;

  insert into public.hq_priorities (id, scope, period, slot, text, done)
    select id, scope, period, slot, coalesce(text, ''), coalesce(done, false)
    from jsonb_to_recordset(coalesce(up -> 'priorities', '[]'::jsonb))
      as x(id text, scope text, period text, slot smallint, text text, done boolean)
    on conflict (id) do update set scope = excluded.scope, period = excluded.period, slot = excluded.slot, text = excluded.text, done = excluded.done;

  insert into public.hq_thoughts (id, text, created_at)
    select id, text, "createdAt"
    from jsonb_to_recordset(coalesce(up -> 'thoughts', '[]'::jsonb)) as x(id text, text text, "createdAt" timestamptz)
    on conflict (id) do update set text = excluded.text, created_at = excluded.created_at;

  insert into public.hq_ideas (id, title, note, bucket, position)
    select id, title, coalesce(note, ''), coalesce(bucket, 'later'), coalesce(position, 0)
    from jsonb_to_recordset(coalesce(up -> 'ideas', '[]'::jsonb))
      as x(id text, title text, note text, bucket text, position double precision)
    on conflict (id) do update set title = excluded.title, note = excluded.note, bucket = excluded.bucket, position = excluded.position;
end;
$$;

-- Replace everything with one export (Import JSON, and moving this device's local data to the cloud).
create or replace function public.hq_replace(data jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.is_owner() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  set constraints all deferred;
  delete from public.hq_tasks where true;
  delete from public.hq_priorities where true;
  delete from public.hq_thoughts where true;
  delete from public.hq_ideas where true;
  delete from public.hq_deadlines where true;
  delete from public.hq_categories where true;
  perform public.hq_apply(jsonb_build_object('upsert', data));
end;
$$;

revoke all on function public.hq_export() from public, anon;
revoke all on function public.hq_apply(jsonb) from public, anon;
revoke all on function public.hq_replace(jsonb) from public, anon;
grant execute on function public.hq_export() to authenticated;
grant execute on function public.hq_apply(jsonb) to authenticated;
grant execute on function public.hq_replace(jsonb) to authenticated;
