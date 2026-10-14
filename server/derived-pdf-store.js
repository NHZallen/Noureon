// Where the PDFs made of a person's Word and PowerPoint files are kept (docs/superpowers/specs/2026-10-14-office-to-pdf-design.md, §4): the private bucket `user-derived`, one file
// for each original at `<person>/<SHA-256 of the original>.pdf`. It is a cache the person never sees: it is not in the conversation, it takes none of the person's 500 MB, and
// it is cleared with the original (server/asset-sweeper.js) and after 30 days. The server reads and writes it with its service role, only for the person the reply is for.

export const DERIVED_BUCKET = 'user-derived';
const USER_ID = /^[0-9a-f-]{36}$/i;
const KEY = /^[0-9a-f]{64}$/;
const SAFE_STORED = /^[0-9a-f-]{36}\/[0-9a-f]{64}\.pdf$/i;

export function createDerivedPdfStore({ url, serviceKey, fetchImpl = fetch, timeoutMs = 60_000 }) {
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
  const path = (userId, key) => (USER_ID.test(String(userId)) && KEY.test(String(key)) ? `${userId}/${key}.pdf` : null);
  return {
    /** The bytes of the PDF made of the original `key`, or null when there is none or it cannot be read now. */
    async read(userId, key) {
      const where = path(userId, key);
      if (!where) return null;
      try {
        const response = await fetchImpl(`${url}/storage/v1/object/${DERIVED_BUCKET}/${where}`, { headers, signal: AbortSignal.timeout(timeoutMs) });
        return response.ok ? new Uint8Array(await response.arrayBuffer()) : null;
      } catch {
        return null;
      }
    },
    /** Keeps the PDF. Resolves true when it was kept; a failure only means the next request converts again. */
    async write(userId, key, bytes) {
      const where = path(userId, key);
      if (!where) return false;
      try {
        const response = await fetchImpl(`${url}/storage/v1/object/${DERIVED_BUCKET}/${where}`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/pdf', 'x-upsert': 'true' },
          body: bytes,
          signal: AbortSignal.timeout(timeoutMs)
        });
        return response.ok;
      } catch {
        return false;
      }
    },
    /** Removes files of the bucket through the storage API: paths like `<person>/<hash>.pdf`, nothing else. Resolves how many it was asked to remove. */
    async removeAll(paths) {
      const prefixes = (Array.isArray(paths) ? paths : []).map(String).filter((item) => SAFE_STORED.test(item));
      if (!prefixes.length) return 0;
      const response = await fetchImpl(`${url}/storage/v1/object/${DERIVED_BUCKET}`, {
        method: 'DELETE',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixes }),
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!response.ok) throw Object.assign(new Error(`The files could not be removed (${response.status}).`), { status: response.status });
      return prefixes.length;
    }
  };
}
