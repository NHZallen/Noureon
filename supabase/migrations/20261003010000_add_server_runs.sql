-- Replies that the server runs for a person (docs/superpowers/specs/2026-10-03-server-runtime-design.md, §5 and §6).
--
-- A row follows one reply from the moment it is accepted until it ends. The server writes it (with the service key, which skips row
-- security); a person may only read the plain facts of their own rows. The key kept for a run while it lasts, and the progress notes
-- the run is resumed from, are never readable by a person, nor by the realtime feed: this table is deliberately NOT added to the
-- realtime publication (realtime sends whole rows, and a whole row has the encrypted key in it).

create table if not exists public.server_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null,
  message_id uuid not null,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'done', 'failed', 'stopped')),
  stop_requested boolean not null default false,
  -- Which model: provider and id only. Never a key.
  model jsonb not null default '{}'::jsonb,
  -- Where the reply had got to, to resume from after a restart (completed tool rounds and the like). Never a key.
  checkpoint jsonb,
  -- The key for this one reply, encrypted with the server's own master key; deleted when the run ends or `key_expires_at` passes.
  key_envelope text,
  key_version smallint,
  key_expires_at timestamptz,
  -- How many times the run was taken up again after a restart.
  attempts integer not null default 0 check (attempts >= 0),
  error_code text,
  usage jsonb,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  -- Set by whichever server process is running it, so another can tell a run that lost its process.
  heartbeat_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint server_runs_conversation_owner_fk
    foreign key (conversation_id, user_id)
    references public.workspace_conversations(id, user_id)
    on delete cascade
);

-- One live run for a message at a time (a message that failed can be run again, as a new row).
create unique index if not exists server_runs_one_live_run_per_message_idx
  on public.server_runs(message_id)
  where status in ('queued', 'running');

-- How many replies a person has running, and which runs have lost their process.
create index if not exists server_runs_user_status_idx
  on public.server_runs(user_id, status);
create index if not exists server_runs_live_heartbeat_idx
  on public.server_runs(heartbeat_at)
  where status in ('queued', 'running');
create index if not exists server_runs_key_expiry_idx
  on public.server_runs(key_expires_at)
  where key_envelope is not null;

drop trigger if exists touch_server_runs_updated_at on public.server_runs;
create trigger touch_server_runs_updated_at
before insert or update on public.server_runs
for each row execute function public.touch_workspace_entity_updated_at();

alter table public.server_runs enable row level security;

drop policy if exists "Users read their own server runs" on public.server_runs;
create policy "Users read their own server runs"
on public.server_runs
for select
to authenticated
using ((select auth.uid()) = user_id);

-- Nothing is written by a person (the server does it), and what a person may read is named column by column.
revoke all on public.server_runs from anon, authenticated;
grant select (
  id, user_id, conversation_id, message_id, status, stop_requested, model,
  attempts, error_code, usage, created_at, started_at, finished_at, updated_at
) on public.server_runs to authenticated;
