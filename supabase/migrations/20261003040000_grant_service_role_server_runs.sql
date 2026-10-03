-- The server (service role) reads and changes the rows of server_runs: marks a run running, keeps its checkpoint, ends it and deletes its key.
-- The first migration of this table took the privileges away from everyone but the owner and gave back only a column list to signed-in
-- people, which left the service role with nothing: every update of the server failed and its replies ended as errors.
grant select, insert, update, delete on table public.server_runs to service_role;
