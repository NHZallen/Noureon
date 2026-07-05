create table if not exists public.user_workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  app_data jsonb,
  config jsonb,
  sensitive_config jsonb,
  vault_record jsonb,
  app_data_updated_at timestamptz,
  config_updated_at timestamptz,
  sensitive_config_updated_at timestamptz,
  vault_record_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_workspaces enable row level security;

drop policy if exists "Users manage their own workspace" on public.user_workspaces;
create policy "Users manage their own workspace"
on public.user_workspaces
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.user_workspaces to authenticated;
revoke all on public.user_workspaces from anon;

insert into storage.buckets (id, name, public, file_size_limit)
values ('user-assets', 'user-assets', false, 52428800)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

drop policy if exists "Users read their own assets" on storage.objects;
create policy "Users read their own assets"
on storage.objects for select to authenticated
using (bucket_id = 'user-assets' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Users upload their own assets" on storage.objects;
create policy "Users upload their own assets"
on storage.objects for insert to authenticated
with check (bucket_id = 'user-assets' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Users update their own assets" on storage.objects;
create policy "Users update their own assets"
on storage.objects for update to authenticated
using (bucket_id = 'user-assets' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'user-assets' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Users delete their own assets" on storage.objects;
create policy "Users delete their own assets"
on storage.objects for delete to authenticated
using (bucket_id = 'user-assets' and (storage.foldername(name))[1] = (select auth.uid())::text);
