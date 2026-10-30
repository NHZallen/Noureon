-- The vectors of the search by meaning over the past conversations (記憶, docs/superpowers/specs/2026-10-30-memory-redesign-design.md, §4.9): one row for each piece of a conversation
-- (a stretch of text, or a picture, video, sound or document that was attached), made by Gemini Embedding 2 with 768 numbers. They are kept in the cloud only when the person turned on
-- "sync the vectors" next to the search by meaning, so that another device (and the server, when it searches the past conversations while the page is closed) finds them
-- instead of making them again. A person who does not turn it on, or who uses a local account, keeps the vectors in the browser only and none of this table is used.
--
-- `piece_id` and `hash` are the page's: a vector is used only while the hash of the piece is the same. `model` is the version of the model that made it (another model, another index).
-- A piece the model could not read is kept with `failed` and no vector, so that no device tries it again. A person reads, writes and deletes only their own rows (the vectors are theirs
-- to turn off); the server reads them with the service key.

create extension if not exists vector with schema extensions;

create table if not exists public.workspace_memory_vectors (
  user_id uuid not null references auth.users (id) on delete cascade,
  piece_id text not null check (char_length(piece_id) between 1 and 300),
  model text not null check (char_length(model) between 1 and 80),
  hash text not null check (char_length(hash) between 1 and 80),
  embedding extensions.vector(768),
  failed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, piece_id),
  check (failed or embedding is not null)
);

alter table public.workspace_memory_vectors enable row level security;
revoke all on table public.workspace_memory_vectors from anon, authenticated;
grant select, insert, update, delete on table public.workspace_memory_vectors to authenticated;
grant select, insert, update, delete on table public.workspace_memory_vectors to service_role;

drop policy if exists "Users read their own memory vectors" on public.workspace_memory_vectors;
create policy "Users read their own memory vectors" on public.workspace_memory_vectors
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "Users add their own memory vectors" on public.workspace_memory_vectors;
create policy "Users add their own memory vectors" on public.workspace_memory_vectors
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "Users change their own memory vectors" on public.workspace_memory_vectors;
create policy "Users change their own memory vectors" on public.workspace_memory_vectors
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "Users delete their own memory vectors" on public.workspace_memory_vectors;
create policy "Users delete their own memory vectors" on public.workspace_memory_vectors
  for delete to authenticated using (user_id = (select auth.uid()));

comment on table public.workspace_memory_vectors is 'The vectors (768 numbers, Gemini Embedding 2) of the pieces of the past conversations, kept only when the person turned on syncing them. Read and changed by its owner and by the server.';

create or replace function public.touch_workspace_memory_vector()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists touch_workspace_memory_vector on public.workspace_memory_vectors;
create trigger touch_workspace_memory_vector
  before insert or update on public.workspace_memory_vectors
  for each row execute function public.touch_workspace_memory_vector();

-- The server's search: the pieces of one person nearest to a question (cosine likeness, 1 is the same), made by the same model. Only the service key may call it: the server
-- says whose pieces to search, a person's own page searches the vectors it holds itself.
create or replace function public.match_workspace_memory_vectors(
  p_user_id uuid,
  p_model text,
  p_query extensions.vector(768),
  p_limit integer default 20,
  p_min_cosine double precision default 0.5
)
returns table (piece_id text, hash text, cosine double precision)
language sql
stable
set search_path = ''
as $$
  select v.piece_id, v.hash, 1 - (v.embedding operator(extensions.<=>) p_query) as cosine
  from public.workspace_memory_vectors v
  where v.user_id = p_user_id
    and v.model = p_model
    and not v.failed
    and 1 - (v.embedding operator(extensions.<=>) p_query) >= p_min_cosine
  order by v.embedding operator(extensions.<=>) p_query
  limit least(greatest(p_limit, 1), 100);
$$;

revoke all on function public.match_workspace_memory_vectors(uuid, text, extensions.vector, integer, double precision) from public, anon, authenticated;
grant execute on function public.match_workspace_memory_vectors(uuid, text, extensions.vector, integer, double precision) to service_role;
