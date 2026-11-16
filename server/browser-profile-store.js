// The login state of a person's browser (docs/superpowers/specs/2026-11-16-browser-agent-design.md, §8.1): one archive for each person, sealed here before it is
// stored (server/key-vault.js, purpose `browser-profile`, bound to the person) in the private bucket `browser-profiles` at `<person>/profile.bin`, with a row in
// `browser_profiles` for the plain facts (size, when it was last used, sites to log out of). Browser-host never sees a key: this module opens the archive to hand it
// over and seals what comes back.

export const PROFILE_BUCKET = 'browser-profiles';
export const PROFILE_PURPOSE = 'browser-profile';
export const PROFILE_OBJECT = 'profile';
export const PROFILE_MAX_BYTES = 150 * 1024 * 1024;
export const PROFILE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

const USER_ID = /^[0-9a-f-]{36}$/i;
const SITE = /^[a-z0-9.-]{1,253}$/;

export class BrowserProfileError extends Error {
  constructor(message, code = 'failed', status = 0) {
    super(message);
    this.name = 'BrowserProfileError';
    this.code = code;
    this.status = status;
  }
}

export function createBrowserProfileStore({ db, vault, url, serviceKey, fetchImpl = fetch, now = Date.now, maxBytes = PROFILE_MAX_BYTES, ttlMs = PROFILE_TTL_MS, timeoutMs = 120_000, log = () => {} }) {
  const auth = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
  const pathOf = (userId) => {
    if (!USER_ID.test(String(userId || ''))) throw new BrowserProfileError('That is not a person.', 'bad_user');
    return `${userId}/profile.bin`;
  };
  const objectUrl = (path) => `${url}/storage/v1/object/${PROFILE_BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`;
  const sealing = (userId) => ({ userId, purpose: PROFILE_PURPOSE, objectId: PROFILE_OBJECT });

  async function row(userId) {
    pathOf(userId);
    const rows = await db.select('browser_profiles', { filters: { user_id: `eq.${userId}` }, select: 'user_id,size_bytes,key_version,pending_clear,updated_at,last_used_at', limit: 1 });
    return rows?.[0] || null;
  }

  async function removeObject(path) {
    const response = await fetchImpl(`${url}/storage/v1/object/${PROFILE_BUCKET}`, { method: 'DELETE', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: [path] }), signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) throw new BrowserProfileError(`The login state could not be removed (${response.status}).`, 'failed', response.status);
  }

  return {
    /** The facts of a person's stored login state, or null. */
    row,
    /**
     * The login state to start a browser from: { archive (a Buffer, plain tar.gz), pendingClear } or null when there is none. Marks it used (it expires 14 days after
     * the last use). Throws BrowserProfileError `unreadable` when what is stored cannot be opened (the key is gone, the object was changed): the caller starts without it.
     */
    async load(userId) {
      const path = pathOf(userId);
      const facts = await row(userId);
      if (!facts) return null;
      let response;
      try {
        response = await fetchImpl(objectUrl(path), { headers: auth, signal: AbortSignal.timeout(timeoutMs) });
      } catch {
        throw new BrowserProfileError('The login state could not be read.', 'unreachable');
      }
      if (response.status === 404 || response.status === 400) return null;
      if (!response.ok) throw new BrowserProfileError(`The login state could not be read (${response.status}).`, 'failed', response.status);
      let archive;
      try {
        archive = vault.openBlob(Buffer.from(await response.arrayBuffer()), facts.key_version, sealing(userId));
      } catch {
        throw new BrowserProfileError('The stored login state cannot be opened.', 'unreadable');
      }
      await db.update('browser_profiles', { user_id: `eq.${userId}` }, { last_used_at: new Date(now()).toISOString() }, { returning: 'user_id' }).catch(() => {});
      return { archive, pendingClear: Array.isArray(facts.pending_clear) ? facts.pending_clear : [] };
    },
    /** Seals and stores an archive (what browser-host returned); an archive that is too large is refused (413) and the old one is kept. */
    async save(userId, archive) {
      const path = pathOf(userId);
      const bytes = Buffer.from(archive || []);
      // A browser's profile is hundreds of kilobytes; a few dozen bytes is an empty folder, and it must never replace a login state that was kept.
      if (bytes.length < 1024) throw new BrowserProfileError('There is no login state to keep.', 'empty', 400);
      if (bytes.length > maxBytes) throw new BrowserProfileError('The login state is too large to keep.', 'too_large', 413);
      const { blob, keyVersion } = vault.sealBlob(bytes, sealing(userId));
      let response;
      try {
        response = await fetchImpl(objectUrl(path), { method: 'POST', headers: { ...auth, 'Content-Type': 'application/octet-stream', 'x-upsert': 'true' }, body: blob, signal: AbortSignal.timeout(timeoutMs) });
      } catch {
        throw new BrowserProfileError('The login state could not be kept.', 'unreachable');
      }
      if (!response.ok) throw new BrowserProfileError(`The login state could not be kept (${response.status}).`, 'failed', response.status);
      const stamp = new Date(now()).toISOString();
      // The file first, the row after: a row never points at a file that is not there. The row keeps `pending_clear` as it is (the columns not named stay).
      await db.upsert('browser_profiles', { user_id: userId, object_path: path, size_bytes: blob.length, key_version: keyVersion, updated_at: stamp, last_used_at: stamp }, { onConflict: 'user_id' });
      return { sizeBytes: blob.length };
    },
    /** Sites to log out of when the next browser starts (a person logged out or deleted a password while no browser was running). */
    async addPendingClear(userId, sites) {
      const wanted = [...new Set((Array.isArray(sites) ? sites : []).map((site) => String(site).toLowerCase()).filter((site) => SITE.test(site)))];
      const facts = await row(userId);
      if (!wanted.length || !facts) return false;
      const merged = [...new Set([...(facts.pending_clear || []), ...wanted])].slice(0, 200);
      await db.update('browser_profiles', { user_id: `eq.${userId}` }, { pending_clear: merged }, { returning: 'user_id' });
      return true;
    },
    async clearPending(userId) {
      pathOf(userId);
      await db.update('browser_profiles', { user_id: `eq.${userId}` }, { pending_clear: [] }, { returning: 'user_id' });
    },
    /** Removes a person's login state (file and row). Safe to call when there is none. */
    async remove(userId) {
      const path = pathOf(userId);
      await removeObject(path);
      await db.remove('browser_profiles', { user_id: `eq.${userId}` });
    },
    /** Removes the login states that were not used for 14 days; returns how many. A file that cannot be removed keeps its row, so the next pass tries again. */
    async sweepExpired() {
      const before = new Date(now() - ttlMs).toISOString();
      const rows = await db.select('browser_profiles', { filters: { last_used_at: `lt.${before}` }, select: 'user_id', limit: 200 });
      let removed = 0;
      for (const { user_id: userId } of rows || []) {
        try {
          await this.remove(userId);
          removed += 1;
        } catch (error) {
          log('browser_profile_sweep_failed', { code: error?.code || '', status: error?.status || 0 });
        }
      }
      return removed;
    }
  };
}
