-- The server names a conversation when the page that started it was closed before it could (docs/superpowers/specs/2026-11-13-server-conversation-naming-design.md).
--
-- Two functions for the server only. `server_conversation_title_state` says what the title of a conversation is now, so that the server does not ask a model for a title that was
-- already given. `server_set_conversation_title` changes the title only where it is still the placeholder the page saw (the name every new conversation has), the conversation is
-- not deleted and the person did not rename it: a title the page made or the person typed is never replaced, and the change reaches the person's other pages through
-- the sync sequence like any other change of the row.

create or replace function public.server_conversation_title_state(p_user_id uuid, p_conversation_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'title', conversations.title,
    'renamed', coalesce(conversations.metadata ->> 'isRenamed', 'false') = 'true',
    'deleted', conversations.deleted_at is not null
  )
  from public.workspace_conversations conversations
  where conversations.id = p_conversation_id and conversations.user_id = p_user_id;
$$;

create or replace function public.server_set_conversation_title(p_user_id uuid, p_conversation_id uuid, p_placeholder text, p_title text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null or p_conversation_id is null then
    raise exception 'User id and conversation id are required';
  end if;
  if p_title is null or pg_catalog.length(pg_catalog.btrim(p_title)) = 0 or pg_catalog.length(p_title) > 200 then
    raise exception 'A title of 1 to 200 characters is required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(public.workspace_entity_lock_key('conversation', p_conversation_id));
  update public.workspace_conversations conversations
  set title = p_title,
      updated_at = pg_catalog.now()
  where conversations.id = p_conversation_id
    and conversations.user_id = p_user_id
    and conversations.deleted_at is null
    and conversations.title = p_placeholder
    and coalesce(conversations.metadata ->> 'isRenamed', 'false') <> 'true';
  return found;
end;
$$;

revoke all on function public.server_conversation_title_state(uuid, uuid) from public, anon, authenticated;
grant execute on function public.server_conversation_title_state(uuid, uuid) to service_role;
revoke all on function public.server_set_conversation_title(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.server_set_conversation_title(uuid, uuid, text, text) to service_role;
