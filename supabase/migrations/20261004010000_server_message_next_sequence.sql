-- The server asks for the next place in a conversation without reading the message table (it may only call the functions of
-- 20261003020000): a reply it writes after the others (a note of how the visual check ended, a corrected reply) comes with no
-- sequence, and the place is taken here, under the conversation's lock. Everything else is as in 20261003100000.
create or replace function public.server_upsert_workspace_message(p_user_id uuid, p_row jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_message_id uuid;
  v_conversation_id uuid;
  v_sequence bigint;
  v_existing_user uuid;
  v_existing_status text;
  v_existing_deleted timestamptz;
  v_existing_sequence bigint;
  v_other_id uuid;
  v_is_new boolean;
begin
  if p_user_id is null then
    raise exception 'User id required';
  end if;
  if p_row is null or pg_catalog.jsonb_typeof(p_row) <> 'object' then
    raise exception 'JSON object required';
  end if;
  v_message_id := (p_row ->> 'id')::uuid;
  v_conversation_id := (p_row ->> 'conversation_id')::uuid;
  v_sequence := (p_row ->> 'sequence')::bigint;
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
  v_is_new := not found;
  if not v_is_new then
    if v_existing_user <> p_user_id then
      raise exception 'Workspace message belongs to another user';
    end if;
    if v_existing_deleted is not null then
      return;
    end if;
    if v_existing_status in ('complete', 'error') and coalesce(p_row ->> 'status', 'complete') = 'streaming' then
      return;
    end if;
  elsif v_sequence is null then
    -- A message that takes the next place in the conversation (a note of how a visual check ended, a corrected reply): the place is found
    -- here, under the lock, so the server does not need to read the table.
    select coalesce(pg_catalog.max(messages.sequence), -1) + 1 into v_sequence
    from public.workspace_messages messages
    where messages.conversation_id = v_conversation_id and messages.user_id = p_user_id;
  end if;
  if v_is_new and v_sequence is not null then
    -- Another message holds the place this one takes: moved out of the way when it is a reply of the model or already deleted.
    select messages.id into v_other_id
    from public.workspace_messages messages
    where messages.conversation_id = v_conversation_id
      and messages.user_id = p_user_id
      and messages.sequence = v_sequence
      and messages.id <> v_message_id
      and (messages.role = 'model' or messages.deleted_at is not null)
    for update;
    if found then
      update public.workspace_messages
      set sequence = - (pg_catalog.floor(extract(epoch from pg_catalog.clock_timestamp()) * 1000000))::bigint,
          deleted_at = coalesce(deleted_at, pg_catalog.now())
      where id = v_other_id;
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
    coalesce(v_sequence, v_existing_sequence),
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
