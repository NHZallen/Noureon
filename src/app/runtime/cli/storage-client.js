// How much of the person's space in the cloud (500 MB: attachments and the files a reply made) is used, as the server counts it.

import { serverRequest } from './cli-server-bridge.js';

/** { ok, usedBytes (a number, or null when the server cannot tell), quotaBytes } or { ok: false, code }. Never throws. */
export async function getStorageUsage() {
  const result = await serverRequest('GET', '/v1/storage');
  if (!result.ok) return { ok: false, code: result.code || `http-${result.status}` };
  const used = Number(result.data?.usedBytes);
  const quota = Number(result.data?.quotaBytes);
  return { ok: true, usedBytes: result.data?.usedBytes === null || !Number.isFinite(used) ? null : used, quotaBytes: Number.isFinite(quota) && quota > 0 ? quota : 500 * 1024 * 1024 };
}

/** "12.3 MB", "480 KB", "0 B": decimal places only where they help. */
export function formatBytes(bytes) {
  const value = Math.max(0, Number(bytes) || 0);
  if (value >= 1024 * 1024) {
    const mb = value / (1024 * 1024);
    return `${mb >= 100 ? Math.round(mb) : Math.round(mb * 10) / 10} MB`;
  }
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
}
