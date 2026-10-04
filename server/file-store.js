// Where the files a reply makes are kept: the person's own space in the cloud storage the app already uses for attachments
// (bucket `user-assets`, folder = the person's id, file name = the SHA-256 of the bytes). The reply message then holds the marker the
// app's own sync writes for such a file, so the app reads it back like any file it saved itself (src/app/sync/cloud-assets.js).

import { createHash } from 'node:crypto';

export const ASSET_BUCKET = 'user-assets';
const ASSET_MARKER = '__astraCloudAsset';

const encodePath = (path) => path.split('/').map((segment) => encodeURIComponent(segment)).join('/');

/** What one person may keep in the cloud: every file of their folder (attachments and the files a reply made) counts. */
export const USER_ASSET_QUOTA_BYTES = 500 * 1024 * 1024;

export class FileStoreError extends Error {
  /** `code` is 'quota' when the person's space is full. */
  constructor(message, status = 0, code = '') {
    super(message);
    this.name = 'FileStoreError';
    this.status = status;
    this.code = code;
  }
}

const SAFE_PATH = /^[0-9a-f-]{36}\/[0-9a-f]{64}$/;

export function createFileStore({ url, serviceKey, db = null, quotaBytes = USER_ASSET_QUOTA_BYTES, fetchImpl = fetch, timeoutMs = 120_000 }) {
  const authHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };

  /** How many bytes the person's folder holds, or null when that is not known (the database is not given, or does not answer). */
  async function usage(userId) {
    if (!db) return null;
    try {
      const used = Number(await db.rpc('user_asset_usage', { p_user_id: userId }));
      return Number.isFinite(used) ? used : null;
    } catch {
      return null;
    }
  }

  async function exists(path) {
    try {
      const response = await fetchImpl(`${url}/storage/v1/object/info/${ASSET_BUCKET}/${encodePath(path)}`, { headers: authHeaders, signal: AbortSignal.timeout(timeoutMs) });
      return response.ok;
    } catch {
      return false;
    }
  }

  /** Removes files (paths like `<person>/<hash>`) through the storage API, which also frees their space. Resolves how many it was asked to remove. */
  async function removeAll(paths) {
    const prefixes = (Array.isArray(paths) ? paths : []).filter((path) => SAFE_PATH.test(String(path)));
    if (!prefixes.length) return 0;
    const response = await fetchImpl(`${url}/storage/v1/object/${ASSET_BUCKET}`, {
      method: 'DELETE',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes }),
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!response.ok) throw new FileStoreError(`The files could not be removed (${response.status}).`, response.status);
    return prefixes.length;
  }

  /**
   * Keeps the bytes as the person's file. Resolves the marker to put where the file's data goes ({ __astraCloudAsset: { path, mimeType,
   * encoding } }). The same bytes are kept once (a file that is already there costs no space). Throws a FileStoreError with code 'quota'
   * when the file would take the person over their space.
   */
  async function save({ userId, bytes, mimeType = 'application/octet-stream' }) {
    const hash = createHash('sha256').update(bytes).digest('hex');
    const path = `${userId}/${hash}`;
    const marker = { [ASSET_MARKER]: { path, mimeType, encoding: 'base64' } };
    if (await exists(path)) return marker;
    const used = await usage(userId);
    if (used !== null && used + bytes.byteLength > quotaBytes) throw new FileStoreError('The person\'s space is full.', 507, 'quota');
    let response;
    try {
      response = await fetchImpl(`${url}/storage/v1/object/${ASSET_BUCKET}/${encodePath(path)}`, {
        method: 'POST',
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': mimeType,
          'Cache-Control': 'max-age=31536000, immutable',
          // The same bytes may already be there (a file made twice, or the browser saved it): that is not an error.
          'x-upsert': 'true'
        },
        body: bytes,
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch {
      throw new FileStoreError('The file could not be saved.');
    }
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new FileStoreError(`The file could not be saved (${response.status}).${text ? ` ${text.slice(0, 120)}` : ''}`, response.status);
    }
    return marker;
  }

  /** The bytes of a file the person kept (a marker like the one `save` gives). Only the person's own folder is read. */
  async function load({ userId, marker }) {
    const path = String(marker?.[ASSET_MARKER]?.path || '');
    if (!path.startsWith(`${userId}/`) || path.includes('..')) throw new FileStoreError('That file is not the person\'s own.');
    let response;
    try {
      response = await fetchImpl(`${url}/storage/v1/object/${ASSET_BUCKET}/${encodePath(path)}`, {
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch {
      throw new FileStoreError('The file could not be read.');
    }
    if (!response.ok) throw new FileStoreError(`The file could not be read (${response.status}).`, response.status);
    return new Uint8Array(await response.arrayBuffer());
  }

  return { save, load, usage, quotaBytes, removeAll };
}
