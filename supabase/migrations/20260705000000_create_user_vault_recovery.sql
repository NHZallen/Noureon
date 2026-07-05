create table if not exists public.user_vault_recovery (
  user_id uuid primary key references auth.users(id) on delete cascade,
  recovery_payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_vault_recovery enable row level security;

drop policy if exists "Users manage their own vault recovery" on public.user_vault_recovery;
create policy "Users manage their own vault recovery"
on public.user_vault_recovery
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.user_vault_recovery to authenticated;
revoke all on public.user_vault_recovery from anon;
