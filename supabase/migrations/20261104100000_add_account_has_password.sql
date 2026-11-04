-- Whether the signed-in account has a password. An account made with Google that sets a password (updateUser({ password })) is given
-- the password but no identity of the provider "email", so the identities cannot tell whether it can sign in with its Email: this can.
-- It answers only for the caller (auth.uid()) and only true or false; the hash itself is never shown.
create or replace function public.account_has_password()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select u.encrypted_password is not null and u.encrypted_password <> '' from auth.users u where u.id = auth.uid()),
    false
  );
$$;

revoke all on function public.account_has_password() from public, anon;
grant execute on function public.account_has_password() to authenticated;
