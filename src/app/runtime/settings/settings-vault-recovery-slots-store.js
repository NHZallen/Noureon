// The recovery slots of the sync password as they are kept in the cloud (docs/superpowers/specs/2026-11-12-vault-recovery-design.md, §4 and §15):
// the row of the person in `user_vault_recovery`. `slots` holds the sealed slots (sealed in the browser, see vault-recovery-slots.js), and
// `recovery_payload` is what the old recovery of the server left there (it is dropped once a passkey is set up). The person's own rules of the
// table decide who may read and write, and with an authenticator app set up a write also asks for the code (aal2): a write that no row accepts is
// told, never taken for done.

import { normalizeRecoverySlots } from '../../sync/vault-recovery-slots.js';

const TABLE = 'user_vault_recovery';

export function createRecoverySlotsStore({ getSupabase }) {
  const userId = async () => {
    if (typeof getSupabase()?.auth?.getSession !== 'function') throw Object.assign(new Error('Sign in again.'), { code: 'session-required' });
    const { data, error } = await getSupabase().auth.getSession();
    const id = data?.session?.user?.id;
    if (error || !id) throw Object.assign(error || new Error('Sign in again.'), { code: 'session-required' });
    return id;
  };

  /** { slots, hasServerSlot } of the signed-in person ({ [], false } when nothing is kept). */
  async function load() {
    const id = await userId();
    const { data, error } = await getSupabase().from(TABLE).select('slots, recovery_payload').eq('user_id', id).maybeSingle();
    if (error) throw error;
    return { slots: normalizeRecoverySlots(data?.slots), hasServerSlot: Boolean(data?.recovery_payload) };
  }

  /** Keeps these slots (and, when asked, drops what the server's recovery left). Resolves the slots that were kept. */
  async function save(slots, { dropServerSlot = false } = {}) {
    const id = await userId();
    const row = { user_id: id, slots: normalizeRecoverySlots(slots), updated_at: new Date().toISOString() };
    if (dropServerSlot) row.recovery_payload = null;
    const { data, error } = await getSupabase().from(TABLE).upsert(row, { onConflict: 'user_id' }).select('slots');
    if (error) throw error;
    if (!data?.length) throw Object.assign(new Error('The recovery data was not saved.'), { code: 'recovery-not-saved' });
    return normalizeRecoverySlots(data[0].slots);
  }

  return { load, save };
}
