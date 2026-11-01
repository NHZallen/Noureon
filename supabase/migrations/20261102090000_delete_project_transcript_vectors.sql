-- The vectors of the transcripts of the videos and recordings of a project (docs/superpowers/specs/2026-11-02-chat-video-audio-design.md, §9) are named `src:<id of the source>~tr:<number>`; the
-- delete of a project for good took only `src:<id>:...`, so these would have stayed behind. Nothing else about deleting a project changes.

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

  -- The vectors of the passages of the project's files, and of the transcripts of its videos and recordings (source id + '~tr'), go with the project (read from the sources before the row is deleted).
  delete from public.workspace_memory_vectors vectors
  where vectors.user_id = v_user_id
    and exists (
      select 1
      from public.workspace_folders folders,
        pg_catalog.jsonb_array_elements(case when pg_catalog.jsonb_typeof(folders.sources) = 'array' then folders.sources else '[]'::jsonb end) as source
      where folders.id = p_folder_id
        and folders.user_id = v_user_id
        and (
          pg_catalog.starts_with(vectors.piece_id, 'src:' || (source ->> 'id') || ':')
          or pg_catalog.starts_with(vectors.piece_id, 'src:' || (source ->> 'id') || '~tr:')
        )
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
