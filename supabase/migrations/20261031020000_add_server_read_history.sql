-- The server looking back through the past conversations of a person (docs/superpowers/specs/2026-10-30-memory-redesign-design.md, §5): a reply that goes on after the page was closed
-- may search the person's conversations, as the page does. The server never reads the workspace tables itself (it has no grant on them, see server_upsert_workspace_message), so it
-- asks this function, which gives only what the search needs and only for the person it is asked for: the newest conversations and the TEXT of their finished messages (no files,
-- no metadata). Only the service key may call it.

create or replace function public.server_read_history(
  p_user_id uuid,
  p_max_conversations integer default 150,
  p_max_messages integer default 6000
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with chosen as (
    select c.id, c.updated_at
    from public.workspace_conversations c
    where c.user_id = p_user_id and c.deleted_at is null
    order by c.updated_at desc
    limit least(greatest(p_max_conversations, 1), 300)
  ),
  texts as (
    select m.conversation_id, m.role, m.created_at, m.sequence, chosen.updated_at as conversation_updated_at,
      (select coalesce(jsonb_agg(jsonb_build_object('text', part ->> 'text')), '[]'::jsonb)
         from jsonb_array_elements(case when jsonb_typeof(m.parts) = 'array' then m.parts else '[]'::jsonb end) as part
         where jsonb_typeof(part -> 'text') = 'string') as parts
    from public.workspace_messages m
    join chosen on chosen.id = m.conversation_id
    where m.user_id = p_user_id and m.deleted_at is null and m.status = 'complete' and m.role in ('user', 'model')
    order by chosen.updated_at desc, m.conversation_id, m.sequence
    limit least(greatest(p_max_messages, 1), 10000)
  )
  select jsonb_build_object(
    'conversations', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'updated_at', updated_at) order by updated_at desc) from chosen), '[]'::jsonb),
    'messages', coalesce((select jsonb_agg(jsonb_build_object('conversation_id', conversation_id, 'role', role, 'created_at', created_at, 'sequence', sequence, 'parts', parts) order by conversation_updated_at desc, conversation_id, sequence) from texts), '[]'::jsonb)
  );
$$;

revoke all on function public.server_read_history(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.server_read_history(uuid, integer, integer) to service_role;
