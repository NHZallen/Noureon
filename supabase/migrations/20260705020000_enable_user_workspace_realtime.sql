do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'user_workspaces'
  ) then
    alter publication supabase_realtime add table public.user_workspaces;
  end if;
end
$$;
