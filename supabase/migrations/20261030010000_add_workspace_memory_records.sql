-- The memory of a person (記憶, docs/superpowers/specs/2026-10-30-memory-redesign-design.md, §4.1): a short list of notes, one fact in a sentence each, and what goes with them.
-- One row for each note (`note:<id>`), for each conversation read so far (`cursor:<conversation>`), for each change made without being asked (`event:<id>`, kept 30 days so
-- that it can be undone) and one for the settings (`meta:settings`); the content is the JSON of `payload`. A note the person deletes stays as a row with no text (a
-- tombstone, in the payload) so that it is not learned again; `deleted_at` is for a row that is taken away for good (the person cleared the memory), and it is soft so that
-- every device hears of it.
--
-- A person reads, adds and changes only their own rows. The server reads and writes them too (it saves what the model of a reply asked to remember, with the service key).
-- Every change counts as a new version and the time is the database's, never the device's: a device that changes a row says which version it read (the filter
-- `version = eq.N` of the update), and when the row has moved on the update finds nothing and the device reads the row again and joins the two.
-- Deleting for good is not given to a person: nothing is deleted, only marked (`deleted_at`), and the account being deleted takes its rows with it.

create table if not exists public.workspace_memory_records (
  user_id uuid not null references auth.users (id) on delete cascade,
  record_key text not null check (char_length(record_key) between 6 and 260 and record_key ~ '^(note|cursor|event|meta):[^[:space:]]+$'),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object' and pg_column_size(payload) <= 20000),
  version bigint not null default 1 check (version >= 1),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, record_key)
);

create index if not exists workspace_memory_records_user_updated_idx
  on public.workspace_memory_records (user_id, updated_at desc);

alter table public.workspace_memory_records enable row level security;
revoke all on table public.workspace_memory_records from anon, authenticated;
grant select, insert, update on table public.workspace_memory_records to authenticated;
grant select, insert, update, delete on table public.workspace_memory_records to service_role;

drop policy if exists "Users read their own memory records" on public.workspace_memory_records;
create policy "Users read their own memory records" on public.workspace_memory_records
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "Users add their own memory records" on public.workspace_memory_records;
create policy "Users add their own memory records" on public.workspace_memory_records
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "Users change their own memory records" on public.workspace_memory_records;
create policy "Users change their own memory records" on public.workspace_memory_records
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

comment on table public.workspace_memory_records is 'The notes of the memory of a person and what goes with them (cursors, events, settings), one row each. Read and changed by its owner and by the server.';

-- The version and the time are the database's.
create or replace function public.touch_workspace_memory_record()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.version := 1;
  else
    new.version := old.version + 1;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists touch_workspace_memory_record on public.workspace_memory_records;
create trigger touch_workspace_memory_record
  before insert or update on public.workspace_memory_records
  for each row execute function public.touch_workspace_memory_record();

-- Realtime sends the changed row, which a device folds into what it has (a note the server saved for a reply shows up in a page that is open).
do $$
begin
  if exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_catalog.pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'workspace_memory_records'
    ) then
    alter publication supabase_realtime add table public.workspace_memory_records;
  end if;
end;
$$;
