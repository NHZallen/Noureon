// Two facts about the Email login of an account that Supabase does not give in the plain way (found on 2026-11-04 in the logs of the test project).
//
// 1. An account made with Google that sets a password (`updateUser({ password })`, the way Supabase documents for adding Email login to an OAuth account) gets the password, but NO identity of
//    the provider "email": its identities stay [google]. So "has an Email identity" is not the same as "has an Email login": the page showed "Bind Email" again after the password was set.
//    The truth is whether the account has a password: `account_has_password()` (supabase/migrations/20261104100000_add_account_has_password.sql) says so; where that is not there yet
//    (a project that did not get the migration) the mark the page leaves in the user's metadata when it sets the password stands in.
// 2. Signing up with an Email that already has an account is answered as if it worked (no mail is sent, nothing is made): the user comes back without a session and with `identities: []`.
//
// Shared by the page only; no window, no document.

export const EMAIL_PASSWORD_MARK = 'email_password_set';

/** Whether the answer of `signUp` is the pretended one for an Email that is registered already (no mail was sent). */
export const isRepeatedSignUp = (result) => Boolean(result?.data?.user)
  && !result.data.session
  && Array.isArray(result.data.user.identities)
  && result.data.user.identities.length === 0;

/** { providers, emailLogin } of the signed-in account: the providers of its identities, and whether it can sign in with its Email and a password. */
export async function readEmailLogin(supabase) {
  const { data, error } = await supabase.auth.getUserIdentities();
  const providers = error ? [] : (data?.identities || []).map((identity) => identity.provider);
  if (providers.includes('email')) return { providers, emailLogin: true };
  let answered = null;
  try {
    const result = await supabase.rpc?.('account_has_password');
    if (!result?.error && typeof result?.data === 'boolean') answered = result.data;
  } catch { /* the function is not in this project yet */ }
  if (answered !== null) return { providers, emailLogin: answered };
  try {
    const result = await supabase.auth.getUser();
    return { providers, emailLogin: result?.data?.user?.user_metadata?.[EMAIL_PASSWORD_MARK] === true };
  } catch {
    return { providers, emailLogin: false };
  }
}
