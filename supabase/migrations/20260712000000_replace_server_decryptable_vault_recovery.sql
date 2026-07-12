-- Recovery v2 is encrypted in the browser with a user-held recovery code.
-- Version 1 rows used a shared server key and cannot be retained safely.
delete from public.user_vault_recovery
where coalesce(recovery_payload ->> 'version', '') <> '2';

alter table public.user_vault_recovery
drop constraint if exists user_vault_recovery_payload_v2;

alter table public.user_vault_recovery
add constraint user_vault_recovery_payload_v2
check (
  recovery_payload ->> 'version' = '2'
  and recovery_payload ->> 'algorithm' = 'PBKDF2-SHA256+A256GCM'
);
