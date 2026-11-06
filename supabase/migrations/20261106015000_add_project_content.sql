-- What the people of a shared project do to its content (docs/superpowers/specs/2026-11-06-project-sharing-design.md, §6, §7 and §8, S3 to S5).
--
--   project_notes                      the notes of the memory of a shared project (one list for all of its people, not one for each). Read through the project read; written only by the functions below.
--   update_shared_project(project, instructions, sources, expected)   an editor or the owner changes the instructions and the sources of the project; `expected` is the time the person read the project at: when
--                                                                    someone changed it since, nothing is written ('stale') and the page reads the project again.
--   list_project_notes / add_project_note / delete_project_note      anyone in the project reads; the owner and the editors add (up to 300, 500 letters each) and delete.
--   server_create_project_email_invite / list_project_invites / revoke_project_invite   an invitation for one mail address (made by the server, which sends the mail and limits how many a person sends); it can be used once, by the
--                                                                    account of that address.

create table if not exists public.project_notes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  owner_id uuid not null,
  note_text text not null check (char_length(note_text) between 1 and 500),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (project_id, owner_id) references public.workspace_folders (id, user_id) on delete cascade
);
create index if not exists project_notes_project_idx on public.project_notes (project_id, created_at);
alter table public.project_notes enable row level security;
revoke all on table public.project_notes from public, anon, authenticated;
grant all on table public.project_notes to service_role;
comment on table public.project_notes is 'The notes of the memory of a shared project. Read and written only through functions.';

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

create or replace function public.list_project_notes(p_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_user uuid := (select auth.uid());
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if public.project_role(p_project_id, v_user) is null then raise exception 'not_a_member'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'text', n.note_text, 'created_at', n.created_at) order by n.created_at) from public.project_notes n where n.project_id = p_project_id), '[]'::jsonb);
end;
$$;

create or replace function public.add_project_note(p_project_id uuid, p_text text)
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
  v_note public.project_notes;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  v_role := public.project_role(p_project_id, v_user);
  if v_role is null or v_role = 'chat' then raise exception 'not_allowed'; end if;
  select * into v_folder from public.workspace_folders where id = p_project_id;
  if v_folder.shared_at is null then raise exception 'not_shared'; end if;
  if char_length(btrim(coalesce(p_text, ''))) = 0 then raise exception 'invalid_note'; end if;
  if (select count(*) from public.project_notes where project_id = p_project_id) >= 300 then raise exception 'notes_full'; end if;
  insert into public.project_notes (project_id, owner_id, note_text, created_by) values (p_project_id, v_folder.user_id, left(btrim(p_text), 500), v_user) returning * into v_note;
  return jsonb_build_object('id', v_note.id, 'text', v_note.note_text, 'created_at', v_note.created_at);
end;
$$;

create or replace function public.delete_project_note(p_project_id uuid, p_note_id uuid)
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
  delete from public.project_notes where id = p_note_id and project_id = p_project_id;
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

revoke all on function
  public.update_shared_project(uuid, text, jsonb, timestamptz), public.list_project_notes(uuid), public.add_project_note(uuid, text), public.delete_project_note(uuid, uuid),
  public.server_create_project_email_invite(uuid, uuid, text, text, text), public.list_project_invites(uuid), public.revoke_project_invite(uuid, uuid)
  from public, anon, authenticated;
grant execute on function
  public.update_shared_project(uuid, text, jsonb, timestamptz), public.list_project_notes(uuid), public.add_project_note(uuid, text), public.delete_project_note(uuid, uuid),
  public.list_project_invites(uuid), public.revoke_project_invite(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.server_create_project_email_invite(uuid, uuid, text, text, text) to service_role;
