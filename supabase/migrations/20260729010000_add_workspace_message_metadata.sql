alter table public.workspace_messages
  add column if not exists metadata jsonb;

create or replace function public.upsert_workspace_messages(p_rows jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_entity_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_rows is null or p_rows = 'null'::jsonb then
    return;
  end if;
  if pg_catalog.jsonb_typeof(p_rows) <> 'array' then
    raise exception 'JSON array required';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_rows) items(value)
    group by (items.value ->> 'id')::uuid
    having pg_catalog.count(*) > 1
  ) then
    raise exception 'Duplicate workspace message ids are not allowed';
  end if;

  for v_entity_id in
    select distinct (items.value ->> 'conversation_id')::uuid
    from pg_catalog.jsonb_array_elements(p_rows) items(value)
    order by (items.value ->> 'conversation_id')::uuid
  loop
    if v_entity_id is null then
      raise exception 'Workspace message conversation id is required';
    end if;
    perform pg_catalog.pg_advisory_xact_lock(
      public.workspace_entity_lock_key('conversation', v_entity_id)
    );
    if exists (
      select 1
      from public.workspace_tombstones tombstones
      where tombstones.user_id = v_user_id
        and tombstones.entity_type = 'conversation'
        and tombstones.entity_id = v_entity_id
    ) then
      raise exception 'Workspace conversation is deleted';
    end if;
    if not exists (
      select 1
      from public.workspace_conversations conversations
      where conversations.id = v_entity_id
        and conversations.user_id = v_user_id
    ) then
      raise exception 'Workspace conversation not found';
    end if;
  end loop;

  for v_entity_id in
    select distinct (items.value ->> 'id')::uuid
    from pg_catalog.jsonb_array_elements(p_rows) items(value)
    order by (items.value ->> 'id')::uuid
  loop
    if v_entity_id is null then
      raise exception 'Workspace message id is required';
    end if;
    perform pg_catalog.pg_advisory_xact_lock(
      public.workspace_entity_lock_key('message', v_entity_id)
    );
    if exists (
      select 1
      from public.workspace_messages messages
      where messages.id = v_entity_id
        and messages.user_id <> v_user_id
    ) then
      raise exception 'Workspace message belongs to another user';
    end if;
  end loop;

  insert into public.workspace_messages (
    id, user_id, conversation_id, role, parts, metadata, status, sequence,
    created_at, deleted_at
  )
  select
    (items.value ->> 'id')::uuid,
    v_user_id,
    (items.value ->> 'conversation_id')::uuid,
    items.value ->> 'role',
    case
      when pg_catalog.jsonb_typeof(items.value -> 'parts') = 'array'
        then items.value -> 'parts'
      else '[]'::jsonb
    end,
    case
      when pg_catalog.jsonb_typeof(items.value -> 'metadata') = 'object'
        then items.value -> 'metadata'
      else null
    end,
    coalesce(items.value ->> 'status', 'complete'),
    (items.value ->> 'sequence')::bigint,
    (items.value ->> 'created_at')::timestamptz,
    (items.value ->> 'deleted_at')::timestamptz
  from pg_catalog.jsonb_array_elements(p_rows) items(value)
  on conflict (id) do update
  set conversation_id = excluded.conversation_id,
      role = excluded.role,
      parts = excluded.parts,
      metadata = case
        when excluded.metadata is null then workspace_messages.metadata
        else excluded.metadata
      end,
      status = excluded.status,
      sequence = excluded.sequence,
      created_at = excluded.created_at,
      deleted_at = excluded.deleted_at
  where workspace_messages.user_id = v_user_id;
end;
$$;
