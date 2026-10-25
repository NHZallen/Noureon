// The way a native connector (one that Noureon's server speaks to by itself, as a service's own API, not through an MCP server of the service) calls the service: the
// token goes only in the Authorization header, only to the hosts the provider names, and what comes back is read in bounds. A refusal that is about this one call (a bad
// input, a missing permission, a quota) is a `ToolFailure`, which the model reads as the result of the tool; a login that the service does not accept is an `McpError`
// ('unauthorized'), as with any connector, so that the person is asked to log in again.

import { McpError } from '../client.js';

const MAX_BODY_BYTES = 4 * 1024 * 1024;
export const DEFAULT_API_TIMEOUT_MS = 60_000;

/** A call that the service refused or that cannot be made as asked: its words are the result of the tool (never thrown past the client). */
export class ToolFailure extends Error {
  constructor(message) {
    super(message);
    this.name = 'ToolFailure';
  }
}

async function readCapped(response) {
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) {
    await response.body?.cancel?.().catch(() => {});
    throw new ToolFailure('The answer is too large to read.');
  }
  const text = await response.text();
  if (text.length > MAX_BODY_BYTES) throw new ToolFailure('The answer is too large to read.');
  return text;
}

/**
 * `hosts`: the only hosts the token may go to; `getToken()` gives the access token; `onUnauthorized()` may give a new one (or null); `explain(status, text)` says in a few
 * plain words why the service refused (its own shape of error). Returns `call(method, url, { query, json, body, headers, as })`: the parsed JSON (or the text with
 * `as: 'text'`, null for an empty answer). A query value that is an array is sent once for each item.
 */
export function createApi({ hosts, getToken, onUnauthorized = async () => null, fetchImpl = fetch, timeoutMs = DEFAULT_API_TIMEOUT_MS, signal = null, explain = (status) => `The service answered ${status}.` }) {
  return async function call(method, url, { query, json, body, headers = {}, as = 'json' } = {}) {
    const target = new URL(url);
    if (target.protocol !== 'https:' || !hosts.includes(target.hostname)) throw new ToolFailure('That address is not one this connector may reach.');
    for (const [key, value] of Object.entries(query || {})) {
      for (const item of Array.isArray(value) ? value : [value]) {
        if (item !== undefined && item !== null && item !== '') target.searchParams.append(key, String(item));
      }
    }
    const payload = json !== undefined ? JSON.stringify(json) : body;
    const attempt = async (token) => {
      const timer = AbortSignal.timeout(timeoutMs);
      const combined = signal ? AbortSignal.any([signal, timer]) : timer;
      try {
        return await fetchImpl(target.toString(), {
          method,
          redirect: 'error',
          signal: combined,
          headers: { authorization: `Bearer ${token}`, accept: 'application/json', ...(json !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
          ...(payload !== undefined ? { body: payload } : {})
        });
      } catch (error) {
        if (signal?.aborted) throw new McpError('timeout', 'Stopped.');
        throw new McpError(error?.name === 'TimeoutError' ? 'timeout' : 'unreachable', 'The service could not be reached.');
      }
    };
    let response = await attempt(await getToken());
    if (response.status === 401) {
      await response.body?.cancel?.().catch(() => {});
      const renewed = await onUnauthorized();
      if (!renewed) throw new McpError('unauthorized', 'The service did not accept the login.', { status: 401 });
      response = await attempt(renewed);
      if (response.status === 401) {
        await response.body?.cancel?.().catch(() => {});
        throw new McpError('unauthorized', 'The service did not accept the login.', { status: 401 });
      }
    }
    const text = await readCapped(response);
    if (!response.ok) throw new ToolFailure(explain(response.status, text));
    if (as === 'text') return text;
    if (!text.trim()) return null;
    try {
      return JSON.parse(text);
    } catch {
      throw new ToolFailure('The service answered with something that is not JSON.');
    }
  };
}
