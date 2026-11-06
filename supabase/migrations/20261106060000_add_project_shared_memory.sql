-- The memory of a shared project is one list for all of its people (docs/superpowers/specs/2026-11-06-project-sharing-design.md, §7 and §18.5).
-- The notes of the project are the notes of its OWNER that carry the id of the project (`payload.projectId`, the project memory that sharing forces on). The owner's other notes are never reached.
-- The owner and the editors write them (by hand and by the automatic learning); a chat member only reads. What belongs to the person who writes (the settings, how far a conversation was read,
-- the events) stays in that person's own rows.
--   read_project_memory(project)              anyone in the project: the note rows of the project, as { record_key, payload, version, updated_at, deleted_at }.
--   write_project_memory(project, changes)    the owner and the editors: [{ key, payload, baseVersion, deleted }] -> [{ key, status: 'ok' | 'conflict' | 'refused', row }], the same answer the memory
--                                             backends give. Only `note:<id>` keys; the payload is tagged with the project; a row that is not a note of this project is never touched.
--   server_project_memory_access(person, project)        for the server: { owner_id, role } of a person in a shared project, or null.
--   server_read_project_history(person, project, ...)    for the server: the conversations of all the people of the project, in the shape of server_read_history (every one of them in the project).

create or replace function public.read_project_memory(p_project_id uuid)
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
  if public.project_role(p_project_id, v_user) is null then raise exception 'not_a_member'; end if;
  select * into v_folder from public.workspace_folders where id = p_project_id;
  if v_folder.shared_at is null then raise exception 'not_shared'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('record_key', r.record_key, 'payload', r.payload, 'version', r.version, 'updated_at', r.updated_at, 'deleted_at', r.deleted_at) order by r.record_key)
    from public.workspace_memory_records r
    where r.user_id = v_folder.user_id and r.record_key like 'note:%' and r.payload ->> 'projectId' = p_project_id::text
  ), '[]'::jsonb);
end;
$$;

create or replace function public.write_project_memory(p_project_id uuid, p_changes jsonb)
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
  v_change jsonb;
  v_key text;
  v_payload jsonb;
  v_base bigint;
  v_deleted boolean;
  v_row public.workspace_memory_records;
  v_results jsonb := '[]'::jsonb;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  v_role := public.project_role(p_project_id, v_user);
  if v_role is null then raise exception 'not_a_member'; end if;
  if v_role = 'chat' then raise exception 'not_allowed'; end if;
  select * into v_folder from public.workspace_folders where id = p_project_id;
  if v_folder.shared_at is null then raise exception 'not_shared'; end if;
  if jsonb_typeof(p_changes) <> 'array' or jsonb_array_length(p_changes) > 100 then raise exception 'invalid_changes'; end if;
  for v_change in select * from jsonb_array_elements(p_changes) loop
    v_key := v_change ->> 'key';
    v_payload := v_change -> 'payload';
    v_base := nullif(v_change ->> 'baseVersion', '')::bigint;
    v_deleted := coalesce((v_change ->> 'deleted')::boolean, false);
    if v_key is null or v_key !~ '^note:[^[:space:]]+$' or char_length(v_key) > 260 or jsonb_typeof(v_payload) <> 'object' then
      v_results := v_results || jsonb_build_array(jsonb_build_object('key', v_key, 'status', 'refused'));
      continue;
    end if;
    v_payload := jsonb_set(v_payload, '{projectId}', to_jsonb(p_project_id::text));
    select * into v_row from public.workspace_memory_records where user_id = v_folder.user_id and record_key = v_key;
    if found and coalesce(v_row.payload ->> 'projectId', '') <> p_project_id::text then
      -- a note of the owner that is not of this project: never touched
      v_results := v_results || jsonb_build_array(jsonb_build_object('key', v_key, 'status', 'refused'));
      continue;
    end if;
    if not found then
      if v_base is not null then
        v_results := v_results || jsonb_build_array(jsonb_build_object('key', v_key, 'status', 'conflict', 'row', null));
        continue;
      end if;
      insert into public.workspace_memory_records (user_id, record_key, payload, deleted_at)
      values (v_folder.user_id, v_key, v_payload, case when v_deleted then now() else null end) returning * into v_row;
    else
      if v_base is distinct from v_row.version then
        v_results := v_results || jsonb_build_array(jsonb_build_object('key', v_key, 'status', 'conflict', 'row', jsonb_build_object('record_key', v_row.record_key, 'payload', v_row.payload, 'version', v_row.version, 'updated_at', v_row.updated_at, 'deleted_at', v_row.deleted_at)));
        continue;
      end if;
      update public.workspace_memory_records set payload = v_payload, deleted_at = case when v_deleted then now() else null end
      where user_id = v_folder.user_id and record_key = v_key returning * into v_row;
    end if;
    v_results := v_results || jsonb_build_array(jsonb_build_object('key', v_key, 'status', 'ok', 'row', jsonb_build_object('record_key', v_row.record_key, 'payload', v_row.payload, 'version', v_row.version, 'updated_at', v_row.updated_at, 'deleted_at', v_row.deleted_at)));
  end loop;
  return v_results;
end;
$$;

create or replace function public.server_project_memory_access(p_user_id uuid, p_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text := public.project_role(p_project_id, p_user_id);
  v_folder public.workspace_folders;
begin
  if v_role is null then return null; end if;
  select * into v_folder from public.workspace_folders where id = p_project_id;
  if v_folder.id is null or v_folder.shared_at is null or v_folder.deleted_at is not null then return null; end if;
  return jsonb_build_object('owner_id', v_folder.user_id, 'role', v_role);
end;
$$;

create or replace function public.server_read_project_history(p_user_id uuid, p_project_id uuid, p_max_conversations integer default 150, p_max_messages integer default 6000)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_folder public.workspace_folders;
begin
  if public.project_role(p_project_id, p_user_id) is null then return null; end if;
  select * into v_folder from public.workspace_folders where id = p_project_id;
  if v_folder.id is null or v_folder.shared_at is null or v_folder.deleted_at is not null then return null; end if;
  return (
    with chosen as (
      select c.id, c.user_id, c.updated_at
      from public.workspace_conversations c
      where c.deleted_at is null
        and ((c.user_id = v_folder.user_id and c.folder_id = p_project_id) or (c.shared_project_id = p_project_id and c.shared_project_owner = v_folder.user_id))
      order by c.updated_at desc
      limit least(greatest(p_max_conversations, 1), 300)
    ),
    texts as (
      select m.conversation_id, m.role, m.created_at, m.sequence, chosen.updated_at as conversation_updated_at,
        (select coalesce(jsonb_agg(jsonb_build_object('text', part ->> 'text')), '[]'::jsonb)
           from jsonb_array_elements(case when jsonb_typeof(m.parts) = 'array' then m.parts else '[]'::jsonb end) as part
           where jsonb_typeof(part -> 'text') = 'string') as parts
      from public.workspace_messages m
      join chosen on chosen.id = m.conversation_id and chosen.user_id = m.user_id
      where m.deleted_at is null and m.status = 'complete' and m.role in ('user', 'model')
      order by chosen.updated_at desc, m.conversation_id, m.sequence
      limit least(greatest(p_max_messages, 1), 10000)
    )
    select jsonb_build_object(
      -- every conversation is "in the project": the search of a reply in it looks through all of them
      'conversations', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'updated_at', updated_at, 'folder_id', p_project_id) order by updated_at desc) from chosen), '[]'::jsonb),
      'project_folders', jsonb_build_array(p_project_id),
      'messages', coalesce((select jsonb_agg(jsonb_build_object('conversation_id', conversation_id, 'role', role, 'created_at', created_at, 'sequence', sequence, 'parts', parts) order by conversation_updated_at desc, conversation_id, sequence) from texts), '[]'::jsonb)
    )
  );
end;
$$;

revoke all on function public.read_project_memory(uuid), public.write_project_memory(uuid, jsonb), public.server_project_memory_access(uuid, uuid), public.server_read_project_history(uuid, uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.read_project_memory(uuid), public.write_project_memory(uuid, jsonb) to authenticated, service_role;
grant execute on function public.server_project_memory_access(uuid, uuid), public.server_read_project_history(uuid, uuid, integer, integer) to service_role;
