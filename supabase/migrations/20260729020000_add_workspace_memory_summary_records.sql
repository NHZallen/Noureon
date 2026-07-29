-- Complete memory and its user-visible overview are deliberately stored as
-- independent records. Updating one section must not rewrite user_workspaces
-- (or upload another section's text).
create table if not exists public.workspace_memory_summary_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  record_key text not null check (char_length(record_key) between 1 and 512),
  layer text not null check (layer in ('summary', 'overview')),
  record_type text not null check (record_type in ('meta', 'section')),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz not null default statement_timestamp(),
  deleted_at timestamptz,
  primary key (user_id, record_key)
);

create index if not exists workspace_memory_summary_records_user_updated_idx
  on public.workspace_memory_summary_records(user_id, updated_at desc);

alter table public.workspace_memory_summary_records enable row level security;

drop policy if exists "Users read their own workspace memory summary records"
  on public.workspace_memory_summary_records;
create policy "Users read their own workspace memory summary records"
on public.workspace_memory_summary_records for select to authenticated
using ((select auth.uid()) = user_id);

revoke all on table public.workspace_memory_summary_records from public, anon, authenticated;
grant select on table public.workspace_memory_summary_records to authenticated;

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
    where workspace_memory_summary_records.deleted_at is null
      and workspace_memory_summary_records.updated_at <= excluded.updated_at
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

-- Realtime sends only the changed row, which the client folds into its local
-- record cache before reconciling the two memory layers.
do $$
begin
  if exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_catalog.pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'workspace_memory_summary_records'
    ) then
    alter publication supabase_realtime add table public.workspace_memory_summary_records;
  end if;
end;
$$;
