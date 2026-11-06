-- Live updates for the people of a shared project (docs/superpowers/specs/2026-11-06-project-sharing-design.md, §18.5).
-- When something in a shared project changes (a message is written, a conversation is made or renamed, the instructions or sources change, a person joins or leaves), the database sends a small
-- ping on the Realtime broadcast channel `project:<project id>`: `{ "c": "<conversation id or null>" }`. A page that has the project open hears it and reads what changed through the server (the
-- ping holds no words of any conversation). The channel is private: only the owner and the members of the project may join it (a policy on realtime.messages).
--   - A message that is still being written (status 'streaming') pings at most once every 700 ms for its conversation (the server writes a growing reply every 300 ms); a message that is new, or
--     finished, or changed in any other way, always pings, so the last words are never held back.
--   - The projects that are not shared, and the conversations that are in none, send nothing.
--   - On a database without Realtime (a test) nothing is sent and nothing fails.

create unlogged table if not exists public.project_live_marks (
  mark_key text primary key,
  sent_at timestamptz not null default clock_timestamp()
);
alter table public.project_live_marks enable row level security;
revoke all on table public.project_live_marks from public, anon, authenticated;

-- Whether the signed-in person may hear the channel of a project (the owner or a member).
create or replace function public.can_hear_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and public.project_role(p_project_id, auth.uid()) is not null;
$$;
revoke all on function public.can_hear_project(uuid) from public, anon;
grant execute on function public.can_hear_project(uuid) to authenticated;

-- Sends the ping. `p_throttle` = do not send when one was sent for the same key less than 700 ms ago.
create or replace function public.project_live_ping(p_project_id uuid, p_conversation_id uuid, p_throttle boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_key text := p_project_id::text || ':' || coalesce(p_conversation_id::text, '');
  v_sent boolean := true;
begin
  if p_throttle then
    insert into public.project_live_marks (mark_key, sent_at) values (v_key, clock_timestamp())
    on conflict (mark_key) do update set sent_at = clock_timestamp() where public.project_live_marks.sent_at < clock_timestamp() - interval '700 milliseconds';
    get diagnostics v_sent = row_count;
  end if;
  if not v_sent then return; end if;
  begin
    perform realtime.send(jsonb_build_object('c', p_conversation_id), 'changed', 'project:' || p_project_id::text, true);
  exception when others then
    null; -- no Realtime here, or it refused: the pages read on their own timer anyway
  end;
end;
$$;
revoke all on function public.project_live_ping(uuid, uuid, boolean) from public, anon, authenticated, service_role;

-- The project a conversation belongs to: the owner's own conversation in the shared folder, or a member's conversation linked to it.
create or replace function public.project_of_conversation(p_conversation_id uuid, p_user_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(c.shared_project_id, (select f.id from public.workspace_folders f where f.id = c.folder_id and f.user_id = c.user_id and f.shared_at is not null))
  from public.workspace_conversations c where c.id = p_conversation_id and c.user_id = p_user_id;
$$;
revoke all on function public.project_of_conversation(uuid, uuid) from public, anon, authenticated, service_role;

create or replace function public.project_live_from_message()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_project uuid;
begin
  v_project := public.project_of_conversation(new.conversation_id, new.user_id);
  if v_project is not null then
    perform public.project_live_ping(v_project, new.conversation_id, tg_op = 'UPDATE' and new.status = 'streaming');
  end if;
  return new;
end;
$$;

create or replace function public.project_live_from_conversation()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_project uuid;
begin
  v_project := coalesce(new.shared_project_id, (select f.id from public.workspace_folders f where f.id = new.folder_id and f.user_id = new.user_id and f.shared_at is not null));
  if v_project is not null then
    perform public.project_live_ping(v_project, new.id, false);
  end if;
  return new;
end;
$$;

create or replace function public.project_live_from_folder()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if new.shared_at is not null then perform public.project_live_ping(new.id, null, false); end if;
  return new;
end;
$$;

create or replace function public.project_live_from_member()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform public.project_live_ping(coalesce(new.project_id, old.project_id), null, false);
  return coalesce(new, old);
end;
$$;

revoke all on function public.project_live_from_message(), public.project_live_from_conversation(), public.project_live_from_folder(), public.project_live_from_member() from public, anon, authenticated;

drop trigger if exists project_live_message on public.workspace_messages;
create trigger project_live_message after insert or update on public.workspace_messages
  for each row execute function public.project_live_from_message();

drop trigger if exists project_live_conversation on public.workspace_conversations;
create trigger project_live_conversation after insert or update of title, deleted_at, metadata, folder_id, shared_project_id on public.workspace_conversations
  for each row execute function public.project_live_from_conversation();

drop trigger if exists project_live_folder on public.workspace_folders;
create trigger project_live_folder after update of name, icon, color, text_color, instructions, sources, memory_scope, deleted_at on public.workspace_folders
  for each row execute function public.project_live_from_folder();

drop trigger if exists project_live_member on public.project_members;
create trigger project_live_member after insert or update or delete on public.project_members
  for each row execute function public.project_live_from_member();

-- Who may join the channel: only a person of the project. (Only where Realtime is installed.)
do $do$
begin
  if to_regclass('realtime.messages') is not null then
    execute 'drop policy if exists "People of a project hear its channel" on realtime.messages';
    execute $p$create policy "People of a project hear its channel" on realtime.messages for select to authenticated using (
      (select auth.uid()) is not null
      and realtime.messages.extension = 'broadcast'
      and case when (select realtime.topic()) ~ '^project:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then public.can_hear_project(substr((select realtime.topic()), 9)::uuid) else false end
    )$p$;
  end if;
end
$do$;
