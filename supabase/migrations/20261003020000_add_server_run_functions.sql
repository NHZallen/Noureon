-- What the server (and only the server, with the service key) may do about replies it runs
-- (docs/superpowers/specs/2026-10-03-server-runtime-design.md, §5).
--
-- The server never writes the message table directly: it goes through the same locks and checks the browser's own writes
-- go through (upsert_workspace_messages), with the person's id given instead of read from a sign-in, and two more guards.

-- 0. The request of a run (everything but its keys), kept so a run can be taken up again after a restart. Written right after the
--    run is accepted and read when it is taken up; never readable by a person (the column grant of server_runs names the columns).
alter table public.server_runs add column if not exists spec jsonb;

-- 1. A message the server is writing. Same locks as the browser's write, so the two take turns; refuses a deleted conversation;
--    does not bring back a message the person deleted; and does not turn a finished message back into a streaming one.
create or replace function public.server_upsert_workspace_message(p_user_id uuid, p_row jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_message_id uuid;
  v_conversation_id uuid;
  v_existing_user uuid;
  v_existing_status text;
  v_existing_deleted timestamptz;
  v_existing_sequence bigint;
begin
  if p_user_id is null then
    raise exception 'User id required';
  end if;
  if p_row is null or pg_catalog.jsonb_typeof(p_row) <> 'object' then
    raise exception 'JSON object required';
  end if;
  v_message_id := (p_row ->> 'id')::uuid;
  v_conversation_id := (p_row ->> 'conversation_id')::uuid;
  if v_message_id is null or v_conversation_id is null then
    raise exception 'Message id and conversation id are required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(public.workspace_entity_lock_key('conversation', v_conversation_id));
  if exists (
    select 1 from public.workspace_tombstones tombstones
    where tombstones.user_id = p_user_id
      and tombstones.entity_type = 'conversation'
      and tombstones.entity_id = v_conversation_id
  ) then
    raise exception 'Workspace conversation is deleted';
  end if;
  if not exists (
    select 1 from public.workspace_conversations conversations
    where conversations.id = v_conversation_id and conversations.user_id = p_user_id
  ) then
    raise exception 'Workspace conversation not found';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(public.workspace_entity_lock_key('message', v_message_id));
  select messages.user_id, messages.status, messages.deleted_at, messages.sequence
    into v_existing_user, v_existing_status, v_existing_deleted, v_existing_sequence
  from public.workspace_messages messages
  where messages.id = v_message_id;
  if found then
    if v_existing_user <> p_user_id then
      raise exception 'Workspace message belongs to another user';
    end if;
    if v_existing_deleted is not null then
      return;
    end if;
    if v_existing_status in ('complete', 'error') and coalesce(p_row ->> 'status', 'complete') = 'streaming' then
      return;
    end if;
  end if;

  insert into public.workspace_messages (
    id, user_id, conversation_id, role, parts, metadata, status, sequence, created_at
  )
  values (
    v_message_id,
    p_user_id,
    v_conversation_id,
    coalesce(p_row ->> 'role', 'model'),
    case when pg_catalog.jsonb_typeof(p_row -> 'parts') = 'array' then p_row -> 'parts' else '[]'::jsonb end,
    case when pg_catalog.jsonb_typeof(p_row -> 'metadata') = 'object' then p_row -> 'metadata' else null end,
    coalesce(p_row ->> 'status', 'complete'),
    coalesce((p_row ->> 'sequence')::bigint, v_existing_sequence),
    coalesce((p_row ->> 'created_at')::timestamptz, pg_catalog.now())
  )
  on conflict (id) do update
  set parts = excluded.parts,
      metadata = case when excluded.metadata is null then public.workspace_messages.metadata else excluded.metadata end,
      status = excluded.status
  where public.workspace_messages.user_id = p_user_id;
end;
$$;

revoke all on function public.server_upsert_workspace_message(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.server_upsert_workspace_message(uuid, jsonb) to service_role;

-- 2. A run accepted. The check on how many a person has running and the new row happen under one lock, so two requests at the
--    same moment cannot both get past the limit.
create or replace function public.server_start_run(
  p_user_id uuid,
  p_conversation_id uuid,
  p_message_id uuid,
  p_model jsonb,
  p_key_envelope text,
  p_key_version smallint,
  p_key_expires_at timestamptz,
  p_max_live integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_live integer;
  v_run_id uuid;
begin
  if p_user_id is null or p_conversation_id is null or p_message_id is null then
    raise exception 'bad_request' using errcode = 'P0001';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('server_runs:' || p_user_id::text, 0));
  if exists (
    select 1 from public.workspace_tombstones tombstones
    where tombstones.user_id = p_user_id
      and tombstones.entity_type = 'conversation'
      and tombstones.entity_id = p_conversation_id
  ) or not exists (
    select 1 from public.workspace_conversations conversations
    where conversations.id = p_conversation_id
      and conversations.user_id = p_user_id
      and conversations.deleted_at is null
  ) then
    raise exception 'conversation_not_found' using errcode = 'P0002';
  end if;
  select pg_catalog.count(*) into v_live
  from public.server_runs runs
  where runs.user_id = p_user_id and runs.status in ('queued', 'running');
  if v_live >= greatest(coalesce(p_max_live, 1), 1) then
    raise exception 'too_many_runs' using errcode = 'P0001';
  end if;
  insert into public.server_runs (
    user_id, conversation_id, message_id, status, model,
    key_envelope, key_version, key_expires_at, heartbeat_at
  )
  values (
    p_user_id, p_conversation_id, p_message_id, 'queued', coalesce(p_model, '{}'::jsonb),
    p_key_envelope, p_key_version, p_key_expires_at, pg_catalog.now()
  )
  returning id into v_run_id;
  return v_run_id;
end;
$$;

revoke all on function public.server_start_run(uuid, uuid, uuid, jsonb, text, smallint, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.server_start_run(uuid, uuid, uuid, jsonb, text, smallint, timestamptz, integer) to service_role;

-- 3. Runs that lost their process (a restart, an update, a crash): taken up by one server process at a time. A run is taken up
--    when its heartbeat is older than `p_stale_seconds`; each taking-up counts, and a run taken up too often is failed instead.
create or replace function public.server_claim_stale_runs(p_stale_seconds integer, p_max_attempts integer, p_limit integer)
returns table (
  id uuid,
  user_id uuid,
  conversation_id uuid,
  message_id uuid,
  model jsonb,
  checkpoint jsonb,
  key_envelope text,
  key_version smallint,
  key_expires_at timestamptz,
  attempts integer,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.server_runs runs
  set status = 'failed',
      error_code = 'server_restarted',
      finished_at = pg_catalog.now(),
      key_envelope = null
  where runs.status in ('queued', 'running')
    and coalesce(runs.heartbeat_at, runs.created_at) < pg_catalog.now() - pg_catalog.make_interval(secs => greatest(p_stale_seconds, 1))
    and (runs.attempts >= p_max_attempts or runs.key_envelope is null);

  return query
  with taken as (
    select runs.id
    from public.server_runs runs
    where runs.status in ('queued', 'running')
      and coalesce(runs.heartbeat_at, runs.created_at) < pg_catalog.now() - pg_catalog.make_interval(secs => greatest(p_stale_seconds, 1))
      and runs.attempts < p_max_attempts
      and runs.key_envelope is not null
    order by runs.created_at
    limit greatest(p_limit, 1)
    for update skip locked
  )
  update public.server_runs runs
  set attempts = runs.attempts + 1,
      heartbeat_at = pg_catalog.now()
  from taken
  where runs.id = taken.id
  returning runs.id, runs.user_id, runs.conversation_id, runs.message_id, runs.model, runs.checkpoint,
            runs.key_envelope, runs.key_version, runs.key_expires_at, runs.attempts, runs.created_at;
end;
$$;

revoke all on function public.server_claim_stale_runs(integer, integer, integer) from public, anon, authenticated;
grant execute on function public.server_claim_stale_runs(integer, integer, integer) to service_role;
