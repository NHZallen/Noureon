-- The sources of a project (docs/superpowers/specs/2026-10-31-projects-design.md, §5 and §13): up to 20 texts and files, each kept as the text that was typed or read from the file
-- ({ id, kind: 'text' | 'file', title, mime, size, text, addedAt }), put into the reply of every chat of the project. They are a plain column of the folder, so the sync that carries the folder
-- carries them and fetch_workspace_delta returns them with the row. A page that does not know them (an older one) writes the folder back without `sources`: what is in the database stays.

alter table public.workspace_folders add column if not exists sources jsonb not null default '[]'::jsonb;
alter table public.workspace_folders drop constraint if exists workspace_folders_sources_check;
alter table public.workspace_folders add constraint workspace_folders_sources_check
  check (jsonb_typeof(sources) = 'array' and jsonb_array_length(sources) <= 20 and pg_column_size(sources) <= 3000000);

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
    id, user_id, name, color, icon, text_color, deleted_at, instructions, pinned, sources
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
    case when pg_catalog.jsonb_typeof(items.value -> 'sources') = 'array' then items.value -> 'sources' else '[]'::jsonb end
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
      -- And the same for the sources.
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
