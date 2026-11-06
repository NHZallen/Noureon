-- Conversations in a shared project (docs/superpowers/specs/2026-11-06-project-sharing-design.md, §4.2 and §5, S2).
--
-- A member makes a conversation in a shared project and it stays theirs (they are the only one who writes it). It is not put in the folder of the owner (the folder and the conversation must belong to the
-- same person); it says which project it belongs to in `shared_project_id` and `shared_project_owner`. The page does not write those two columns: it puts `sharedProject: { id, ownerId }` in the
-- metadata of the conversation (the sync already carries the metadata) and a trigger turns it into the columns, only for a person who is a member of that project. A link that already stands is kept
-- (a person who was taken out keeps what they made in it); a conversation whose metadata no longer names the project is not linked any more. When the project goes for good the link is emptied and the
-- conversation is a plain one of its author.
--
--   server_read_project_for_member(person, project, since, limit)   for the server only: the project, and the conversations of every member (and of the owner) in it with their messages, for a person
--                                                                   who is in the project. The server takes what belongs to the personal memory out of the older messages before it gives them on.

alter table public.workspace_conversations add column if not exists shared_project_id uuid;
alter table public.workspace_conversations add column if not exists shared_project_owner uuid;
alter table public.workspace_conversations drop constraint if exists workspace_conversations_shared_project_pair;
alter table public.workspace_conversations add constraint workspace_conversations_shared_project_pair
  check ((shared_project_id is null) = (shared_project_owner is null));
alter table public.workspace_conversations drop constraint if exists workspace_conversations_shared_project_fk;
alter table public.workspace_conversations add constraint workspace_conversations_shared_project_fk
  foreign key (shared_project_id, shared_project_owner) references public.workspace_folders (id, user_id)
  on delete set null (shared_project_id, shared_project_owner);
create index if not exists workspace_conversations_shared_project_idx on public.workspace_conversations (shared_project_id, updated_at) where shared_project_id is not null;

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
  if v_id is null or v_owner is null or v_owner = new.user_id then
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

drop trigger if exists link_conversation_to_shared_project on public.workspace_conversations;
create trigger link_conversation_to_shared_project
  before insert or update on public.workspace_conversations
  for each row execute function public.link_conversation_to_shared_project();

create or replace function public.server_read_project_for_member(p_user_id uuid, p_project_id uuid, p_since timestamptz default null, p_limit integer default 50)
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
  select coalesce(array_agg(page.id order by page.updated_at, page.id), '{}'), coalesce(bool_or(page.rn > v_limit), false)
  into v_ids, v_more
  from (
    select c.id, c.updated_at, row_number() over (order by c.updated_at, c.id) as rn
    from public.workspace_conversations c
    where ((c.user_id = v_folder.user_id and c.folder_id = p_project_id) or (c.shared_project_id = p_project_id and c.shared_project_owner = v_folder.user_id))
      and (p_since is null or c.updated_at > p_since)
    order by c.updated_at, c.id
    limit v_limit + 1
  ) page
  where page.rn <= v_limit + 1;
  -- one more than the limit was looked for only to know if there is more
  if v_more then v_ids := v_ids[1:v_limit]; end if;
  return jsonb_build_object(
    'role', v_role,
    'shared_at', v_folder.shared_at,
    'has_more', v_more,
    'project', jsonb_build_object('id', v_folder.id, 'name', v_folder.name, 'icon', v_folder.icon, 'color', v_folder.color, 'text_color', v_folder.text_color, 'instructions', v_folder.instructions, 'memory_scope', v_folder.memory_scope),
    'owner_id', v_folder.user_id,
    'owner_name', public.project_person_name(v_folder.user_id),
    'conversations', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'author_id', c.user_id, 'author_name', public.project_person_name(c.user_id), 'title', c.title, 'model', c.model, 'provider', c.provider, 'metadata', c.metadata,
        'created_at', c.created_at, 'updated_at', c.updated_at, 'deleted_at', c.deleted_at) order by c.updated_at, c.id)
      from public.workspace_conversations c where c.id = any (v_ids)
    ), '[]'::jsonb),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'conversation_id', m.conversation_id, 'role', m.role, 'parts', m.parts, 'metadata', m.metadata, 'sequence', m.sequence, 'created_at', m.created_at) order by m.conversation_id, m.sequence)
      from public.workspace_messages m where m.conversation_id = any (v_ids) and m.deleted_at is null
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.link_conversation_to_shared_project() from public, anon, authenticated;
revoke all on function public.server_read_project_for_member(uuid, uuid, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.server_read_project_for_member(uuid, uuid, timestamptz, integer) to service_role;
