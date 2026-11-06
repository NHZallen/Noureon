-- Sharing a project (docs/superpowers/specs/2026-11-06-project-sharing-design.md, S1): the owner of a project invites people by a link, each person gets a role (`editor` or `chat`), and the
-- project becomes a shared project. Nobody reads or writes the tables below directly (no policy, no grant): the functions are the only way, and each one checks who is asking.
--
--   project_members           one row for each person who joined a project (the owner is not in it: the folder says who owns it).
--   project_invites           the links (`link`, one active for each role of a project) and, later, the invitations by mail (`email`).
--   project_removed_members   who was taken out and with which generation of the link they had joined, so that an old link does not let them back.
--
-- Sharing a project forces the memory of the project to `project` and puts the time in `shared_at`. They are kept by a trigger: a page that writes the folder back (the sync of the
-- owner) cannot take them away. The link has a generation: the owner can make a new link, which ends the old ones, and a person who was removed can come back only with a link of a newer
-- generation (or by an invitation to their mail).
--
--   project_role(project, person)         'owner', 'editor', 'chat' or null.
--   project_share_preview(project)        for the owner: how many conversations the members would see and how many of them have a public link now.
--   share_project(project)                the owner shares the project: memory `project`, `shared_at`, and the public links of its conversations are ended.
--   list_project_members(project)         the owner and the members (name and picture version), for anyone in the project.
--   get_project_links(project)            the links of the project, for the owner and the editors.
--   create_project_link(project, role, name)   the link of a role (the same one while it is active).
--   refresh_project_link(project, role, name)  owner only: a new generation, the old links end, a new link for the role.
--   close_project_link(project, role)     the owner or an editor ends the link of a role.
--   get_project_invite(code)              for anyone: the name of the project, the role and who invited, when the link works.
--   accept_project_invite(code)           a signed-in person joins (not when they were removed with this generation, not over 100 members, not the owner).
--   set_project_member_role(project, member, role)   owner only.
--   remove_project_member(project, member, delete_conversations)   owner only; the person cannot come back with an old link; their conversations stay unless asked.
--   leave_project(project)                a member leaves.
--   list_shared_with_me()                 the projects the signed-in person has joined.

alter table public.workspace_folders add column if not exists shared_at timestamptz;
alter table public.workspace_folders add column if not exists invite_link_generation integer not null default 1 check (invite_link_generation >= 1);

create table if not exists public.project_members (
  project_id uuid not null,
  owner_id uuid not null references auth.users (id) on delete cascade,
  member_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('editor', 'chat')),
  joined_at timestamptz not null default now(),
  invited_by uuid references auth.users (id) on delete set null,
  link_generation integer,
  primary key (project_id, member_id),
  foreign key (project_id, owner_id) references public.workspace_folders (id, user_id) on delete cascade,
  check (member_id <> owner_id)
);
create index if not exists project_members_member_idx on public.project_members (member_id);

create table if not exists public.project_invites (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  owner_id uuid not null,
  code text not null unique check (char_length(code) between 24 and 64 and code ~ '^[0-9A-Za-z]+$'),
  kind text not null check (kind in ('link', 'email')),
  role text not null check (role in ('editor', 'chat')),
  email text check (email is null or email = lower(email)),
  generation integer not null check (generation >= 1),
  inviter_name text not null default '' check (char_length(inviter_name) <= 80),
  status text not null default 'active' check (status in ('active', 'used', 'revoked')),
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  foreign key (project_id, owner_id) references public.workspace_folders (id, user_id) on delete cascade,
  check (kind = 'link' or email is not null)
);
create unique index if not exists project_invites_one_active_link on public.project_invites (project_id, role) where kind = 'link' and status = 'active';
create index if not exists project_invites_project_idx on public.project_invites (project_id, created_at desc);

create table if not exists public.project_removed_members (
  project_id uuid not null,
  owner_id uuid not null,
  member_id uuid not null references auth.users (id) on delete cascade,
  removed_at timestamptz not null default now(),
  link_generation integer not null default 0,
  primary key (project_id, member_id),
  foreign key (project_id, owner_id) references public.workspace_folders (id, user_id) on delete cascade
);

alter table public.project_members enable row level security;
alter table public.project_invites enable row level security;
alter table public.project_removed_members enable row level security;
revoke all on table public.project_members, public.project_invites, public.project_removed_members from public, anon, authenticated;
grant all on table public.project_members, public.project_invites, public.project_removed_members to service_role;

comment on table public.project_members is 'The people who joined a shared project. Read and written only through functions.';
comment on table public.project_invites is 'The invitation links of a shared project. Read and written only through functions.';
comment on table public.project_removed_members is 'People taken out of a project, with the generation of the link they had used. Read and written only through functions.';

-- ---------- what a page that writes the folder back cannot undo

create or replace function public.keep_shared_project_state()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('noureon.sharing', true) = 'on' then
    return new;
  end if;
  if old.shared_at is not null then
    new.shared_at := old.shared_at;
    new.memory_scope := 'project';
  else
    new.shared_at := old.shared_at;
  end if;
  new.invite_link_generation := old.invite_link_generation;
  return new;
end;
$$;

drop trigger if exists keep_shared_project_state on public.workspace_folders;
create trigger keep_shared_project_state
  before update on public.workspace_folders
  for each row execute function public.keep_shared_project_state();

-- ---------- helpers

create or replace function public.project_role(p_project_id uuid, p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when f.id is null or f.deleted_at is not null then null
    when f.user_id = p_user_id then 'owner'
    else (select m.role from public.project_members m where m.project_id = f.id and m.member_id = p_user_id)
  end
  from (select 1) one
  left join public.workspace_folders f on f.id = p_project_id
$$;

create or replace function public.project_person_name(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select left(coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), nullif(u.raw_user_meta_data ->> 'name', ''), nullif(split_part(coalesce(u.email, ''), '@', 1), ''), 'Noureon User'), 80)
  from auth.users u where u.id = p_user_id
$$;

create or replace function public.project_new_code()
returns text
language sql
volatile
set search_path = ''
as $$
  select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
$$;

revoke all on function public.project_role(uuid, uuid), public.project_person_name(uuid), public.project_new_code() from public, anon, authenticated;
grant execute on function public.project_role(uuid, uuid), public.project_person_name(uuid), public.project_new_code() to service_role;

-- ---------- the owner shares the project

create or replace function public.project_share_preview(p_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_folder public.workspace_folders;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select * into v_folder from public.workspace_folders where id = p_project_id and user_id = v_user and deleted_at is null;
  if not found then raise exception 'project_not_found'; end if;
  return jsonb_build_object(
    'already_shared', v_folder.shared_at is not null,
    'conversations', (select count(*) from public.workspace_conversations c where c.user_id = v_user and c.folder_id = p_project_id and c.deleted_at is null),
    'linked', (select count(distinct s.conversation_id) from public.conversation_shares s join public.workspace_conversations c on c.id = s.conversation_id and c.user_id = s.owner_id
      where s.owner_id = v_user and c.folder_id = p_project_id and c.deleted_at is null and s.status in ('active', 'building'))
  );
end;
$$;

create or replace function public.share_project(p_project_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_folder public.workspace_folders;
  v_revoked integer := 0;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select * into v_folder from public.workspace_folders where id = p_project_id and user_id = v_user and deleted_at is null for update;
  if not found then raise exception 'project_not_found'; end if;
  if v_folder.shared_at is null then
    perform set_config('noureon.sharing', 'on', true);
    update public.workspace_folders set shared_at = now(), memory_scope = 'project', updated_at = now() where id = p_project_id and user_id = v_user;
    perform set_config('noureon.sharing', 'off', true);
    -- The links that anyone could open end: a shared project is for its members only.
    with gone as (
      delete from public.conversation_shares s
      using public.workspace_conversations c
      where s.owner_id = v_user and c.id = s.conversation_id and c.user_id = s.owner_id and c.folder_id = p_project_id and s.status in ('active', 'building')
      returning s.id
    ) select count(*) into v_revoked from gone;
  end if;
  select * into v_folder from public.workspace_folders where id = p_project_id;
  return jsonb_build_object('shared_at', v_folder.shared_at, 'memory_scope', v_folder.memory_scope, 'revoked', v_revoked, 'generation', v_folder.invite_link_generation);
end;
$$;

-- ---------- who is in the project

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
        select 0 as sort_key, jsonb_build_object('user_id', v_folder.user_id, 'role', 'owner', 'name', public.project_person_name(v_folder.user_id), 'avatar_version', coalesce(p.avatar_version, 0) * (case when p.avatar_path is null then 0 else 1 end), 'joined_at', v_folder.shared_at) as row
        from (select 1) one left join public.user_profiles p on p.user_id = v_folder.user_id
        union all
        select 1, jsonb_build_object('user_id', m.member_id, 'role', m.role, 'name', public.project_person_name(m.member_id), 'avatar_version', coalesce(p.avatar_version, 0) * (case when p.avatar_path is null then 0 else 1 end), 'joined_at', m.joined_at)
        from public.project_members m left join public.user_profiles p on p.user_id = m.member_id
        where m.project_id = p_project_id
      ) rows
    )
  );
end;
$$;

-- ---------- the links

create or replace function public.get_project_links(p_project_id uuid)
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
  return coalesce((select jsonb_agg(jsonb_build_object('code', i.code, 'role', i.role, 'generation', i.generation, 'created_at', i.created_at) order by i.role) from public.project_invites i where i.project_id = p_project_id and i.kind = 'link' and i.status = 'active'), '[]'::jsonb);
end;
$$;

create or replace function public.create_project_link(p_project_id uuid, p_role text, p_inviter_name text default '')
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
  v_invite public.project_invites;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_role not in ('editor', 'chat') then raise exception 'invalid_role'; end if;
  v_role := public.project_role(p_project_id, v_user);
  if v_role is null or v_role = 'chat' then raise exception 'not_allowed'; end if;
  select * into v_folder from public.workspace_folders where id = p_project_id for update;
  if v_folder.shared_at is null then raise exception 'not_shared'; end if;
  select * into v_invite from public.project_invites where project_id = p_project_id and kind = 'link' and role = p_role and status = 'active';
  if not found then
    insert into public.project_invites (project_id, owner_id, code, kind, role, generation, inviter_name, created_by)
    values (p_project_id, v_folder.user_id, public.project_new_code(), 'link', p_role, v_folder.invite_link_generation, left(coalesce(p_inviter_name, ''), 80), v_user)
    returning * into v_invite;
  end if;
  return jsonb_build_object('code', v_invite.code, 'role', v_invite.role, 'generation', v_invite.generation);
end;
$$;

create or replace function public.refresh_project_link(p_project_id uuid, p_role text, p_inviter_name text default '')
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_folder public.workspace_folders;
  v_invite public.project_invites;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_role not in ('editor', 'chat') then raise exception 'invalid_role'; end if;
  select * into v_folder from public.workspace_folders where id = p_project_id and user_id = v_user and deleted_at is null for update;
  if not found then raise exception 'not_allowed'; end if;
  if v_folder.shared_at is null then raise exception 'not_shared'; end if;
  update public.project_invites set status = 'revoked' where project_id = p_project_id and kind = 'link' and status = 'active';
  perform set_config('noureon.sharing', 'on', true);
  update public.workspace_folders set invite_link_generation = invite_link_generation + 1 where id = p_project_id and user_id = v_user returning * into v_folder;
  perform set_config('noureon.sharing', 'off', true);
  insert into public.project_invites (project_id, owner_id, code, kind, role, generation, inviter_name, created_by)
  values (p_project_id, v_user, public.project_new_code(), 'link', p_role, v_folder.invite_link_generation, left(coalesce(p_inviter_name, ''), 80), v_user)
  returning * into v_invite;
  return jsonb_build_object('code', v_invite.code, 'role', v_invite.role, 'generation', v_invite.generation);
end;
$$;

create or replace function public.close_project_link(p_project_id uuid, p_role text)
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
  update public.project_invites set status = 'revoked' where project_id = p_project_id and kind = 'link' and role = p_role and status = 'active';
end;
$$;

-- ---------- the person who got a link

create or replace function public.get_project_invite(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('project_name', f.name, 'icon', f.icon, 'color', f.color, 'role', i.role, 'inviter_name', i.inviter_name, 'kind', i.kind)
  from public.project_invites i
  join public.workspace_folders f on f.id = i.project_id and f.user_id = i.owner_id
  where i.code = p_code and i.status = 'active' and (i.expires_at is null or i.expires_at > now()) and f.deleted_at is null and f.shared_at is not null
$$;

create or replace function public.accept_project_invite(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_email text;
  v_invite public.project_invites;
  v_folder public.workspace_folders;
  v_removed public.project_removed_members;
  v_member public.project_members;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select * into v_invite from public.project_invites where code = p_code and status = 'active' and (expires_at is null or expires_at > now()) for update;
  if not found then raise exception 'invite_invalid'; end if;
  select * into v_folder from public.workspace_folders where id = v_invite.project_id and user_id = v_invite.owner_id and deleted_at is null and shared_at is not null;
  if not found then raise exception 'invite_invalid'; end if;
  if v_folder.user_id = v_user then raise exception 'invite_owner'; end if;
  -- Already in: the same answer as a person who just joined (a link opened twice).
  select * into v_member from public.project_members where project_id = v_folder.id and member_id = v_user;
  if found then
    return jsonb_build_object('project_id', v_folder.id, 'owner_id', v_folder.user_id, 'role', v_member.role, 'name', v_folder.name, 'already', true);
  end if;
  if v_invite.kind = 'email' then
    select lower(u.email) into v_email from auth.users u where u.id = v_user;
    if v_email is null or v_email <> v_invite.email then raise exception 'invite_email_mismatch'; end if;
  else
    -- A person who was taken out does not come back with an old link; a newer generation (a link made after) lets them in.
    select * into v_removed from public.project_removed_members where project_id = v_folder.id and member_id = v_user;
    if found and v_invite.generation <= v_removed.link_generation then raise exception 'invite_removed'; end if;
  end if;
  if (select count(*) from public.project_members where project_id = v_folder.id) >= 100 then raise exception 'invite_full'; end if;
  insert into public.project_members (project_id, owner_id, member_id, role, invited_by, link_generation)
  values (v_folder.id, v_folder.user_id, v_user, v_invite.role, v_invite.created_by, case when v_invite.kind = 'link' then v_invite.generation else null end);
  delete from public.project_removed_members where project_id = v_folder.id and member_id = v_user;
  if v_invite.kind = 'email' then update public.project_invites set status = 'used' where id = v_invite.id; end if;
  return jsonb_build_object('project_id', v_folder.id, 'owner_id', v_folder.user_id, 'role', v_invite.role, 'name', v_folder.name, 'already', false);
end;
$$;

-- ---------- the members

create or replace function public.set_project_member_role(p_project_id uuid, p_member_id uuid, p_role text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_user uuid := (select auth.uid());
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_role not in ('editor', 'chat') then raise exception 'invalid_role'; end if;
  if public.project_role(p_project_id, v_user) is distinct from 'owner' then raise exception 'not_allowed'; end if;
  update public.project_members set role = p_role where project_id = p_project_id and member_id = p_member_id;
end;
$$;

create or replace function public.remove_project_member(p_project_id uuid, p_member_id uuid, p_delete_conversations boolean default false)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_member public.project_members;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if public.project_role(p_project_id, v_user) is distinct from 'owner' then raise exception 'not_allowed'; end if;
  delete from public.project_members where project_id = p_project_id and member_id = p_member_id returning * into v_member;
  if found then
    insert into public.project_removed_members (project_id, owner_id, member_id, link_generation)
    values (p_project_id, v_member.owner_id, p_member_id, coalesce(v_member.link_generation, (select invite_link_generation from public.workspace_folders where id = p_project_id)))
    on conflict (project_id, member_id) do update set removed_at = now(), link_generation = excluded.link_generation;
    -- The owner may take what the person made in the project with them (it goes to the trash of that person, as any conversation the owner of it deletes); by default it stays.
    if p_delete_conversations then
      update public.workspace_conversations set deleted_at = now(), updated_at = now()
      where user_id = p_member_id and shared_project_id = p_project_id and shared_project_owner = v_member.owner_id and deleted_at is null;
    end if;
  end if;
end;
$$;

create or replace function public.leave_project(p_project_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_user uuid := (select auth.uid());
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  delete from public.project_members where project_id = p_project_id and member_id = v_user;
end;
$$;

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
    select jsonb_agg(jsonb_build_object('project_id', f.id, 'owner_id', f.user_id, 'name', f.name, 'icon', f.icon, 'color', f.color, 'text_color', f.text_color, 'role', m.role, 'owner_name', public.project_person_name(f.user_id), 'joined_at', m.joined_at) order by m.joined_at desc)
    from public.project_members m join public.workspace_folders f on f.id = m.project_id and f.user_id = m.owner_id
    where m.member_id = v_user and f.deleted_at is null
  ), '[]'::jsonb);
end;
$$;

-- who may call what
revoke all on function
  public.project_share_preview(uuid), public.share_project(uuid), public.list_project_members(uuid), public.get_project_links(uuid), public.create_project_link(uuid, text, text),
  public.refresh_project_link(uuid, text, text), public.close_project_link(uuid, text), public.get_project_invite(text), public.accept_project_invite(text),
  public.set_project_member_role(uuid, uuid, text), public.remove_project_member(uuid, uuid, boolean), public.leave_project(uuid), public.list_shared_with_me()
  from public, anon, authenticated;
grant execute on function
  public.project_share_preview(uuid), public.share_project(uuid), public.list_project_members(uuid), public.get_project_links(uuid), public.create_project_link(uuid, text, text),
  public.refresh_project_link(uuid, text, text), public.close_project_link(uuid, text), public.accept_project_invite(text),
  public.set_project_member_role(uuid, uuid, text), public.remove_project_member(uuid, uuid, boolean), public.leave_project(uuid), public.list_shared_with_me()
  to authenticated, service_role;
-- the page of an invitation shows the project before the person signs in
grant execute on function public.get_project_invite(text) to anon, authenticated, service_role;
