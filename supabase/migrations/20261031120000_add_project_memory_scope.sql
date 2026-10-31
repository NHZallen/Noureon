-- Where the notes of a project's chats are kept (docs/superpowers/specs/2026-10-31-projects-design.md, §14): 'default' (the memory of the account, as before) or 'project' (the notes learned in its
-- chats belong to the project only, and its chats read only those). It is chosen when the project is made and never changed afterwards, so the update below leaves it as it is.
-- A page that does not know it (an older one) sends none: a new folder is then 'default'.

alter table public.workspace_folders add column if not exists memory_scope text not null default 'default';
alter table public.workspace_folders drop constraint if exists workspace_folders_memory_scope_check;
alter table public.workspace_folders add constraint workspace_folders_memory_scope_check check (memory_scope in ('default', 'project'));

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
    id, user_id, name, color, icon, text_color, deleted_at, instructions, pinned, sources, memory_scope
  )
  select
    (items.value ->> 'id')::uuid,
    v_user_id,
    items.value ->> 'name',
    coalesce(items.value ->> 'color', 'gray'),
    coalesce(items.value ->> 'icon', 'default'),
    coalesce(items.value ->> 'text_color', 'gray'),
    (items.value ->> 'deleted_at')::timestamptz,
    left(coalesce(items.value ->> 'instructions', ''), 8000),
    coalesce((items.value ->> 'pinned')::boolean, false),
    case when pg_catalog.jsonb_typeof(items.value -> 'sources') = 'array' then items.value -> 'sources' else '[]'::jsonb end,
    case when items.value ->> 'memory_scope' = 'project' then 'project' else 'default' end
  from pg_catalog.jsonb_array_elements(p_rows) items(value)
  on conflict (id) do update
  set name = excluded.name,
      color = excluded.color,
      icon = excluded.icon,
      text_color = excluded.text_color,
      deleted_at = excluded.deleted_at,
      -- A page that does not know the instructions (an older version) sends no `instructions`: what is kept stays.
      instructions = coalesce(
        (select left(items.value ->> 'instructions', 8000)
         from pg_catalog.jsonb_array_elements(p_rows) items(value)
         where (items.value ->> 'id')::uuid = excluded.id
           and items.value ? 'instructions'
         limit 1),
        workspace_folders.instructions
      ),
      -- The same for a pin: a page that does not know it (an older one) sends none, and what is kept stays.
      pinned = coalesce(
        (select (items.value ->> 'pinned')::boolean
         from pg_catalog.jsonb_array_elements(p_rows) items(value)
         where (items.value ->> 'id')::uuid = excluded.id
           and items.value ? 'pinned'
         limit 1),
        workspace_folders.pinned
      ),
      -- And the same for the sources. (memory_scope is not in this list on purpose: it is chosen when the project is made and never changed.)
      sources = coalesce(
        (select items.value -> 'sources'
         from pg_catalog.jsonb_array_elements(p_rows) items(value)
         where (items.value ->> 'id')::uuid = excluded.id
           and pg_catalog.jsonb_typeof(items.value -> 'sources') = 'array'
         limit 1),
        workspace_folders.sources
      )
  where workspace_folders.user_id = v_user_id;
end;
$$;

revoke all on function public.upsert_workspace_folders(jsonb) from public, anon;
grant execute on function public.upsert_workspace_folders(jsonb) to authenticated;

-- The server's look back through the past conversations also tells which project each conversation is in and which projects keep their notes for themselves
-- (docs/superpowers/specs/2026-10-31-projects-design.md, §14), so a search can stay inside one project. Nothing else changes.

create or replace function public.server_read_history(
  p_user_id uuid,
  p_max_conversations integer default 150,
  p_max_messages integer default 6000
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with chosen as (
    select c.id, c.updated_at, c.folder_id
    from public.workspace_conversations c
    where c.user_id = p_user_id and c.deleted_at is null
    order by c.updated_at desc
    limit least(greatest(p_max_conversations, 1), 300)
  ),
  texts as (
    select m.conversation_id, m.role, m.created_at, m.sequence, chosen.updated_at as conversation_updated_at,
      (select coalesce(jsonb_agg(jsonb_build_object('text', part ->> 'text')), '[]'::jsonb)
         from jsonb_array_elements(case when jsonb_typeof(m.parts) = 'array' then m.parts else '[]'::jsonb end) as part
         where jsonb_typeof(part -> 'text') = 'string') as parts
    from public.workspace_messages m
    join chosen on chosen.id = m.conversation_id
    where m.user_id = p_user_id and m.deleted_at is null and m.status = 'complete' and m.role in ('user', 'model')
    order by chosen.updated_at desc, m.conversation_id, m.sequence
    limit least(greatest(p_max_messages, 1), 10000)
  )
  select jsonb_build_object(
    'conversations', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'updated_at', updated_at, 'folder_id', folder_id) order by updated_at desc) from chosen), '[]'::jsonb),
    -- The projects whose notes are kept for the project only (the search of a chat then looks only at the chats of the same project).
    'project_folders', coalesce((select jsonb_agg(f.id) from public.workspace_folders f where f.user_id = p_user_id and f.deleted_at is null and f.memory_scope = 'project'), '[]'::jsonb),
    'messages', coalesce((select jsonb_agg(jsonb_build_object('conversation_id', conversation_id, 'role', role, 'created_at', created_at, 'sequence', sequence, 'parts', parts) order by conversation_updated_at desc, conversation_id, sequence) from texts), '[]'::jsonb)
  );
$$;

revoke all on function public.server_read_history(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.server_read_history(uuid, integer, integer) to service_role;
