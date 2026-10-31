// Where the files of a shared conversation are kept: the public bucket `shared-assets`, one folder for each share (`<share id>/<SHA-256 of the bytes>`). The files a conversation holds
// (the person's own folder in `user-assets`) are COPIED here by the storage API, so what is shared does not change when the person's own files do, and taking the share away removes them.
// Whoever has the exact address reads a file; the folder is the id of the share (a random uuid) and the name is the hash, so an address cannot be guessed.

import { createHash } from 'node:crypto';

export const SHARED_BUCKET = 'shared-assets';
const USER_BUCKET = 'user-assets';
const SAFE_USER_PATH = /^[0-9a-f-]{36}\/[0-9a-f]{64}$/;
const SAFE_NAME = /^[0-9a-f-]{36}\/[0-9a-f]{64}$/;

const encodePath = (path) => path.split('/').map((segment) => encodeURIComponent(segment)).join('/');

export class ShareStoreError extends Error {
  constructor(message, status = 0, code = '') {
    super(message);
    this.name = 'ShareStoreError';
    this.status = status;
    this.code = code;
  }
}

export function createShareStore({ url, serviceKey, fetchImpl = fetch, timeoutMs = 120_000 }) {
  const authHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
  const call = async (path, options = {}) => {
    try {
      return await fetchImpl(`${url}/storage/v1/${path}`, { ...options, headers: { ...authHeaders, ...(options.headers || {}) }, signal: AbortSignal.timeout(timeoutMs) });
    } catch {
      throw new ShareStoreError('The storage could not be reached.', 0, 'unreachable');
    }
  };

  /** The size and the type of one file of the person's own folder, or null when it is not there. */
  async function infoOfUserFile(path) {
    const response = await call(`object/info/${USER_BUCKET}/${encodePath(path)}`);
    if (response.status === 404 || response.status === 400) return null;
    if (!response.ok) throw new ShareStoreError(`The file could not be looked at (${response.status}).`, response.status);
    const info = await response.json().catch(() => ({}));
    return { size: Number(info?.size ?? info?.metadata?.size) || 0, mimeType: String(info?.content_type ?? info?.metadata?.mimetype ?? '') };
  }

  /**
   * Copies a file of the person (`<person>/<hash>`) into the folder of the share. Resolves { size, mimeType }; null when the person's file is not there any more.
   * A file that is already in the folder is not an error (the same bytes are named by their hash).
   */
  async function copyUserFile({ userId, shareId, hash }) {
    const sourceKey = `${userId}/${hash}`;
    if (!SAFE_USER_PATH.test(sourceKey)) throw new ShareStoreError('That file is not a file of the person.');
    const info = await infoOfUserFile(sourceKey);
    if (!info) return null;
    const response = await call('object/copy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bucketId: USER_BUCKET, sourceKey, destinationBucket: SHARED_BUCKET, destinationKey: `${shareId}/${hash}` })
    });
    if (!response.ok && response.status !== 409) {
      const text = await response.text().catch(() => '');
      if (response.status === 400 && /already exists|duplicate/i.test(text)) return info;
      throw new ShareStoreError(`The file could not be copied (${response.status}).`, response.status);
    }
    return info;
  }

  /** Keeps bytes (a file of a message that was never moved to the person's folder) in the folder of the share. Resolves { hash, size }. */
  async function putBytes({ shareId, bytes, mimeType = 'application/octet-stream' }) {
    const hash = createHash('sha256').update(bytes).digest('hex');
    const response = await call(`object/${SHARED_BUCKET}/${encodePath(`${shareId}/${hash}`)}`, {
      method: 'POST',
      headers: { 'Content-Type': mimeType, 'Cache-Control': 'max-age=31536000, immutable', 'x-upsert': 'true' },
      body: bytes
    });
    if (!response.ok) throw new ShareStoreError(`The file could not be saved (${response.status}).`, response.status);
    return { hash, size: bytes.byteLength };
  }

  /** The names (`<share id>/<hash>`) in the folder of a share. */
  async function list(shareId) {
    const response = await call(`object/list/${SHARED_BUCKET}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix: shareId, limit: 1000, offset: 0 }) });
    if (!response.ok) throw new ShareStoreError(`The folder could not be read (${response.status}).`, response.status);
    const rows = await response.json().catch(() => []);
    return (Array.isArray(rows) ? rows : []).map((row) => `${shareId}/${row?.name}`).filter((name) => SAFE_NAME.test(name));
  }

  /** Removes files of the bucket by name. Resolves how many it was asked to remove. */
  async function removeAll(names) {
    const prefixes = (Array.isArray(names) ? names : []).filter((name) => SAFE_NAME.test(String(name)));
    if (!prefixes.length) return 0;
    const response = await call(`object/${SHARED_BUCKET}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes }) });
    if (!response.ok) throw new ShareStoreError(`The files could not be removed (${response.status}).`, response.status);
    return prefixes.length;
  }

  return { copyUserFile, putBytes, list, removeAll };
}
