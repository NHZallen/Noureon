-- Skills with files (docs/superpowers/specs/2026-10-09-skills-design.md, §14): a person can add a skill as a zip with SKILL.md and folders such as references/ and
-- scripts/. The page checks the zip and keeps a clean copy (src/data/skill-bundle.js) in the private bucket `user-skill-bundles`, one file for each skill at
-- `<person>/<skill name>.zip`; the server opens it again with the same checks when a reply needs a file. The row of the skill in `user_skills` keeps the
-- list of files (path, size, kind) so the lists and the details can show them without downloading the zip.

alter table public.user_skills
  add column if not exists file_count integer not null default 0 check (file_count between 0 and 60),
  add column if not exists files jsonb not null default '[]'::jsonb check (jsonb_typeof(files) = 'array');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('user-skill-bundles', 'user-skill-bundles', false, 5242880, array['application/zip', 'application/x-zip-compressed', 'application/octet-stream'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users read their own skill bundles" on storage.objects;
create policy "Users read their own skill bundles"
on storage.objects for select to authenticated
using (bucket_id = 'user-skill-bundles' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Users upload their own skill bundles" on storage.objects;
create policy "Users upload their own skill bundles"
on storage.objects for insert to authenticated
with check (bucket_id = 'user-skill-bundles' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Users update their own skill bundles" on storage.objects;
create policy "Users update their own skill bundles"
on storage.objects for update to authenticated
using (bucket_id = 'user-skill-bundles' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'user-skill-bundles' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Users delete their own skill bundles" on storage.objects;
create policy "Users delete their own skill bundles"
on storage.objects for delete to authenticated
using (bucket_id = 'user-skill-bundles' and (storage.foldername(name))[1] = (select auth.uid())::text);

comment on column public.user_skills.files is 'The files of a skill added as a zip: [{ path, size, kind }]. The zip itself is in the bucket user-skill-bundles.';
