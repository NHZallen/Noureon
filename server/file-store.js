// Where the files a reply makes are kept: the person's own space in the cloud storage the app already uses for attachments
// (bucket `user-assets`, folder = the person's id, file name = the SHA-256 of the bytes). The reply message then holds the marker the
// app's own sync writes for such a file, so the app reads it back like any file it saved itself (src/app/sync/cloud-assets.js).

import { createHash } from 'node:crypto';

export const ASSET_BUCKET = 'user-assets';
const ASSET_MARKER = '__astraCloudAsset';

const encodePath = (path) => path.split('/').map((segment) => encodeURIComponent(segment)).join('/');

export class FileStoreError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = 'FileStoreError';
    this.status = status;
  }
}

export function createFileStore({ url, serviceKey, fetchImpl = fetch, timeoutMs = 120_000 }) {
  /**
   * Keeps the bytes as the person's file. Resolves the marker to put where the file's data goes ({ __astraCloudAsset: { path, mimeType,
   * encoding } }). The same bytes are kept once.
   */
  async function save({ userId, bytes, mimeType = 'application/octet-stream' }) {
    const hash = createHash('sha256').update(bytes).digest('hex');
    const path = `${userId}/${hash}`;
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
    return { [ASSET_MARKER]: { path, mimeType, encoding: 'base64' } };
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

  return { save, load };
}
