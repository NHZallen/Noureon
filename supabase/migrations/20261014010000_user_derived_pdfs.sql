-- The PDFs made of a person's Word and PowerPoint files (docs/superpowers/specs/2026-10-14-office-to-pdf-design.md, §4) are kept in the private bucket `user-derived`, one file for each
-- original at `<person>/<SHA-256 of the original>.pdf`, as a cache for the server (server/derived-pdf-store.js): a follow-up question in a conversation does not convert the file again.
-- The person never sees them, they are not in the conversation, and they take none of the 500 MB of `user-assets`.
--
-- `orphan_user_derived(older, limit)` lists the files to remove (the server removes them through the storage API once a day, server/asset-sweeper.js; they are only reported until the
-- environment says ASSET_SWEEP=delete):
--   * the PDF of an original that no row of any table of the public schema mentions any more (the path `<person>/<hash>` of the original, as the app's sync writes it: the conversation was
--     deleted for good), when it was last touched longer ago than `older` (a day, so a file made a little before its message is synced is never taken for an orphan);
--   * any PDF older than 30 days, whatever happens to the original (a safety net: the cache is made again when it is needed).
-- A temporary chat is never in the cloud, so the server never makes a file for it.

insert into storage.buckets (id, name, public)
values ('user-derived', 'user-derived', false)
on conflict (id) do nothing;

create or replace function public.orphan_user_derived(p_older_than interval default interval '1 day', p_limit integer default 500)
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
    'with refs as (%s) select o.name::text, (o.metadata->>%L)::bigint, greatest(o.created_at, o.updated_at) from storage.objects o where o.bucket_id = %L and o.name ~ %L and ((greatest(o.created_at, o.updated_at) < now() - %L::interval and not exists (select 1 from refs r where r.path = regexp_replace(o.name, %L, %L))) or greatest(o.created_at, o.updated_at) < now() - interval %L) order by o.created_at limit %s',
    refs, 'size', 'user-derived', '^' || pattern || '\.pdf$', p_older_than::text, '\.pdf$', '', '30 days', greatest(1, least(p_limit, 5000))
  );
end;
$fn$;

revoke all on function public.orphan_user_derived(interval, integer) from public, anon, authenticated;
grant execute on function public.orphan_user_derived(interval, integer) to service_role;
