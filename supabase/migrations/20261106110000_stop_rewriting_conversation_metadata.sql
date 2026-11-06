-- The link of a conversation to a shared project (shared_project_id, shared_project_owner) is made from its metadata by the trigger, and the metadata itself is left exactly as the page sent it.
-- (20261106090000 wrote the owner into the metadata when the page sent none, and 20261106070000 took the mark out of the metadata of a conversation that was taken out of the project.
-- The sync of the page reads a conversation back after it has sent it and compares every column; a metadata that the database had changed made that look like a failed sync, and the sync of that
-- account stayed off: nothing of the cloud, the shared projects included, worked on it. The columns are what the project reads; the metadata is the page's.)
create or replace function public.link_conversation_to_shared_project()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_owner uuid;
begin
  begin
    v_id := nullif(new.metadata #>> '{sharedProject,id}', '')::uuid;
    v_owner := nullif(new.metadata #>> '{sharedProject,ownerId}', '')::uuid;
  exception when others then
    v_id := null;
    v_owner := null;
  end;
  -- A page that did not know the owner yet sent none: the owner is the one of the (shared) project.
  if v_id is not null and v_owner is null then
    select f.user_id into v_owner from public.workspace_folders f where f.id = v_id and f.shared_at is not null;
  end if;
  if v_id is not null and exists (select 1 from public.project_conversation_exits x where x.project_id = v_id and x.conversation_id = new.id) then
    new.shared_project_id := null;
    new.shared_project_owner := null;
  elsif v_id is null or v_owner is null or v_owner = new.user_id then
    new.shared_project_id := null;
    new.shared_project_owner := null;
  elsif tg_op = 'UPDATE' and old.shared_project_id = v_id and old.shared_project_owner = v_owner and exists (select 1 from public.workspace_folders f where f.id = v_id and f.user_id = v_owner) then
    new.shared_project_id := v_id;
    new.shared_project_owner := v_owner;
  elsif exists (select 1 from public.project_members m where m.project_id = v_id and m.owner_id = v_owner and m.member_id = new.user_id) then
    new.shared_project_id := v_id;
    new.shared_project_owner := v_owner;
  else
    new.shared_project_id := null;
    new.shared_project_owner := null;
  end if;
  return new;
end;
$$;
revoke all on function public.link_conversation_to_shared_project() from public, anon, authenticated;
