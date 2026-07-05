create or replace function public.set_user_workspace_sync_timestamps()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  server_now timestamptz := statement_timestamp();
begin
  new.updated_at := server_now;

  if tg_op = 'INSERT' then
    new.app_data_updated_at := case when new.app_data is null then null else server_now end;
    new.config_updated_at := case when new.config is null then null else server_now end;
    new.sensitive_config_updated_at := case when new.sensitive_config is null then null else server_now end;
    new.vault_record_updated_at := case when new.vault_record is null then null else server_now end;
  else
    new.app_data_updated_at := case
      when new.app_data is distinct from old.app_data then server_now else old.app_data_updated_at end;
    new.config_updated_at := case
      when new.config is distinct from old.config then server_now else old.config_updated_at end;
    new.sensitive_config_updated_at := case
      when new.sensitive_config is distinct from old.sensitive_config then server_now else old.sensitive_config_updated_at end;
    new.vault_record_updated_at := case
      when new.vault_record is distinct from old.vault_record then server_now else old.vault_record_updated_at end;
  end if;

  return new;
end;
$$;

drop trigger if exists set_user_workspace_sync_timestamps on public.user_workspaces;
create trigger set_user_workspace_sync_timestamps
before insert or update on public.user_workspaces
for each row execute function public.set_user_workspace_sync_timestamps();
