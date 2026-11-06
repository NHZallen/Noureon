-- A member sees the files of a shared project (pictures and files in the conversations of the people of the project, and the files of its sources).
-- The files are in the private bucket `user-assets` (`<person>/<sha256>`), readable by their owner only; the server reads them for a member after this function says that the project really holds the file.
--   server_project_asset_allowed(person, project, path)   for the server only: true when the person is in the project (owner or member), the project is shared, the file belongs to the owner or to a member
--                                                         of the project, and the file is named in a message of a conversation of the project or in its sources.

create or replace function public.server_project_asset_allowed(p_user_id uuid, p_project_id uuid, p_path text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_folder public.workspace_folders;
  v_owner uuid;
begin
  if p_path is null or p_path !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{64}$' then return false; end if;
  if public.project_role(p_project_id, p_user_id) is null then return false; end if;
  select * into v_folder from public.workspace_folders where id = p_project_id;
  if v_folder.id is null or v_folder.shared_at is null then return false; end if;
  v_owner := split_part(p_path, '/', 1)::uuid;
  if v_owner <> v_folder.user_id and not exists (select 1 from public.project_members m where m.project_id = p_project_id and m.member_id = v_owner) then return false; end if;
  if v_owner = v_folder.user_id and position(p_path in coalesce(v_folder.sources::text, '')) > 0 then return true; end if;
  return exists (
    select 1
    from public.workspace_conversations c
    join public.workspace_messages m on m.conversation_id = c.id and m.user_id = c.user_id
    where c.user_id = v_owner
      and ((c.user_id = v_folder.user_id and c.folder_id = p_project_id) or (c.shared_project_id = p_project_id and c.shared_project_owner = v_folder.user_id))
      and c.deleted_at is null
      and position(p_path in m.parts::text) > 0
  );
end;
$$;

revoke all on function public.server_project_asset_allowed(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.server_project_asset_allowed(uuid, uuid, text) to service_role;
