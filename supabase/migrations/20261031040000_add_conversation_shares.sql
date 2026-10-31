-- Sharing a conversation (docs/superpowers/specs/2026-10-31-conversation-share-design.md): a person gives a link to a snapshot of one conversation. The snapshot is made by
-- the server (it reads the conversation through `server_read_conversation_for_share`, leaves the memory out, copies the files to the public bucket `shared-assets`) and
-- kept in `conversation_shares`. Whoever has the link reads it through `get_shared_conversation` (no sign-in), which gives only a share that is active.
--
--   conversation_shares                  one row for each share. Nobody reads or writes it directly (no policy, no grant): the functions below are the only way.
--   share_reports                        what a reader says about a share ("report"); only the service role reads it.
--   server_read_conversation_for_share   the conversation and its finished messages, and how many shares the person has now (service role only).
--   server_create_conversation_share     a row with the status `building` (the limit of 30 is checked here); the files are copied while it is `building`.
--   server_finish_conversation_share     puts the snapshot in and makes it `active` (also for a refresh of an active one).
--   server_get_conversation_share        one share of a person (for a refresh).
--   server_drop_conversation_share       takes away one share of a person (a copy that failed).
--   server_drop_stale_building_shares    takes away the rows that stayed `building` (a copy that did not finish).
--   get_shared_conversation(code)        for anyone: the snapshot of an active share (title, mode, the name only when the person chose to show it), or nothing.
--   report_shared_conversation(code, why)  for anyone: one line for the owner of the service to read.
--   list_my_conversation_shares()        the signed-in person's own shares, without the snapshot.
--   revoke_conversation_share(id)        the person takes a share away (also the record of one whose conversation was deleted).
--   orphan_shared_assets(limit)          the files of the bucket that no share (active or being built) points to (service role only: the server removes them through the storage API).
-- A conversation deleted (put in the trash or for good) makes its shares `conversation_deleted` and empties their snapshot: the link shows nothing at once.

insert into storage.buckets (id, name, public, file_size_limit)
values ('shared-assets', 'shared-assets', true, 104857600)
on conflict (id) do update set public = true, file_size_limit = 104857600;

create table if not exists public.conversation_shares (
  id uuid primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  conversation_id uuid not null,
  code text not null unique check (char_length(code) between 24 and 64 and code ~ '^[0-9A-Za-z]+$'),
  mode text not null check (mode in ('view', 'continue')),
  show_name boolean not null default false,
  owner_name text not null default '' check (char_length(owner_name) <= 80),
  title text not null default '' check (char_length(title) <= 200),
  snapshot jsonb not null default '{}'::jsonb,
  snapshot_bytes integer not null default 0 check (snapshot_bytes >= 0),
  status text not null default 'building' check (status in ('building', 'active', 'conversation_deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists conversation_shares_owner_idx on public.conversation_shares (owner_id, created_at desc);
create index if not exists conversation_shares_conversation_idx on public.conversation_shares (owner_id, conversation_id);

alter table public.conversation_shares enable row level security;
revoke all on table public.conversation_shares from public, anon, authenticated;
grant all on table public.conversation_shares to service_role;

create table if not exists public.share_reports (
  id uuid primary key default gen_random_uuid(),
  share_id uuid not null,
  code text not null,
  reason text not null default '' check (char_length(reason) <= 500),
  created_at timestamptz not null default now()
);

create index if not exists share_reports_share_idx on public.share_reports (share_id, created_at desc);

alter table public.share_reports enable row level security;
revoke all on table public.share_reports from public, anon, authenticated;
grant all on table public.share_reports to service_role;

comment on table public.conversation_shares is 'A snapshot of a conversation that a person shares by a link. Read and written only through functions.';
comment on table public.share_reports is 'What a reader said about a share. Read by the owner of the service only.';

-- ---------- for the server

create or replace function public.server_read_conversation_for_share(p_user_id uuid, p_conversation_id uuid, p_max_messages integer default 2000)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when c.id is null then null
    else jsonb_build_object(
      'conversation', jsonb_build_object('id', c.id, 'title', c.title, 'model', c.model, 'provider', c.provider, 'created_at', c.created_at, 'updated_at', c.updated_at),
      'messages', coalesce((
        select jsonb_agg(jsonb_build_object('role', m.role, 'parts', m.parts, 'sequence', m.sequence, 'created_at', m.created_at) order by m.sequence)
        from (
          select * from public.workspace_messages
          where conversation_id = c.id and user_id = p_user_id and deleted_at is null and status = 'complete' and role in ('user', 'model')
          order by sequence
          limit least(greatest(p_max_messages, 1), 5000)
        ) m
      ), '[]'::jsonb),
      'active_shares', (select count(*) from public.conversation_shares s where s.owner_id = p_user_id and s.status in ('active', 'building'))
    )
  end
  from (select 1) as one
  left join public.workspace_conversations c on c.id = p_conversation_id and c.user_id = p_user_id and c.deleted_at is null;
$$;

create or replace function public.server_create_conversation_share(
  p_share_id uuid,
  p_user_id uuid,
  p_conversation_id uuid,
  p_code text,
  p_mode text,
  p_show_name boolean,
  p_owner_name text,
  p_title text,
  p_limit integer default 30
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.conversation_shares where owner_id = p_user_id and status in ('active', 'building')) >= p_limit then
    raise exception 'share_limit' using errcode = 'P0001';
  end if;
  insert into public.conversation_shares (id, owner_id, conversation_id, code, mode, show_name, owner_name, title, status)
  values (p_share_id, p_user_id, p_conversation_id, p_code, p_mode, coalesce(p_show_name, false), left(coalesce(p_owner_name, ''), 80), left(coalesce(p_title, ''), 200), 'building');
end;
$$;

-- Puts the snapshot in and makes the share active; for a share that is active already it is a refresh (the mode and the choice of the name are kept or changed as asked).
create or replace function public.server_finish_conversation_share(
  p_share_id uuid,
  p_user_id uuid,
  p_title text,
  p_snapshot jsonb,
  p_snapshot_bytes integer,
  p_show_name boolean default null,
  p_owner_name text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows integer;
begin
  update public.conversation_shares
  set title = left(coalesce(p_title, title), 200),
      snapshot = p_snapshot,
      snapshot_bytes = greatest(coalesce(p_snapshot_bytes, 0), 0),
      show_name = coalesce(p_show_name, show_name),
      owner_name = left(coalesce(p_owner_name, owner_name), 80),
      status = 'active',
      updated_at = now()
  where id = p_share_id and owner_id = p_user_id and status in ('building', 'active');
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

create or replace function public.server_get_conversation_share(p_user_id uuid, p_share_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('id', s.id, 'conversation_id', s.conversation_id, 'code', s.code, 'mode', s.mode, 'show_name', s.show_name, 'owner_name', s.owner_name, 'title', s.title, 'status', s.status, 'created_at', s.created_at)
  from public.conversation_shares s
  where s.id = p_share_id and s.owner_id = p_user_id;
$$;

create or replace function public.server_drop_conversation_share(p_user_id uuid, p_share_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows integer;
begin
  delete from public.conversation_shares where id = p_share_id and owner_id = p_user_id;
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

create or replace function public.server_drop_stale_building_shares(p_older_than interval default interval '1 hour')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows integer;
begin
  delete from public.conversation_shares where status = 'building' and created_at < now() - p_older_than;
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

create or replace function public.orphan_shared_assets(p_limit integer default 500)
returns table (name text, size bigint)
language sql
stable
security definer
set search_path = public, storage, pg_temp
as $$
  select o.name::text, (o.metadata->>'size')::bigint
  from storage.objects o
  where o.bucket_id = 'shared-assets'
    and not exists (
      select 1 from public.conversation_shares s
      where s.id::text = (storage.foldername(o.name))[1] and s.status in ('active', 'building')
    )
  limit greatest(1, least(p_limit, 5000));
$$;

-- ---------- for whoever has a link

create or replace function public.get_shared_conversation(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'title', s.title,
    'mode', s.mode,
    'ownerName', case when s.show_name then nullif(s.owner_name, '') else null end,
    'createdAt', s.created_at,
    'updatedAt', s.updated_at,
    'snapshot', s.snapshot
  )
  from public.conversation_shares s
  where s.code = p_code and s.status = 'active';
$$;

create or replace function public.report_shared_conversation(p_code text, p_reason text default '')
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_share public.conversation_shares;
begin
  select * into v_share from public.conversation_shares where code = p_code and status = 'active';
  if not found then
    return false;
  end if;
  -- A share does not need more than a few hundred reports to be looked at.
  if (select count(*) from public.share_reports where share_id = v_share.id) >= 300 then
    return true;
  end if;
  insert into public.share_reports (share_id, code, reason) values (v_share.id, v_share.code, left(coalesce(p_reason, ''), 500));
  return true;
end;
$$;

-- ---------- for the signed-in person

create or replace function public.list_my_conversation_shares()
returns table (id uuid, conversation_id uuid, code text, mode text, show_name boolean, title text, status text, created_at timestamptz, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.conversation_id, s.code, s.mode, s.show_name, s.title, s.status, s.created_at, s.updated_at
  from public.conversation_shares s
  where s.owner_id = (select auth.uid()) and s.status in ('active', 'conversation_deleted')
  order by s.created_at desc;
$$;

create or replace function public.revoke_conversation_share(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;
  delete from public.conversation_shares where id = p_id and owner_id = (select auth.uid());
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

-- ---------- a conversation that goes away takes its shares' content with it

create or replace function public.conversation_shares_follow_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_goes boolean := false;
begin
  if tg_op = 'DELETE' then
    v_goes := true;
  elsif new.deleted_at is not null and old.deleted_at is null then
    v_goes := true;
  end if;
  if v_goes then
    update public.conversation_shares
    set status = 'conversation_deleted', snapshot = '{}'::jsonb, snapshot_bytes = 0, updated_at = now()
    where owner_id = old.user_id and conversation_id = old.id and status in ('active', 'building');
  end if;
  return null;
end;
$$;

drop trigger if exists conversation_shares_follow_conversation_trg on public.workspace_conversations;
create trigger conversation_shares_follow_conversation_trg
after update of deleted_at or delete on public.workspace_conversations
for each row execute function public.conversation_shares_follow_conversation();

-- ---------- who may call what

revoke all on function public.server_read_conversation_for_share(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.server_create_conversation_share(uuid, uuid, uuid, text, text, boolean, text, text, integer) from public, anon, authenticated;
revoke all on function public.server_finish_conversation_share(uuid, uuid, text, jsonb, integer, boolean, text) from public, anon, authenticated;
revoke all on function public.server_get_conversation_share(uuid, uuid) from public, anon, authenticated;
revoke all on function public.server_drop_conversation_share(uuid, uuid) from public, anon, authenticated;
revoke all on function public.server_drop_stale_building_shares(interval) from public, anon, authenticated;
revoke all on function public.orphan_shared_assets(integer) from public, anon, authenticated;
revoke all on function public.get_shared_conversation(text) from public;
revoke all on function public.report_shared_conversation(text, text) from public;
revoke all on function public.list_my_conversation_shares() from public, anon;
revoke all on function public.revoke_conversation_share(uuid) from public, anon;
revoke all on function public.conversation_shares_follow_conversation() from public, anon, authenticated;

grant execute on function public.server_read_conversation_for_share(uuid, uuid, integer) to service_role;
grant execute on function public.server_create_conversation_share(uuid, uuid, uuid, text, text, boolean, text, text, integer) to service_role;
grant execute on function public.server_finish_conversation_share(uuid, uuid, text, jsonb, integer, boolean, text) to service_role;
grant execute on function public.server_get_conversation_share(uuid, uuid) to service_role;
grant execute on function public.server_drop_conversation_share(uuid, uuid) to service_role;
grant execute on function public.server_drop_stale_building_shares(interval) to service_role;
grant execute on function public.orphan_shared_assets(integer) to service_role;
grant execute on function public.get_shared_conversation(text) to anon, authenticated, service_role;
grant execute on function public.report_shared_conversation(text, text) to anon, authenticated, service_role;
grant execute on function public.list_my_conversation_shares() to authenticated, service_role;
grant execute on function public.revoke_conversation_share(uuid) to authenticated, service_role;
