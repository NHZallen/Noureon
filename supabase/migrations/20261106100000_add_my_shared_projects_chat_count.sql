-- The list of the projects of the person's own that are shared tells how many conversations each has (the ones of everybody in it), as the list of the projects shared with them does,
-- so the list of the projects shows the same number before and after the project is opened.
create or replace function public.list_my_shared_projects()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_user uuid := (select auth.uid());
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'project_id', f.id,
      'chat_count', (select count(*) from public.workspace_conversations c where c.deleted_at is null and not c.archived and ((c.user_id = f.user_id and c.folder_id = f.id) or (c.shared_project_id = f.id and c.shared_project_owner = f.user_id)))
    ) order by f.shared_at)
    from public.workspace_folders f where f.user_id = v_user and f.shared_at is not null and f.deleted_at is null
  ), '[]'::jsonb);
end;
$$;
