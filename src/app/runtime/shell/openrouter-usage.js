// What is left of the spending limit of an OpenRouter key: `GET https://openrouter.ai/api/v1/key` (with the key itself, a normal one) answers
// { data: { limit, limit_remaining, limit_reset, usage, usage_daily, usage_weekly, usage_monthly, ... } } about THAT key. `limit` is the cap the person set for the
// key in OpenRouter (null when there is none) and `limit_remaining` what is left of it. The credit of the account is `GET /credits`, which only a management key can
// ask: not used here, so a key with no limit has nothing to show and the answer says `no-limit` (Allen's decision, 2026-10-27: no ring then).
// The page asks the service itself (it answers a browser, as it does for the chat), with the key in the Authorization header and nothing else.
//
// Shared by the page and tests: no `window`, no `document`, no storage.

import { createUsageCache, USAGE_CACHE_MS } from './usage-cache.js';

export const OPENROUTER_KEY_URL = 'https://openrouter.ai/api/v1/key';
const TIMEOUT_MS = 8_000;
const RESET_KINDS = Object.freeze(['daily', 'weekly', 'monthly']);

const money = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/**
 * The limit of the key as { limit, remaining, usedPercent, remainingPercent, resetKind ('daily', 'weekly', 'monthly' or ''), spent: { total, daily, weekly,
 * monthly } (each a number or null) }, or null when the answer holds no limit (a key with none, or an answer that is not what was asked for).
 */
export function parseKeyLimit(body) {
  const data = body && typeof body === 'object' ? body.data : null;
  if (!data || typeof data !== 'object') return null;
  const limit = money(data.limit);
  const remaining = money(data.limit_remaining);
  if (limit === null || remaining === null || limit <= 0) return null;
  const left = Math.min(limit, Math.max(0, remaining));
  const remainingPercent = (left / limit) * 100;
  return {
    limit,
    remaining: left,
    usedPercent: 100 - remainingPercent,
    remainingPercent,
    resetKind: RESET_KINDS.includes(data.limit_reset) ? data.limit_reset : '',
    spent: { total: money(data.usage), daily: money(data.usage_daily), weekly: money(data.usage_weekly), monthly: money(data.usage_monthly) }
  };
}

/** The reader: `get(key)` gives { ok: true, ...limit, fetchedAt, stale } or { ok: false, reason }, reason `no-key`, `invalid-key` (401), `no-limit` or `unavailable`. */
export function createOpenrouterUsage({ fetchImpl = (...args) => globalThis.fetch(...args), now = () => Date.now(), url = OPENROUTER_KEY_URL, cacheMs = USAGE_CACHE_MS, timeoutMs = TIMEOUT_MS } = {}) {
  const ask = async (key) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${key}` }, signal: controller.signal });
      if (response.status === 401) return { ok: false, reason: 'invalid-key' };
      if (!response.ok) return { ok: false, reason: 'unavailable' };
      const limit = parseKeyLimit(await response.json());
      return limit ? { ok: true, ...limit, fetchedAt: now(), stale: false } : { ok: false, reason: 'no-limit' };
    } catch {
      // The network, the time, an answer that is not JSON.
      return { ok: false, reason: 'unavailable' };
    } finally {
      clearTimeout(timer);
    }
  };
  return createUsageCache({ ask, now, cacheMs });
}
