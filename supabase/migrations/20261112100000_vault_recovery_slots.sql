-- Recovery slots for the sync password (docs/superpowers/specs/2026-11-12-vault-recovery-design.md, NOU-183).
--
-- A slot is the sync password and its vault record sealed in the browser with a key only the person's passkey can give; the table keeps the sealed
-- text alone. `recovery_payload` (sealed with the one key of the server, the way recovery worked before) may now be empty: a person who only has
-- passkey slots has no payload of the server's. It is kept for the people who have not set up a passkey yet, and dropped later (2026-12-31).
--
-- (Names of rules are cut at 63 characters: each one has a name of its own that is shorter, or the three would be one.)
-- A person who has set up an authenticator app (a verified TOTP factor of Supabase MFA) must have confirmed it with the 6-digit code (aal2) to
-- add, change or delete their recovery data: a stolen Email sign-in alone cannot replace or remove it. Reading is not restricted (the slots are sealed).

alter table public.user_vault_recovery
  alter column recovery_payload drop not null;

alter table public.user_vault_recovery
  add column if not exists slots jsonb not null default '[]'::jsonb;

alter table public.user_vault_recovery
  drop constraint if exists user_vault_recovery_slots_shape;
alter table public.user_vault_recovery
  add constraint user_vault_recovery_slots_shape
  check (jsonb_typeof(slots) = 'array' and jsonb_array_length(slots) <= 8 and octet_length(slots::text) <= 65536);

-- Whether the signed-in person has an authenticator app set up and confirmed. The table of factors is not readable by the person's role, so
-- the question is asked by a function that is (and answers only about the person asking).
create or replace function public.user_has_verified_totp()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.mfa_factors
    where user_id = (select auth.uid())
      and factor_type = 'totp'
      and status = 'verified'
  );
$$;

revoke all on function public.user_has_verified_totp() from public, anon;
grant execute on function public.user_has_verified_totp() to authenticated;

drop policy if exists "Vault recovery insert needs the authenticator app" on public.user_vault_recovery;
create policy "Vault recovery insert needs the authenticator app"
on public.user_vault_recovery
as restrictive
for insert
to authenticated
with check ((select auth.uid()) = user_id and (not public.user_has_verified_totp() or (select auth.jwt() ->> 'aal') = 'aal2'));

drop policy if exists "Vault recovery update needs the authenticator app" on public.user_vault_recovery;
create policy "Vault recovery update needs the authenticator app"
on public.user_vault_recovery
as restrictive
for update
to authenticated
using ((select auth.uid()) = user_id and (not public.user_has_verified_totp() or (select auth.jwt() ->> 'aal') = 'aal2'))
with check ((select auth.uid()) = user_id and (not public.user_has_verified_totp() or (select auth.jwt() ->> 'aal') = 'aal2'));

drop policy if exists "Vault recovery delete needs the authenticator app" on public.user_vault_recovery;
create policy "Vault recovery delete needs the authenticator app"
on public.user_vault_recovery
as restrictive
for delete
to authenticated
using ((select auth.uid()) = user_id and (not public.user_has_verified_totp() or (select auth.jwt() ->> 'aal') = 'aal2'));
