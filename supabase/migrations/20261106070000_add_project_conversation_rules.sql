-- Who may do what with the conversations of a shared project, and what happens to them when a person goes.
--   A conversation always stays in the workspace of the person who wrote it; "in the project" is only a link (shared_project_id) on it. Nobody but its author writes it or deletes it.
--   The owner may take a conversation of someone else out of the project (move_conversation_out_of_project): it is then a plain conversation of its author again. The owner cannot delete it.
--   project_conversation_exits remembers the conversations that were taken out (by the owner, or because the person left or was removed), so that a page that still holds the old link in its
--   metadata cannot bring them back: the link trigger looks there first.
--   A person who leaves, or is removed, loses the link of everything they made in the project (it goes back to their own history). Before that the server may copy what the project keeps
--   to the OWNER (server_collect_project_copy + server_store_project_copy): the copies are conversations of the owner in the project, with "copiedFrom" in the metadata, so the owner can
--   delete them as any of their own. The ids of the copies come from the ids of the originals, so doing it twice makes no second copy.
--   An editor may change the name, icon and colours of the project (update_shared_project), as the instructions and sources.

create table if not exists public.project_conversation_exits (
  project_id uuid not null references public.workspace_folders(id) on delete cascade,
  conversation_id uuid not null references public.workspace_conversations(id) on delete cascade,
  author_id uuid not null,
  reason text not null check (reason in ('owner', 'left', 'removed')),
  created_at timestamptz not null default now(),
  primary key (project_id, conversation_id)
);
create index if not exists project_conversation_exits_author_idx on public.project_conversation_exits (author_id, created_at desc);
alter table public.project_conversation_exits enable row level security;
revoke all on table public.project_conversation_exits from public, anon, authenticated;
grant all on table public.project_conversation_exits to service_role;
comment on table public.project_conversation_exits is 'Conversations taken out of a shared project (by the owner, or because their author left or was removed). Read and written only through functions.';

-- The link of a conversation follows its metadata, but never for one that was taken out of that project.
create or replace function public.link_conversation_to_shared_project()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_owner uuid;
begin
  begin
    v_id := nullif(new.metadata #>> '{sharedProject,id}', '')::uuid;
    v_owner := nullif(new.metadata #>> '{sharedProject,ownerId}', '')::uuid;
  exception when others then
    v_id := null;
    v_owner := null;
  end;
  if v_id is not null and exists (select 1 from public.project_conversation_exits x where x.project_id = v_id and x.conversation_id = new.id) then
    new.shared_project_id := null;
    new.shared_project_owner := null;
    new.metadata := new.metadata - 'sharedProject';
  elsif v_id is null or v_owner is null or v_owner = new.user_id then
    new.shared_project_id := null;
    new.shared_project_owner := null;
  elsif tg_op = 'UPDATE' and old.shared_project_id = v_id and old.shared_project_owner = v_owner and exists (select 1 from public.workspace_folders f where f.id = v_id and f.user_id = v_owner) then
    -- (the folder has to be there: when it goes for good the foreign key empties the link, and this trigger runs for that update too)
    new.shared_project_id := v_id;
    new.shared_project_owner := v_owner;
  elsif exists (select 1 from public.project_members m where m.project_id = v_id and m.owner_id = v_owner and m.member_id = new.user_id) then
    new.shared_project_id := v_id;
    new.shared_project_owner := v_owner;
  else
    new.shared_project_id := null;
    new.shared_project_owner := null;
  end if;
  return new;
end;
$$;

-- The live ping also goes out when a conversation leaves the project (the new row no longer names it).
create or replace function public.project_live_from_conversation()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_project uuid;
begin
  v_project := coalesce(
    new.shared_project_id,
    case when tg_op = 'UPDATE' then old.shared_project_id end,
    (select f.id from public.workspace_folders f where f.id = new.folder_id and f.user_id = new.user_id and f.shared_at is not null)
  );
  if v_project is not null then
    perform public.project_live_ping(v_project, new.id, false);
  end if;
  return new;
end;
$$;

-- Takes one conversation out of its project: it is a plain conversation of its author again, and cannot be linked back by an old page.
create or replace function public.project_unlink_conversation(p_project_id uuid, p_conversation_id uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_author uuid;
begin
  select user_id into v_author from public.workspace_conversations where id = p_conversation_id and shared_project_id = p_project_id for update;
  if v_author is null then return; end if;
  insert into public.project_conversation_exits (project_id, conversation_id, author_id, reason)
  values (p_project_id, p_conversation_id, v_author, p_reason)
  on conflict (project_id, conversation_id) do update set reason = excluded.reason, created_at = now();
  update public.workspace_conversations
  set shared_project_id = null, shared_project_owner = null, metadata = metadata - 'sharedProject', updated_at = now()
  where id = p_conversation_id;
end;
$$;

create or replace function public.project_unlink_member_conversations(p_project_id uuid, p_member_id uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  for v_id in select id from public.workspace_conversations where user_id = p_member_id and shared_project_id = p_project_id loop
    perform public.project_unlink_conversation(p_project_id, v_id, p_reason);
  end loop;
end;
$$;

revoke all on function public.project_unlink_conversation(uuid, uuid, text), public.project_unlink_member_conversations(uuid, uuid, text) from public, anon, authenticated, service_role;

-- The owner takes a conversation of someone else out of the project. (Their own conversations are taken out as in any folder; deleting someone else's is not possible for anybody.)
create or replace function public.move_conversation_out_of_project(p_project_id uuid, p_conversation_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_author uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if public.project_role(p_project_id, v_user) is distinct from 'owner' then raise exception 'not_allowed'; end if;
  select user_id into v_author from public.workspace_conversations where id = p_conversation_id and shared_project_id = p_project_id and shared_project_owner = v_user;
  if v_author is null then raise exception 'conversation_not_found'; end if;
  perform public.project_unlink_conversation(p_project_id, p_conversation_id, 'owner');
end;
$$;

-- The conversations a person wrote that were taken out of a project while they were away: their page forgets the link it still holds.
create or replace function public.list_my_project_exits()
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
    select jsonb_agg(jsonb_build_object('project_id', x.project_id, 'conversation_id', x.conversation_id) order by x.created_at desc)
    from (select * from public.project_conversation_exits where author_id = v_user order by created_at desc limit 500) x
  ), '[]'::jsonb);
end;
$$;

-- A member is taken out, or leaves: what they made in the project goes back to their own history.
drop function if exists public.remove_project_member(uuid, uuid, boolean);
create or replace function public.remove_project_member(p_project_id uuid, p_member_id uuid)
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
    perform public.project_unlink_member_conversations(p_project_id, p_member_id, 'removed');
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
  if found then
    perform public.project_unlink_member_conversations(p_project_id, v_user, 'left');
  end if;
end;
$$;

-- The copy for the owner (the server only). `server_collect_project_copy` says what a member made in the project, for the owner who removes them or for the member who leaves (null when the person
-- may not ask); the server copies the files and rewrites the parts; `server_store_project_copy` makes the conversations of the owner.
create or replace function public.project_copy_id(p_id uuid, p_owner uuid)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select md5(p_id::text || ':' || p_owner::text)::uuid;
$$;

create or replace function public.server_collect_project_copy(p_actor_id uuid, p_project_id uuid, p_member_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_folder public.workspace_folders;
  v_ok boolean;
begin
  select * into v_folder from public.workspace_folders where id = p_project_id and deleted_at is null;
  if v_folder.id is null or v_folder.shared_at is null then return null; end if;
  if p_member_id = v_folder.user_id then return null; end if;
  if not exists (select 1 from public.project_members m where m.project_id = p_project_id and m.member_id = p_member_id) then return null; end if;
  v_ok := (p_actor_id = v_folder.user_id) or (p_actor_id = p_member_id);
  if not v_ok then return null; end if;
  return jsonb_build_object(
    'owner_id', v_folder.user_id,
    'author_name', public.project_person_name(p_member_id),
    'conversations', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'title', c.title, 'summary', c.summary, 'model', c.model, 'provider', c.provider, 'metadata', c.metadata, 'created_at', c.created_at) order by c.created_at)
      from (select * from public.workspace_conversations where user_id = p_member_id and shared_project_id = p_project_id and shared_project_owner = v_folder.user_id and deleted_at is null and not archived order by created_at limit 500) c
    ), '[]'::jsonb),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'conversation_id', m.conversation_id, 'role', m.role, 'parts', m.parts, 'sequence', m.sequence, 'created_at', m.created_at) order by m.conversation_id, m.sequence)
      from public.workspace_messages m
      where m.user_id = p_member_id and m.deleted_at is null and m.status = 'complete'
        and m.conversation_id in (select c.id from public.workspace_conversations c where c.user_id = p_member_id and c.shared_project_id = p_project_id and c.shared_project_owner = v_folder.user_id and c.deleted_at is null and not c.archived)
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.server_store_project_copy(p_project_id uuid, p_member_id uuid, p_conversations jsonb, p_messages jsonb)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_folder public.workspace_folders;
  v_name text;
  v_count integer;
begin
  select * into v_folder from public.workspace_folders where id = p_project_id and deleted_at is null;
  if v_folder.id is null or v_folder.shared_at is null then raise exception 'project_not_found'; end if;
  v_name := public.project_person_name(p_member_id);
  -- only what the member really made in the project (the server cannot copy anything else by mistake)
  with picked as (
    select c.id as original, x.title, x.summary, x.model, x.provider, x.metadata, x.created_at
    from jsonb_to_recordset(coalesce(p_conversations, '[]'::jsonb)) as x(id uuid, title text, summary text, model text, provider text, metadata jsonb, created_at timestamptz)
    join public.workspace_conversations c on c.id = x.id and c.user_id = p_member_id and c.shared_project_id = p_project_id and c.shared_project_owner = v_folder.user_id and c.deleted_at is null
  ), made as (
    insert into public.workspace_conversations (id, user_id, folder_id, title, summary, model, provider, metadata, archived, pinned, created_at, updated_at)
    select public.project_copy_id(p.original, v_folder.user_id), v_folder.user_id, p_project_id, p.title, coalesce(p.summary, ''), p.model, p.provider,
      (coalesce(p.metadata, '{}'::jsonb) - 'sharedProject') || jsonb_build_object('copiedFrom', jsonb_build_object('authorId', p_member_id, 'authorName', v_name, 'conversationId', p.original, 'at', now())),
      false, false, p.created_at, now()
    from picked p
    on conflict (id) do nothing
    returning id
  )
  select count(*) into v_count from made;
  insert into public.workspace_messages (id, user_id, conversation_id, role, parts, status, sequence, created_at, updated_at)
  select public.project_copy_id(x.id, v_folder.user_id), v_folder.user_id, public.project_copy_id(x.conversation_id, v_folder.user_id), x.role, coalesce(x.parts, '[]'::jsonb), 'complete', x.sequence, x.created_at, now()
  from jsonb_to_recordset(coalesce(p_messages, '[]'::jsonb)) as x(id uuid, conversation_id uuid, role text, parts jsonb, sequence bigint, created_at timestamptz)
  where exists (select 1 from public.workspace_conversations c where c.id = public.project_copy_id(x.conversation_id, v_folder.user_id) and c.user_id = v_folder.user_id and c.metadata #>> '{copiedFrom,authorId}' = p_member_id::text)
  on conflict do nothing;
  return v_count;
end;
$$;

-- The read of a project also tells, from a time on, which conversations were taken out of it (as gone), so that the people who read the project forget them.
create or replace function public.server_read_project_for_member(p_user_id uuid, p_project_id uuid, p_since timestamptz default null, p_limit integer default 50, p_conversation_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text := public.project_role(p_project_id, p_user_id);
  v_folder public.workspace_folders;
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_ids uuid[];
  v_more boolean;
begin
  if v_role is null then return null; end if;
  select * into v_folder from public.workspace_folders where id = p_project_id;
  if v_folder.shared_at is null then return null; end if;
  -- A conversation is "active" when it or one of its messages changed: the person who writes it syncs the messages, and the conversation row follows, but the read does not lean on that.
  select coalesce(array_agg(page.id order by page.activity, page.id), '{}'), coalesce(bool_or(page.rn > v_limit), false)
  into v_ids, v_more
  from (
    select act.id, act.activity, row_number() over (order by act.activity, act.id) as rn
    from (
      select c.id, greatest(c.updated_at, coalesce((select max(m.updated_at) from public.workspace_messages m where m.conversation_id = c.id), c.updated_at)) as activity
      from public.workspace_conversations c
      where (
          (c.user_id = v_folder.user_id and c.folder_id = p_project_id) or (c.shared_project_id = p_project_id and c.shared_project_owner = v_folder.user_id)
          -- a conversation that was taken out of the project since the reader last looked comes once more, as gone, so that the reader forgets it
          or (p_since is not null and exists (select 1 from public.project_conversation_exits x where x.project_id = p_project_id and x.conversation_id = c.id))
        )
        and (p_conversation_id is null or c.id = p_conversation_id)
    ) act
    where p_since is null or act.activity > p_since
    order by act.activity, act.id
    limit v_limit + 1
  ) page;
  -- one more than the limit was looked for only to know if there is more
  if v_more then v_ids := v_ids[1:v_limit]; end if;
  return jsonb_build_object(
    'role', v_role,
    'shared_at', v_folder.shared_at,
    'has_more', v_more,
    'project', jsonb_build_object('id', v_folder.id, 'name', v_folder.name, 'icon', v_folder.icon, 'color', v_folder.color, 'text_color', v_folder.text_color, 'instructions', v_folder.instructions, 'memory_scope', v_folder.memory_scope, 'updated_at', v_folder.updated_at, 'sources', v_folder.sources),
    'owner_id', v_folder.user_id,
    'owner_name', public.project_person_name(v_folder.user_id),
    'conversations', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'author_id', c.user_id, 'author_name', public.project_person_name(c.user_id), 'title', c.title, 'model', c.model, 'provider', c.provider, 'metadata', c.metadata,
        'created_at', c.created_at, 'updated_at', greatest(c.updated_at, coalesce((select max(m.updated_at) from public.workspace_messages m where m.conversation_id = c.id), c.updated_at)), 'deleted_at', coalesce(c.deleted_at, (select x.created_at from public.project_conversation_exits x where x.project_id = p_project_id and x.conversation_id = c.id and c.shared_project_id is distinct from p_project_id and not (c.user_id = v_folder.user_id and c.folder_id = p_project_id))))
        order by greatest(c.updated_at, coalesce((select max(m.updated_at) from public.workspace_messages m where m.conversation_id = c.id), c.updated_at)), c.id)
      from public.workspace_conversations c where c.id = any (v_ids)
    ), '[]'::jsonb),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'conversation_id', m.conversation_id, 'role', m.role, 'parts', m.parts, 'metadata', m.metadata, 'sequence', m.sequence, 'created_at', m.created_at) order by m.conversation_id, m.sequence)
      from public.workspace_messages m where m.conversation_id = any (v_ids) and m.deleted_at is null
        and exists (select 1 from public.workspace_conversations k where k.id = m.conversation_id and ((k.user_id = v_folder.user_id and k.folder_id = p_project_id) or k.shared_project_id = p_project_id))
    ), '[]'::jsonb)
  );
end;
$$;

-- An editor changes the name, icon and colours of the project as well as the instructions and the sources.
drop function if exists public.update_shared_project(uuid, text, jsonb, timestamptz);
create or replace function public.update_shared_project(
  p_project_id uuid, p_instructions text default null, p_sources jsonb default null, p_expected timestamptz default null,
  p_name text default null, p_icon text default null, p_color text default null, p_text_color text default null
)
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
  set instructions = coalesce(p_instructions, instructions),
      sources = coalesce(p_sources, sources),
      name = coalesce(left(nullif(btrim(p_name), ''), 200), name),
      icon = coalesce(left(nullif(btrim(p_icon), ''), 40), icon),
      color = coalesce(left(nullif(btrim(p_color), ''), 40), color),
      text_color = coalesce(left(nullif(btrim(p_text_color), ''), 40), text_color),
      updated_at = now()
  where id = p_project_id returning * into v_folder;
  return jsonb_build_object('updated_at', v_folder.updated_at);
end;
$$;

revoke all on function
  public.move_conversation_out_of_project(uuid, uuid), public.list_my_project_exits(), public.remove_project_member(uuid, uuid), public.leave_project(uuid),
  public.update_shared_project(uuid, text, jsonb, timestamptz, text, text, text, text)
  from public, anon, authenticated;
grant execute on function
  public.move_conversation_out_of_project(uuid, uuid), public.list_my_project_exits(), public.remove_project_member(uuid, uuid), public.leave_project(uuid),
  public.update_shared_project(uuid, text, jsonb, timestamptz, text, text, text, text)
  to authenticated, service_role;
revoke all on function public.project_copy_id(uuid, uuid), public.server_collect_project_copy(uuid, uuid, uuid), public.server_store_project_copy(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.project_copy_id(uuid, uuid), public.server_collect_project_copy(uuid, uuid, uuid), public.server_store_project_copy(uuid, uuid, jsonb, jsonb) to service_role;
