-- Retires the recovery of the sync password that the server kept (docs/superpowers/specs/2026-11-12-vault-recovery-design.md, NOU-183).
--
-- `recovery_payload` held the sync password and its vault record sealed with one key of the server (the environment variable
-- SYNC_VAULT_RECOVERY_KEY). Whoever had that key could open every one of them, so the way back by Email is gone for good: a forgotten sync password
-- is recovered with a passkey (the `slots` column, sealed in the browser) or the person starts over.
--
-- This clears every copy that is kept (it cannot be undone; the copies are of no use without the server's recovery, which is removed from the app in
-- the same release) and makes the column accept nothing but empty from now on, so no copy of a sync password can be stored with a key of the server again.
-- Apply it to the test project first. After it and the deploy, delete the environment variable SYNC_VAULT_RECOVERY_KEY and keep no copy of its value.

update public.user_vault_recovery
set recovery_payload = null
where recovery_payload is not null;

alter table public.user_vault_recovery
  drop constraint if exists user_vault_recovery_payload_retired;
alter table public.user_vault_recovery
  add constraint user_vault_recovery_payload_retired check (recovery_payload is null);

comment on column public.user_vault_recovery.recovery_payload is 'Retired (2026-11-13): always empty. Recovery is by passkey slots (the slots column) or starting over.';
