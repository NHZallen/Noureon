// What is left of an OpenCode Go plan: `GET /usage` answers { usage: { rolling, weekly, monthly: { status, percent, resetsAt } } } with the share
// (0 to 100) of each window that is used (a 5 hour window that moves, a week, a month). Only percentages: there is no amount, and no way to ask
// for the credit of the console. The service answers a browser (CORS), so the page asks it itself, with the key in the Authorization header and
// nothing else (the header of the session is not allowed there). The two addresses answer the same; the second is the way back.
// docs/superpowers/specs/2026-10-13-opencode-provider-design.md, §15.
//
// Shared by the page and tests: no `window`, no `document`, no storage.

import { createUsageCache, USAGE_CACHE_MS } from './usage-cache.js';

export const OPENCODE_USAGE_URLS = Object.freeze(['https://opencode.ai/inference/go/v1/usage', 'https://opencode.ai/zen/go/v1/usage']);
export const USAGE_WINDOWS = Object.freeze(['rolling', 'weekly', 'monthly']);

const TIMEOUT_MS = 8_000;

/** One window as { usedPercent, remainingPercent, resetsAt (ms or null), status }, or null when its percent is not a number. */
export function parseUsageWindow(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const percent = typeof raw.percent === 'number' ? raw.percent : Number.NaN;
  if (!Number.isFinite(percent)) return null;
  const used = Math.min(100, Math.max(0, percent));
  const resetsAt = typeof raw.resetsAt === 'string' || typeof raw.resetsAt === 'number' ? new Date(raw.resetsAt).getTime() : Number.NaN;
  return { usedPercent: used, remainingPercent: 100 - used, resetsAt: Number.isFinite(resetsAt) ? resetsAt : null, status: typeof raw.status === 'string' ? raw.status : '' };
}

/** The windows the answer holds ({ rolling, weekly, monthly }, each parsed), or null when it holds none. */
export function parseUsage(body) {
  const usage = body && typeof body === 'object' ? body.usage : null;
  if (!usage || typeof usage !== 'object') return null;
  const windows = {};
  for (const name of USAGE_WINDOWS) {
    const parsed = parseUsageWindow(usage[name]);
    if (parsed) windows[name] = parsed;
  }
  return Object.keys(windows).length ? windows : null;
}

/**
 * The reader of the usage. `get(key)` gives { ok: true, windows, fetchedAt, stale } or { ok: false, reason }, where reason is `no-key`,
 * `invalid-key` (401), `no-plan` (403) or `unavailable` (anything else: the last answer for the same key is kept and given, marked stale).
 * The way the answer is kept (a minute, for one key; a second ask waits; a tap; the last answer when the service is silent) is usage-cache.js.
 */
export function createOpencodeUsage({ fetchImpl = (...args) => globalThis.fetch(...args), now = () => Date.now(), urls = OPENCODE_USAGE_URLS, cacheMs = USAGE_CACHE_MS, timeoutMs = TIMEOUT_MS } = {}) {
  const ask = async (key) => {
    for (const url of urls) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${key}` }, signal: controller.signal });
        // The key is wrong or there is no plan: the other address says the same.
        if (response.status === 401) return { ok: false, reason: 'invalid-key' };
        if (response.status === 403) return { ok: false, reason: 'no-plan' };
        if (!response.ok) continue;
        const windows = parseUsage(await response.json());
        if (windows) return { ok: true, windows, fetchedAt: now(), stale: false };
      } catch {
        // The network, the time, an answer that is not JSON: try the next address.
      } finally {
        clearTimeout(timer);
      }
    }
    return { ok: false, reason: 'unavailable' };
  };
  return createUsageCache({ ask, now, cacheMs });
}
