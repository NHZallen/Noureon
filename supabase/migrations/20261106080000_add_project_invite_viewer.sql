-- The page of an invitation says who is looking at it: when the person who opens a link is the owner of the project, or is already in it, the page tells so instead of offering to join.
--   get_project_invite(code) now also gives `project_id` and `viewer`: 'owner', the role of the person if they are a member ('editor' or 'chat'), or null (a person who is not in it, or not signed in).
create or replace function public.get_project_invite(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'project_id', f.id, 'project_name', f.name, 'icon', f.icon, 'color', f.color, 'role', i.role, 'inviter_name', i.inviter_name, 'kind', i.kind,
    'viewer', case
      when (select auth.uid()) is null then null
      when (select auth.uid()) = f.user_id then 'owner'
      else (select m.role from public.project_members m where m.project_id = f.id and m.member_id = (select auth.uid()))
    end
  )
  from public.project_invites i
  join public.workspace_folders f on f.id = i.project_id and f.user_id = i.owner_id
  where i.code = p_code and i.status = 'active' and (i.expires_at is null or i.expires_at > now()) and f.deleted_at is null and f.shared_at is not null
$$;
