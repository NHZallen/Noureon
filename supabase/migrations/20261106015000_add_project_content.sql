-- What the people of a shared project do to its content (docs/superpowers/specs/2026-11-06-project-sharing-design.md, §6, §7 and §8, S3 to S5).
--
--   update_shared_project(project, instructions, sources, expected)   an editor or the owner changes the instructions and the sources of the project; `expected` is the time the person read the project at: when
--                                                                    someone changed it since, nothing is written ('stale') and the page reads the project again.
--   server_create_project_email_invite / list_project_invites / revoke_project_invite   an invitation for one mail address (made by the server, which sends the mail and limits how many a person sends); it can be used once, by the
--                                                                    account of that address.


create or replace function public.update_shared_project(p_project_id uuid, p_instructions text default null, p_sources jsonb default null, p_expected timestamptz default null)
returns jsonb
language plpgsql
volatile
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
  if v_role is null or v_role = 'chat' then raise exception 'not_allowed'; end if;
  select * into v_folder from public.workspace_folders where id = p_project_id for update;
  if v_folder.shared_at is null then raise exception 'not_shared'; end if;
  if p_expected is not null and v_folder.updated_at > p_expected then raise exception 'stale'; end if;
  update public.workspace_folders
  set instructions = coalesce(p_instructions, instructions), sources = coalesce(p_sources, sources), updated_at = now()
  where id = p_project_id returning * into v_folder;
  return jsonb_build_object('updated_at', v_folder.updated_at);
end;
$$;

create or replace function public.server_create_project_email_invite(p_user_id uuid, p_project_id uuid, p_email text, p_role text, p_inviter_name text default '')
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := p_user_id;
  v_role text;
  v_folder public.workspace_folders;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_invite public.project_invites;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_role not in ('editor', 'chat') then raise exception 'invalid_role'; end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or char_length(v_email) > 254 then raise exception 'invalid_email'; end if;
  v_role := public.project_role(p_project_id, v_user);
  if v_role is null or v_role = 'chat' then raise exception 'not_allowed'; end if;
  select * into v_folder from public.workspace_folders where id = p_project_id;
  if v_folder.shared_at is null then raise exception 'not_shared'; end if;
  if (select count(*) from public.project_invites where project_id = p_project_id and kind = 'email' and status = 'active') >= 200 then raise exception 'invite_full'; end if;
  -- an earlier invitation to the same address ends: the newest one is the one that works
  update public.project_invites set status = 'revoked' where project_id = p_project_id and kind = 'email' and email = v_email and status = 'active';
  insert into public.project_invites (project_id, owner_id, code, kind, role, email, generation, inviter_name, created_by)
  values (p_project_id, v_folder.user_id, public.project_new_code(), 'email', p_role, v_email, v_folder.invite_link_generation, left(coalesce(p_inviter_name, ''), 80), v_user)
  returning * into v_invite;
  return jsonb_build_object('id', v_invite.id, 'code', v_invite.code, 'email', v_invite.email, 'role', v_invite.role, 'project_name', v_folder.name);
end;
$$;

create or replace function public.list_project_invites(p_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_role text;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  v_role := public.project_role(p_project_id, v_user);
  if v_role is null or v_role = 'chat' then raise exception 'not_allowed'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'email', i.email, 'role', i.role, 'created_at', i.created_at) order by i.created_at desc) from public.project_invites i where i.project_id = p_project_id and i.kind = 'email' and i.status = 'active'), '[]'::jsonb);
end;
$$;

create or replace function public.revoke_project_invite(p_project_id uuid, p_invite_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_role text;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  v_role := public.project_role(p_project_id, v_user);
  if v_role is null or v_role = 'chat' then raise exception 'not_allowed'; end if;
  update public.project_invites set status = 'revoked' where id = p_invite_id and project_id = p_project_id and kind = 'email' and status = 'active';
end;
$$;

-- The projects of the person's own that are shared (their ids): the page knows which of its folders are shared, to give a link for the members only.
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
    select jsonb_agg(jsonb_build_object('project_id', f.id) order by f.shared_at)
    from public.workspace_folders f where f.user_id = v_user and f.shared_at is not null and f.deleted_at is null
  ), '[]'::jsonb);
end;
$$;

create or replace function public.server_revoke_project_invite(p_user_id uuid, p_project_id uuid, p_invite_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if public.project_role(p_project_id, p_user_id) is null then return; end if;
  update public.project_invites set status = 'revoked' where id = p_invite_id and project_id = p_project_id and kind = 'email' and status = 'active' and created_by = p_user_id;
end;
$$;

revoke all on function
  public.update_shared_project(uuid, text, jsonb, timestamptz), public.list_my_shared_projects(),
  public.server_create_project_email_invite(uuid, uuid, text, text, text), public.server_revoke_project_invite(uuid, uuid, uuid), public.list_project_invites(uuid), public.revoke_project_invite(uuid, uuid)
  from public, anon, authenticated;
grant execute on function
  public.update_shared_project(uuid, text, jsonb, timestamptz), public.list_my_shared_projects(),
  public.list_project_invites(uuid), public.revoke_project_invite(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.server_create_project_email_invite(uuid, uuid, text, text, text), public.server_revoke_project_invite(uuid, uuid, uuid) to service_role;
