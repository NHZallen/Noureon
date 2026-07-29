-- Meta rows are regenerable containers, not deletable user records. The
-- previous RPC made their tombstones permanent, which could erase the
-- user-visible memory overview after a reload. Remove those payload-less
-- legacy tombstones and allow a strictly newer row to recreate any key.
delete from public.workspace_memory_summary_records
where record_type = 'meta'
  and deleted_at is not null;

create or replace function public.upsert_workspace_memory_summary_records(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_rows is null or p_rows = 'null'::jsonb then
    return '[]'::jsonb;
  end if;
  if pg_catalog.jsonb_typeof(p_rows) <> 'array' then
    raise exception 'JSON array required';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_rows) items(value)
    where pg_catalog.jsonb_typeof(items.value) <> 'object'
      or coalesce(items.value ->> 'record_key', '') !~ '^(summary|overview):(meta|section:.+)$'
      or coalesce(items.value ->> 'layer', '') not in ('summary', 'overview')
      or coalesce(items.value ->> 'record_type', '') not in ('meta', 'section')
      or (items.value ->> 'record_type' = 'meta'
        and items.value ->> 'record_key' <> (items.value ->> 'layer') || ':meta')
      or (items.value ->> 'record_type' = 'section'
        and items.value ->> 'record_key' not like (items.value ->> 'layer') || ':section:%')
      or pg_catalog.jsonb_typeof(coalesce(items.value -> 'payload', '{}'::jsonb)) <> 'object'
  ) then
    raise exception 'Invalid memory summary record';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_rows) items(value)
    group by items.value ->> 'record_key'
    having pg_catalog.count(*) > 1
  ) then
    raise exception 'Duplicate memory summary record keys are not allowed';
  end if;

  with incoming as (
    select
      items.value ->> 'record_key' as record_key,
      items.value ->> 'layer' as layer,
      items.value ->> 'record_type' as record_type,
      coalesce(items.value -> 'payload', '{}'::jsonb) as payload,
      coalesce(nullif(items.value ->> 'updated_at', '')::timestamptz, statement_timestamp()) as updated_at,
      nullif(items.value ->> 'deleted_at', '')::timestamptz as deleted_at
    from pg_catalog.jsonb_array_elements(p_rows) items(value)
  ), writes as (
    insert into public.workspace_memory_summary_records (
      user_id, record_key, layer, record_type, payload, updated_at, deleted_at
    )
    select v_user_id, record_key, layer, record_type, payload, updated_at, deleted_at
    from incoming
    on conflict (user_id, record_key) do update
    set layer = excluded.layer,
        record_type = excluded.record_type,
        payload = excluded.payload,
        updated_at = excluded.updated_at,
        deleted_at = excluded.deleted_at
    where workspace_memory_summary_records.updated_at <= excluded.updated_at
      and (
        workspace_memory_summary_records.record_type <> 'section'
        or coalesce(workspace_memory_summary_records.payload ->> 'authority', 'automatic') <> 'manual'
        or coalesce(excluded.payload ->> 'authority', 'automatic') = 'manual'
      )
    returning record_key
  )
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(records)), '[]'::jsonb)
  into v_result
  from public.workspace_memory_summary_records records
  where records.user_id = v_user_id
    and records.record_key in (select record_key from incoming);

  return v_result;
end;
$$;

revoke all on function public.upsert_workspace_memory_summary_records(jsonb)
  from public, anon;
grant execute on function public.upsert_workspace_memory_summary_records(jsonb)
  to authenticated;
