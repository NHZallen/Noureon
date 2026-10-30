// Asking the server to build the memory from the past conversations (server/memory-rebuild.js), so that it goes on when this page is closed. The key of the model that reads goes with the
// request and nowhere else; the server keeps it only until the job ends. Every function resolves { ok, ... } and never throws.

import { serverRequest } from '../cli/cli-server-bridge.js';

const failure = (result) => ({ ok: false, code: result.code || `http-${result.status}`, reason: result.data?.error?.reason || '' });

/** Starts the job: `modelId` (the model that reads) and `key` (its provider's). Resolves { ok: true } or { ok: false, reason: 'already_running' | 'memory_off' | ... }. */
export async function startServerRebuild({ modelId, key, language }) {
  const result = await serverRequest('POST', '/v1/memory/rebuild', { body: JSON.stringify({ modelId, key, language }) });
  return result.ok ? { ok: true } : failure(result);
}

export async function stopServerRebuild() {
  const result = await serverRequest('POST', '/v1/memory/rebuild/stop', { body: '{}' });
  return result.ok ? { ok: true, stopped: result.data?.stopped === true } : failure(result);
}
