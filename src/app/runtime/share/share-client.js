// The page's side of sharing a conversation (docs/superpowers/specs/2026-10-31-conversation-share-design.md, §4): making and renewing a share goes to the server (it makes the snapshot),
// listing and revoking go to the database as the signed-in person. Every function resolves { ok, ... } and never throws.

import { serverRequest } from '../cli/cli-server-bridge.js';

export const SHARE_MAX = 30;

/** The address of a share: the page of the share is served by the same site as the app. */
export const shareUrl = (code, origin = globalThis.location?.origin || 'https://noureon.com') => `${String(origin).replace(/\/$/, '')}/s/${code}`;

// What the server said, as { code, ... } for the dialog: 'limit', 'too_large' (with `what`: 'text' | 'files'), 'gone', 'sign_in', 'generic'.
const failure = (result) => {
  const error = result?.data?.error || {};
  const reason = error.reason || '';
  if (result?.status === 401 || result?.code === 'unauthorized') return { ok: false, code: 'sign_in' };
  if (reason === 'limit') return { ok: false, code: 'limit', max: Number(error.limit) || SHARE_MAX };
  if (reason === 'too_large') return { ok: false, code: 'too_large', what: error.what === 'files' ? 'files' : 'text' };
  if (result?.status === 404 || reason === 'not_active') return { ok: false, code: 'gone' };
  return { ok: false, code: 'generic' };
};

const fromRow = (row) => ({
  id: row.id,
  conversationId: row.conversation_id,
  code: row.code,
  mode: row.mode === 'continue' ? 'continue' : 'view',
  showName: row.show_name === true,
  title: row.title || '',
  deleted: row.status === 'conversation_deleted',
  // Paused after reports from several readers: the link does not work until the owner of the service has looked at it.
  suspended: row.status === 'suspended',
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

export function createShareClient({ request = serverRequest, getSupabase = () => null } = {}) {
  const asShare = (result) => {
    const share = result.data?.share;
    return result.ok && share?.id && share?.code ? { ok: true, share: { ...share, mode: share.mode === 'continue' ? 'continue' : 'view', showName: share.showName === true } } : failure(result);
  };
  return {
    async create({ conversationId, mode, showName, ownerName }) {
      try {
        return asShare(await request('POST', '/v1/shares', { body: JSON.stringify({ conversationId, mode, showName: showName === true, ownerName: showName === true ? String(ownerName || '') : '' }) }));
      } catch { return { ok: false, code: 'generic' }; }
    },
    async refresh(id) {
      try { return asShare(await request('POST', `/v1/shares/${id}/refresh`, { body: '{}' })); } catch { return { ok: false, code: 'generic' }; }
    },
    /** { ok: true, items: [...] } newest first (the ones whose conversation was deleted included, marked `deleted`). */
    async list() {
      try {
        const supabase = getSupabase();
        if (!supabase) return { ok: false, code: 'sign_in' };
        const { data, error } = await supabase.rpc('list_my_conversation_shares');
        return error ? { ok: false, code: 'generic' } : { ok: true, items: (Array.isArray(data) ? data : []).map(fromRow) };
      } catch { return { ok: false, code: 'generic' }; }
    },
    /** Takes a share away; for one whose conversation was deleted it removes the record. */
    async revoke(id) {
      try {
        const supabase = getSupabase();
        if (!supabase) return { ok: false, code: 'sign_in' };
        const { error } = await supabase.rpc('revoke_conversation_share', { p_id: id });
        return error ? { ok: false, code: 'generic' } : { ok: true };
      } catch { return { ok: false, code: 'generic' }; }
    }
  };
}
