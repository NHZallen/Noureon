-- Two functions for the server (service role only) about the files kept in the bucket `user-assets` (a folder of each person, a file named by the
-- SHA-256 of its bytes: see server/file-store.js):
--   user_asset_usage(person)            how many bytes the person's folder holds (the 500 MB each person may keep is checked before a file is saved)
--   orphan_user_assets(older, limit)    the files that no row of any table of the public schema mentions any more (a conversation deleted for good),
--                                        and that were last touched longer ago than `older` (a file is uploaded a little before the message that
--                                        holds it is synced, so a young file is never taken for an orphan)
-- The tables are not listed by hand: every table of the public schema is read, so a place that starts to keep such a path later is covered
-- without anyone remembering to add it here. A file is only ever removed through the storage API by the server (never by deleting its row).

create or replace function public.user_asset_usage(p_user_id uuid)
returns bigint
language sql
stable
security definer
set search_path = public, storage, pg_temp
as $$
  select coalesce(sum((o.metadata->>'size')::bigint), 0)::bigint
  from storage.objects o
  where o.bucket_id = 'user-assets'
    and (storage.foldername(o.name))[1] = p_user_id::text;
$$;

create or replace function public.orphan_user_assets(p_older_than interval default interval '1 day', p_limit integer default 500)
returns table (name text, size bigint, touched_at timestamptz)
language plpgsql
security definer
set search_path = public, storage, pg_temp
as $fn$
declare
  pattern constant text := '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{64})';
  refs text;
begin
  select string_agg(format('select (regexp_matches(x::text, %L, %L))[1] as path from public.%I x', pattern, 'g', c.relname), ' union ')
    into refs
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p');
  if refs is null then refs := 'select null::text as path where false'; end if;
  return query execute format(
    'with refs as (%s) select o.name::text, (o.metadata->>%L)::bigint, greatest(o.created_at, o.updated_at) from storage.objects o where o.bucket_id = %L and o.name ~ %L and greatest(o.created_at, o.updated_at) < now() - %L::interval and not exists (select 1 from refs r where r.path = o.name) order by o.created_at limit %s',
    refs, 'size', 'user-assets', '^' || pattern || '$', p_older_than::text, greatest(1, least(p_limit, 5000))
  );
end;
$fn$;

revoke all on function public.user_asset_usage(uuid) from public, anon, authenticated;
revoke all on function public.orphan_user_assets(interval, integer) from public, anon, authenticated;
grant execute on function public.user_asset_usage(uuid) to service_role;
grant execute on function public.orphan_user_assets(interval, integer) to service_role;
