-- The sequence is made by 20260716010000_add_incremental_workspace_sync.sql, which grants the same: a new database (the test project) does not have it yet when this
-- file comes, so the grant is made only where the sequence already exists (the real database, where it was made earlier by hand).
do $$
begin
  if to_regclass('public.workspace_sync_seq') is not null then
    grant usage, select on sequence public.workspace_sync_seq to authenticated;
    revoke all on sequence public.workspace_sync_seq from anon;
  end if;
end
$$;
