create or replace function public.workspace_safe_timestamptz(p_value text)
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_parsed timestamptz;
begin
  if p_value is null or pg_catalog.btrim(p_value) = '' then
    return null;
  end if;
  if p_value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[Tt][0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?([Zz]|[+-][0-9]{2}:[0-9]{2})$' then
    return null;
  end if;
  v_parsed := p_value::timestamptz;
  if not pg_catalog.isfinite(v_parsed) then
    return null;
  end if;
  return v_parsed;
exception
  when others then
    return null;
end;
$$;

create or replace function public.enforce_workspace_conversation_trash_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing_state_at timestamptz;
  v_incoming_state_at timestamptz;
  v_incoming_wins boolean := false;
  v_state_changed boolean := false;
begin
  new.metadata := case
    when pg_catalog.jsonb_typeof(new.metadata) = 'object' then new.metadata
    else '{}'::jsonb
  end;
  if new.deleted_at is not null and not pg_catalog.isfinite(new.deleted_at) then
    raise exception 'Workspace conversation deleted_at must be finite';
  end if;

  if tg_op = 'INSERT' then
    v_incoming_state_at := greatest(
      public.workspace_safe_timestamptz(new.metadata ->> 'trashStateUpdatedAt'),
      new.deleted_at
    );
    if v_incoming_state_at is not null then
      new.metadata := pg_catalog.jsonb_set(
        new.metadata,
        '{trashStateUpdatedAt}',
        pg_catalog.to_jsonb(v_incoming_state_at),
        true
      );
    end if;
    if new.deleted_at is not null then
      new.folder_id := null;
      new.archived := false;
    end if;
    if new.folder_id is null then
      new.metadata := new.metadata - 'legacyFolderId';
    else
      new.metadata := pg_catalog.jsonb_set(
        new.metadata,
        '{legacyFolderId}',
        pg_catalog.to_jsonb(new.folder_id),
        true
      );
    end if;
    return new;
  end if;

  v_existing_state_at := greatest(
    public.workspace_safe_timestamptz(old.metadata ->> 'trashStateUpdatedAt'),
    case
      when old.deleted_at is not null and pg_catalog.isfinite(old.deleted_at)
        then old.deleted_at
      else null
    end
  );
  v_incoming_state_at := greatest(
    public.workspace_safe_timestamptz(new.metadata ->> 'trashStateUpdatedAt'),
    new.deleted_at
  );
  v_state_changed := (old.deleted_at is null) <> (new.deleted_at is null);
  v_incoming_wins := case
    when v_existing_state_at is null and v_incoming_state_at is null
      then new.deleted_at is not null and old.deleted_at is null
    when v_existing_state_at is null then true
    when v_incoming_state_at is null then false
    when v_incoming_state_at > v_existing_state_at then true
    when v_incoming_state_at < v_existing_state_at then false
    else new.deleted_at is not null and old.deleted_at is null
  end;

  if not v_incoming_wins then
    new.deleted_at := old.deleted_at;
    if v_state_changed then
      new.folder_id := old.folder_id;
      new.archived := old.archived;
    end if;
    if v_existing_state_at is null then
      new.metadata := new.metadata - 'trashStateUpdatedAt';
    else
      new.metadata := pg_catalog.jsonb_set(
        new.metadata,
        '{trashStateUpdatedAt}',
        pg_catalog.to_jsonb(v_existing_state_at),
        true
      );
    end if;
  elsif v_incoming_state_at is not null then
    new.metadata := pg_catalog.jsonb_set(
      new.metadata,
      '{trashStateUpdatedAt}',
      pg_catalog.to_jsonb(v_incoming_state_at),
      true
    );
  end if;

  if new.deleted_at is not null then
    new.folder_id := null;
    new.archived := false;
  end if;
  if new.folder_id is null then
    new.metadata := new.metadata - 'legacyFolderId';
  else
    new.metadata := pg_catalog.jsonb_set(
      new.metadata,
      '{legacyFolderId}',
      pg_catalog.to_jsonb(new.folder_id),
      true
    );
  end if;
  return new;
end;
$$;

create or replace function public.workspace_trash_sync_capability()
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select 1;
$$;

lock table public.workspace_conversations in share row exclusive mode;

update public.workspace_conversations
set deleted_at = pg_catalog.statement_timestamp()
where deleted_at is not null
  and not pg_catalog.isfinite(deleted_at);

drop trigger if exists enforce_workspace_conversation_trash_state
  on public.workspace_conversations;
create trigger enforce_workspace_conversation_trash_state
before insert or update on public.workspace_conversations
for each row execute function public.enforce_workspace_conversation_trash_state();

update public.workspace_conversations
set metadata = case
      when public.workspace_safe_timestamptz(
        case
          when pg_catalog.jsonb_typeof(metadata) = 'object'
            then metadata ->> 'trashStateUpdatedAt'
          else null
        end
      ) is not null
        then metadata
      else pg_catalog.jsonb_set(
        case
          when pg_catalog.jsonb_typeof(metadata) = 'object' then metadata
          else '{}'::jsonb
        end,
        '{trashStateUpdatedAt}',
        pg_catalog.to_jsonb(coalesce(
          deleted_at,
          public.workspace_safe_timestamptz(
            case
              when pg_catalog.jsonb_typeof(metadata) = 'object'
                then metadata ->> 'stateUpdatedAt'
              else null
            end
          ),
          updated_at
        )),
        true
      )
    end,
    folder_id = case when deleted_at is not null then null else folder_id end,
    archived = case when deleted_at is not null then false else archived end
where public.workspace_safe_timestamptz(
    case
      when pg_catalog.jsonb_typeof(metadata) = 'object'
        then metadata ->> 'trashStateUpdatedAt'
      else null
    end
  ) is null
  or (deleted_at is not null and (folder_id is not null or archived));

update public.workspace_conversations
set metadata = case
  when folder_id is null then metadata - 'legacyFolderId'
  else pg_catalog.jsonb_set(
    metadata,
    '{legacyFolderId}',
    pg_catalog.to_jsonb(folder_id),
    true
  )
end
where metadata ->> 'legacyFolderId' is distinct from folder_id::text;

revoke all on function public.workspace_safe_timestamptz(text)
  from public, anon, authenticated;
revoke all on function public.enforce_workspace_conversation_trash_state()
  from public, anon, authenticated;
revoke all on function public.workspace_trash_sync_capability()
  from public, anon;
grant execute on function public.workspace_trash_sync_capability()
  to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'workspace_conversations'
  ) then
    alter publication supabase_realtime add table public.workspace_conversations;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'workspace_tombstones'
  ) then
    alter publication supabase_realtime add table public.workspace_tombstones;
  end if;
end
$$;
