-- The people of one shared project see each other's picture (member button, member list, join page).
-- The pictures are files in the private bucket `user-avatars` (`<person>/avatar.webp`), readable only by their owner until now. This adds one more way to read a file: the person who made it is
-- in a shared project with the reader (the owner and a member, or two members of the same project). Nothing else about the bucket changes (the name stays exactly `<id>/avatar.webp`).

create or replace function public.shares_project_with(p_other uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and p_other is not null
    and p_other <> auth.uid()
    and (
      exists (select 1 from public.project_members mine join public.project_members theirs on theirs.project_id = mine.project_id where mine.member_id = auth.uid() and theirs.member_id = p_other)
      or exists (select 1 from public.project_members m where m.member_id = auth.uid() and m.owner_id = p_other)
      or exists (select 1 from public.project_members m where m.owner_id = auth.uid() and m.member_id = p_other)
    );
$$;

revoke all on function public.shares_project_with(uuid) from public, anon;
grant execute on function public.shares_project_with(uuid) to authenticated;

drop policy if exists "Project mates read avatars" on storage.objects;
create policy "Project mates read avatars"
on storage.objects for select to authenticated
using (
  bucket_id = 'user-avatars'
  and (select auth.uid()) is not null
  and case
    when name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/avatar\.webp$' then public.shares_project_with(split_part(name, '/', 1)::uuid)
    else false
  end
);
