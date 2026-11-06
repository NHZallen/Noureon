-- Three repairs found while trying the sharing on a phone.
--   1. A conversation made in a shared project whose page did not yet know the owner of the project carried `sharedProject: { id, ownerId: "" }` and was never linked to the project, so nobody else saw it.
--      The link now takes the owner from the project itself when the metadata has none (a person who is a member of that project), and writes the owner into the metadata; the conversations that
--      were left like that are linked now.
--   3. The list of the projects shared with a person tells how many conversations each has (`chat_count`), as the list of their own projects does.
--   2. The people of a project show the photo of their Google account when they have no picture of their own, as the account's own page does: `list_project_members` gives `photo_url` (only an https
--      address that the person's sign-in gave; read through `project_person_photo`, which only the database functions of the project use).

create or replace function public.project_person_photo(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when u.url ~* '^https://' then left(u.url, 500) end
  from (select coalesce(nullif(raw_user_meta_data ->> 'avatar_url', ''), nullif(raw_user_meta_data ->> 'picture', '')) as url from auth.users where id = p_user_id) u;
$$;
revoke all on function public.project_person_photo(uuid) from public, anon, authenticated;
grant execute on function public.project_person_photo(uuid) to service_role;

create or replace function public.link_conversation_to_shared_project()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_owner uuid;
  v_linked boolean := false;
begin
  begin
    v_id := nullif(new.metadata #>> '{sharedProject,id}', '')::uuid;
    v_owner := nullif(new.metadata #>> '{sharedProject,ownerId}', '')::uuid;
  exception when others then
    v_id := null;
    v_owner := null;
  end;
  -- A page that did not know the owner yet sent none: the owner is the one of the (shared) project.
  if v_id is not null and v_owner is null then
    select f.user_id into v_owner from public.workspace_folders f where f.id = v_id and f.shared_at is not null;
  end if;
  if v_id is not null and exists (select 1 from public.project_conversation_exits x where x.project_id = v_id and x.conversation_id = new.id) then
    new.shared_project_id := null;
    new.shared_project_owner := null;
    new.metadata := new.metadata - 'sharedProject';
  elsif v_id is null or v_owner is null or v_owner = new.user_id then
    new.shared_project_id := null;
    new.shared_project_owner := null;
  elsif tg_op = 'UPDATE' and old.shared_project_id = v_id and old.shared_project_owner = v_owner and exists (select 1 from public.workspace_folders f where f.id = v_id and f.user_id = v_owner) then
    new.shared_project_id := v_id;
    new.shared_project_owner := v_owner;
    v_linked := true;
  elsif exists (select 1 from public.project_members m where m.project_id = v_id and m.owner_id = v_owner and m.member_id = new.user_id) then
    new.shared_project_id := v_id;
    new.shared_project_owner := v_owner;
    v_linked := true;
  else
    new.shared_project_id := null;
    new.shared_project_owner := null;
  end if;
  if v_linked then
    new.metadata := jsonb_set(new.metadata, '{sharedProject,ownerId}', to_jsonb(v_owner::text));
  end if;
  return new;
end;
$$;

-- The conversations that were left unlinked for that reason are linked now (the trigger does it when the row is written).
update public.workspace_conversations
set updated_at = now()
where metadata ? 'sharedProject' and shared_project_id is null and deleted_at is null;

-- The members of a project, with the photo of their Google account when they have no picture of their own.
create or replace function public.list_project_members(p_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_role text;
  v_folder public.workspace_folders;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  v_role := public.project_role(p_project_id, v_user);
  if v_role is null then raise exception 'not_a_member'; end if;
  select * into v_folder from public.workspace_folders where id = p_project_id;
  return jsonb_build_object(
    'role', v_role,
    'shared_at', v_folder.shared_at,
    'generation', v_folder.invite_link_generation,
    'members', (
      select coalesce(jsonb_agg(row order by sort_key), '[]'::jsonb) from (
        select 0 as sort_key, jsonb_build_object('user_id', v_folder.user_id, 'role', 'owner', 'name', public.project_person_name(v_folder.user_id), 'avatar_version', coalesce(p.avatar_version, 0) * (case when p.avatar_path is null then 0 else 1 end), 'photo_url', public.project_person_photo(v_folder.user_id), 'joined_at', v_folder.shared_at) as row
        from (select 1) one left join public.user_profiles p on p.user_id = v_folder.user_id
        union all
        select 1, jsonb_build_object('user_id', m.member_id, 'role', m.role, 'name', public.project_person_name(m.member_id), 'avatar_version', coalesce(p.avatar_version, 0) * (case when p.avatar_path is null then 0 else 1 end), 'photo_url', public.project_person_photo(m.member_id), 'joined_at', m.joined_at)
        from public.project_members m left join public.user_profiles p on p.user_id = m.member_id
        where m.project_id = p_project_id
      ) rows
    )
  );
end;
$$;

revoke all on function public.link_conversation_to_shared_project() from public, anon, authenticated;

-- The projects shared with a person, with how many conversations each has.
create or replace function public.list_shared_with_me()
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
    select jsonb_agg(jsonb_build_object('project_id', f.id, 'owner_id', f.user_id, 'name', f.name, 'icon', f.icon, 'color', f.color, 'text_color', f.text_color, 'role', m.role, 'chat_count', (select count(*) from public.workspace_conversations c where c.deleted_at is null and not c.archived and ((c.user_id = f.user_id and c.folder_id = f.id) or (c.shared_project_id = f.id and c.shared_project_owner = f.user_id))), 'owner_name', public.project_person_name(f.user_id), 'joined_at', m.joined_at) order by m.joined_at desc)
    from public.project_members m join public.workspace_folders f on f.id = m.project_id and f.user_id = m.owner_id
    where m.member_id = v_user and f.deleted_at is null
  ), '[]'::jsonb);
end;
$$;
