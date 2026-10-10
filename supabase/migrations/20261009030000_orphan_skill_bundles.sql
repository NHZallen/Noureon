-- The zips of the skills with files are kept in the bucket `user-skill-bundles`, one file for each skill at `<person>/<skill name>.zip` (src/data/skill-bundle.js,
-- docs/superpowers/specs/2026-10-09-skills-design.md, §14). A row of `user_skills` goes with its person when the account is deleted, but a file of the bucket does not: this
-- function lists the files that no row of `user_skills` points to any more (an account deleted, a zip left by a save that did not finish, a file put in the folder under any other
-- name), and that were last touched longer ago than `older` (a zip is uploaded a little before its row is written, so a young file is never taken for an orphan). For the server
-- (service role only), which removes them through the storage API once a day (server/asset-sweeper.js; they are only reported until the environment says ASSET_SWEEP=delete).

create or replace function public.orphan_skill_bundles(p_older_than interval default interval '1 day', p_limit integer default 500)
returns table (name text, size bigint, touched_at timestamptz)
language sql
stable
security definer
set search_path = public, storage, pg_temp
as $$
  select o.name::text, (o.metadata->>'size')::bigint, greatest(o.created_at, o.updated_at)
  from storage.objects o
  where o.bucket_id = 'user-skill-bundles'
    and greatest(o.created_at, o.updated_at) < now() - p_older_than
    and not exists (select 1 from public.user_skills s where (s.user_id::text || '/' || s.name || '.zip') = o.name)
  order by o.created_at
  limit greatest(1, least(p_limit, 5000));
$$;

revoke all on function public.orphan_skill_bundles(interval, integer) from public, anon, authenticated;
grant execute on function public.orphan_skill_bundles(interval, integer) to service_role;
