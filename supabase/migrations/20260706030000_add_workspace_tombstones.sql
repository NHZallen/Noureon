create table if not exists public.workspace_tombstones (
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null check (entity_type in ('conversation', 'folder')),
  entity_id uuid not null,
  deleted_at timestamptz not null default statement_timestamp(),
  primary key (user_id, entity_type, entity_id)
);

create index if not exists workspace_tombstones_user_deleted_idx
  on public.workspace_tombstones(user_id, deleted_at desc);

alter table public.workspace_tombstones enable row level security;

drop policy if exists "Users read their own workspace tombstones"
  on public.workspace_tombstones;
create policy "Users read their own workspace tombstones"
on public.workspace_tombstones for select to authenticated
using ((select auth.uid()) = user_id);

revoke all on table public.workspace_tombstones from authenticated;
revoke all on table public.workspace_tombstones from public, anon;
grant select on table public.workspace_tombstones to authenticated;

drop policy if exists "Users manage their own workspace folders"
  on public.workspace_folders;
drop policy if exists "Users read their own workspace folders"
  on public.workspace_folders;
create policy "Users read their own workspace folders"
on public.workspace_folders for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users manage their own workspace conversations"
  on public.workspace_conversations;
drop policy if exists "Users read their own workspace conversations"
  on public.workspace_conversations;
create policy "Users read their own workspace conversations"
on public.workspace_conversations for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users manage their own workspace messages"
  on public.workspace_messages;
drop policy if exists "Users read their own workspace messages"
  on public.workspace_messages;
create policy "Users read their own workspace messages"
on public.workspace_messages for select to authenticated
using ((select auth.uid()) = user_id);

revoke insert, update, delete on table public.workspace_folders from authenticated;
revoke insert, update, delete on table public.workspace_conversations from authenticated;
revoke insert, update, delete on table public.workspace_messages from authenticated;
grant select on table public.workspace_folders to authenticated;
grant select on table public.workspace_conversations to authenticated;
grant select on table public.workspace_messages to authenticated;

create or replace function public.workspace_entity_lock_key(
  p_entity_type text,
  p_entity_id uuid
)
returns bigint
language sql
immutable
strict
security invoker
set search_path = ''
as $$
  select pg_catalog.hashtextextended(
    pg_catalog.concat_ws(':', p_entity_type, p_entity_id::text),
    0
  );
$$;

create or replace function public.upsert_workspace_folders(p_rows jsonb)
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
    raise exception 'Duplicate workspace folder ids are not allowed';
  end if;

  for v_entity_id in
    select distinct (items.value ->> 'id')::uuid
    from pg_catalog.jsonb_array_elements(p_rows) items(value)
    order by (items.value ->> 'id')::uuid
  loop
    if v_entity_id is null then
      raise exception 'Workspace folder id is required';
    end if;
    perform pg_catalog.pg_advisory_xact_lock(
      public.workspace_entity_lock_key('folder', v_entity_id)
    );
    if exists (
      select 1
      from public.workspace_tombstones tombstones
      where tombstones.user_id = v_user_id
        and tombstones.entity_type = 'folder'
        and tombstones.entity_id = v_entity_id
    ) then
      raise exception 'Workspace folder is deleted';
    end if;
    if exists (
      select 1
      from public.workspace_folders folders
      where folders.id = v_entity_id
        and folders.user_id <> v_user_id
    ) then
      raise exception 'Workspace folder belongs to another user';
    end if;
  end loop;

  insert into public.workspace_folders (
    id, user_id, name, color, icon, text_color, deleted_at
  )
  select
    (items.value ->> 'id')::uuid,
    v_user_id,
    items.value ->> 'name',
    coalesce(items.value ->> 'color', 'gray'),
    coalesce(items.value ->> 'icon', 'default'),
    coalesce(items.value ->> 'text_color', 'gray'),
    (items.value ->> 'deleted_at')::timestamptz
  from pg_catalog.jsonb_array_elements(p_rows) items(value)
  on conflict (id) do update
  set name = excluded.name,
      color = excluded.color,
      icon = excluded.icon,
      text_color = excluded.text_color,
      deleted_at = excluded.deleted_at
  where workspace_folders.user_id = v_user_id;
end;
$$;

create or replace function public.upsert_workspace_conversations(p_rows jsonb)
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
    raise exception 'Duplicate workspace conversation ids are not allowed';
  end if;

  for v_entity_id in
    select distinct (items.value ->> 'folder_id')::uuid
    from pg_catalog.jsonb_array_elements(p_rows) items(value)
    where items.value ->> 'folder_id' is not null
    order by (items.value ->> 'folder_id')::uuid
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      public.workspace_entity_lock_key('folder', v_entity_id)
    );
    if exists (
      select 1
      from public.workspace_tombstones tombstones
      where tombstones.user_id = v_user_id
        and tombstones.entity_type = 'folder'
        and tombstones.entity_id = v_entity_id
    ) then
      raise exception 'Workspace folder is deleted';
    end if;
    if not exists (
      select 1
      from public.workspace_folders folders
      where folders.id = v_entity_id
        and folders.user_id = v_user_id
    ) then
      raise exception 'Workspace folder not found';
    end if;
  end loop;

  for v_entity_id in
    select distinct (items.value ->> 'id')::uuid
    from pg_catalog.jsonb_array_elements(p_rows) items(value)
    order by (items.value ->> 'id')::uuid
  loop
    if v_entity_id is null then
      raise exception 'Workspace conversation id is required';
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
    if exists (
      select 1
      from public.workspace_conversations conversations
      where conversations.id = v_entity_id
        and conversations.user_id <> v_user_id
    ) then
      raise exception 'Workspace conversation belongs to another user';
    end if;
  end loop;

  insert into public.workspace_conversations (
    id, user_id, folder_id, title, summary, model, provider, metadata,
    archived, pinned, created_at, deleted_at
  )
  select
    (items.value ->> 'id')::uuid,
    v_user_id,
    (items.value ->> 'folder_id')::uuid,
    items.value ->> 'title',
    coalesce(items.value ->> 'summary', ''),
    items.value ->> 'model',
    items.value ->> 'provider',
    case
      when pg_catalog.jsonb_typeof(items.value -> 'metadata') = 'object'
        then items.value -> 'metadata'
      else '{}'::jsonb
    end,
    coalesce((items.value ->> 'archived')::boolean, false),
    coalesce((items.value ->> 'pinned')::boolean, false),
    (items.value ->> 'created_at')::timestamptz,
    (items.value ->> 'deleted_at')::timestamptz
  from pg_catalog.jsonb_array_elements(p_rows) items(value)
  on conflict (id) do update
  set folder_id = excluded.folder_id,
      title = excluded.title,
      summary = excluded.summary,
      model = excluded.model,
      provider = excluded.provider,
      metadata = excluded.metadata,
      archived = excluded.archived,
      pinned = excluded.pinned,
      created_at = excluded.created_at,
      deleted_at = excluded.deleted_at
  where workspace_conversations.user_id = v_user_id;
end;
$$;

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
    id, user_id, conversation_id, role, parts, status, sequence,
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
    coalesce(items.value ->> 'status', 'complete'),
    (items.value ->> 'sequence')::bigint,
    (items.value ->> 'created_at')::timestamptz,
    (items.value ->> 'deleted_at')::timestamptz
  from pg_catalog.jsonb_array_elements(p_rows) items(value)
  on conflict (id) do update
  set conversation_id = excluded.conversation_id,
      role = excluded.role,
      parts = excluded.parts,
      status = excluded.status,
      sequence = excluded.sequence,
      created_at = excluded.created_at,
      deleted_at = excluded.deleted_at
  where workspace_messages.user_id = v_user_id;
end;
$$;

drop function if exists public.permanently_delete_workspace_conversations(uuid[]);
create function public.permanently_delete_workspace_conversations(
  p_conversation_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_conversation_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  for v_conversation_id in
    select distinct conversation_id
    from pg_catalog.unnest(
      coalesce(p_conversation_ids, array[]::uuid[])
    ) conversation_ids(conversation_id)
    where conversation_id is not null
    order by conversation_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      public.workspace_entity_lock_key('conversation', v_conversation_id)
    );
    perform 1
    from public.workspace_tombstones tombstones
    where tombstones.user_id = v_user_id
      and tombstones.entity_type = 'conversation'
      and tombstones.entity_id = v_conversation_id;
    if exists (
      select 1
      from public.workspace_conversations conversations
      where conversations.id = v_conversation_id
        and conversations.user_id <> v_user_id
    ) then
      raise exception 'Workspace conversation belongs to another user';
    end if;
  end loop;

  insert into public.workspace_tombstones(user_id, entity_type, entity_id)
  select distinct v_user_id, 'conversation', conversation_ids.conversation_id
  from pg_catalog.unnest(
    coalesce(p_conversation_ids, array[]::uuid[])
  ) conversation_ids(conversation_id)
  where conversation_ids.conversation_id is not null
  on conflict (user_id, entity_type, entity_id) do nothing;

  delete from public.workspace_conversations conversations
  where conversations.user_id = v_user_id
    and conversations.id = any(
      coalesce(p_conversation_ids, array[]::uuid[])
    );
end;
$$;

create or replace function public.permanently_delete_workspace_folder(
  p_folder_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_folder_id is null then
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    public.workspace_entity_lock_key('folder', p_folder_id)
  );
  perform 1
  from public.workspace_tombstones tombstones
  where tombstones.user_id = v_user_id
    and tombstones.entity_type = 'folder'
    and tombstones.entity_id = p_folder_id;
  if exists (
    select 1
    from public.workspace_folders folders
    where folders.id = p_folder_id
      and folders.user_id <> v_user_id
  ) then
    raise exception 'Workspace folder belongs to another user';
  end if;

  insert into public.workspace_tombstones(user_id, entity_type, entity_id)
  select v_user_id, 'folder', p_folder_id
  on conflict (user_id, entity_type, entity_id) do nothing;

  update public.workspace_conversations
  set folder_id = null
  where user_id = v_user_id
    and folder_id = p_folder_id;

  delete from public.workspace_folders
  where user_id = v_user_id
    and id = p_folder_id;
end;
$$;

revoke all on function public.workspace_entity_lock_key(text, uuid)
  from public, anon, authenticated;
revoke all on function public.upsert_workspace_folders(jsonb) from public, anon;
revoke all on function public.upsert_workspace_conversations(jsonb) from public, anon;
revoke all on function public.upsert_workspace_messages(jsonb) from public, anon;
revoke all on function public.permanently_delete_workspace_conversations(uuid[])
  from public, anon;
revoke all on function public.permanently_delete_workspace_folder(uuid)
  from public, anon;

grant execute on function public.upsert_workspace_folders(jsonb) to authenticated;
grant execute on function public.upsert_workspace_conversations(jsonb) to authenticated;
grant execute on function public.upsert_workspace_messages(jsonb) to authenticated;
grant execute on function public.permanently_delete_workspace_conversations(uuid[])
  to authenticated;
grant execute on function public.permanently_delete_workspace_folder(uuid)
  to authenticated;
