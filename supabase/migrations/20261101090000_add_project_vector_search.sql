-- The passages of the files of the projects get vectors in the same table as the past conversations (workspace_memory_vectors), under piece ids `src:<id of the source>:<number>`
-- (docs/superpowers/specs/2026-11-01-project-files-multimodal-design.md, R1). Three changes, nothing else about the table:
--
-- 1. The search over the past conversations leaves the passages of project files out. Without that, a question about a trip would be answered with the nearest twenty of ALL the person's
--    vectors, and a project full of notes could fill the twenty so that no conversation is left in the list.
-- 2. A search over the files of a project: only the sources asked about, only the person's own rows, only the server may run it (the key of the embedding model is the person's, and it
--    lives only in one reply).
-- 3. Deleting a project for good deletes the vectors of its sources, whichever device does it (a source that is taken away alone loses its vectors when the page builds them next).

create or replace function public.match_workspace_memory_vectors(
  p_user_id uuid,
  p_model text,
  p_query extensions.vector(768),
  p_limit integer default 20,
  p_min_cosine double precision default 0.5
)
returns table (piece_id text, hash text, cosine double precision)
language sql
stable
set search_path = ''
as $$
  select v.piece_id, v.hash, 1 - (v.embedding operator(extensions.<=>) p_query) as cosine
  from public.workspace_memory_vectors v
  where v.user_id = p_user_id
    and v.model = p_model
    and not v.failed
    and not pg_catalog.starts_with(v.piece_id, 'src:')
    and 1 - (v.embedding operator(extensions.<=>) p_query) >= p_min_cosine
  order by v.embedding operator(extensions.<=>) p_query
  limit least(greatest(p_limit, 1), 100);
$$;

revoke all on function public.match_workspace_memory_vectors(uuid, text, extensions.vector, integer, double precision) from public, anon, authenticated;
grant execute on function public.match_workspace_memory_vectors(uuid, text, extensions.vector, integer, double precision) to service_role;

create or replace function public.match_project_vectors(
  p_user_id uuid,
  p_model text,
  p_query extensions.vector(768),
  p_source_ids text[],
  p_limit integer default 20,
  p_min_cosine double precision default 0.5
)
returns table (piece_id text, hash text, cosine double precision)
language sql
stable
set search_path = ''
as $$
  select v.piece_id, v.hash, 1 - (v.embedding operator(extensions.<=>) p_query) as cosine
  from public.workspace_memory_vectors v
  where v.user_id = p_user_id
    and v.model = p_model
    and not v.failed
    and exists (
      select 1
      from pg_catalog.unnest(p_source_ids) as source_id
      where pg_catalog.starts_with(v.piece_id, 'src:' || source_id || ':')
    )
    and 1 - (v.embedding operator(extensions.<=>) p_query) >= p_min_cosine
  order by v.embedding operator(extensions.<=>) p_query
  limit least(greatest(p_limit, 1), 100);
$$;

revoke all on function public.match_project_vectors(uuid, text, extensions.vector, text[], integer, double precision) from public, anon, authenticated;
grant execute on function public.match_project_vectors(uuid, text, extensions.vector, text[], integer, double precision) to service_role;

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

  -- The vectors of the passages of the project's files go with the project (read from the sources before the row is deleted).
  delete from public.workspace_memory_vectors vectors
  where vectors.user_id = v_user_id
    and exists (
      select 1
      from public.workspace_folders folders,
        pg_catalog.jsonb_array_elements(case when pg_catalog.jsonb_typeof(folders.sources) = 'array' then folders.sources else '[]'::jsonb end) as source
      where folders.id = p_folder_id
        and folders.user_id = v_user_id
        and pg_catalog.starts_with(vectors.piece_id, 'src:' || (source ->> 'id') || ':')
    );

  delete from public.workspace_folders
  where user_id = v_user_id
    and id = p_folder_id;

  -- A project that kept its notes for itself takes them with it, whichever device deleted it (the notes carry the project's id in `projectId`).
  -- The rows are marked taken away, as the memory does everywhere (a device that has them hears the change and drops them); no tombstone is kept.
  update public.workspace_memory_records
  set deleted_at = pg_catalog.now(), updated_at = pg_catalog.now(), version = version + 1
  where user_id = v_user_id
    and record_key like 'note:%'
    and payload ->> 'projectId' = p_folder_id::text
    and deleted_at is null;
end;
$$;

revoke all on function public.permanently_delete_workspace_folder(uuid) from public, anon;
grant execute on function public.permanently_delete_workspace_folder(uuid) to authenticated;
