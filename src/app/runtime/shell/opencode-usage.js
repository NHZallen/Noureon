// What is left of an OpenCode Go plan: `GET /usage` answers { usage: { rolling, weekly, monthly: { status, percent, resetsAt } } } with the share
// (0 to 100) of each window that is used (a 5 hour window that moves, a week, a month). Only percentages: there is no amount, and no way to ask
// for the credit of the console. The service answers a browser (CORS), so the page asks it itself, with the key in the Authorization header and
// nothing else (the header of the session is not allowed there). The two addresses answer the same; the second is the way back.
// docs/superpowers/specs/2026-10-13-opencode-provider-design.md, §15.
//
// Shared by the page and tests: no `window`, no `document`, no storage.

export const OPENCODE_USAGE_URLS = Object.freeze(['https://opencode.ai/inference/go/v1/usage', 'https://opencode.ai/zen/go/v1/usage']);
export const USAGE_WINDOWS = Object.freeze(['rolling', 'weekly', 'monthly']);

const CACHE_MS = 60_000;
const TIMEOUT_MS = 8_000;
// A refresh the person asks for (a tap) is let through at most this often.
const FORCE_MIN_MS = 5_000;

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
 * One answer is kept, for one key (a person has one), for a minute; a second ask while one is running waits for it.
 */
export function createOpencodeUsage({ fetchImpl = (...args) => globalThis.fetch(...args), now = () => Date.now(), urls = OPENCODE_USAGE_URLS, cacheMs = CACHE_MS, timeoutMs = TIMEOUT_MS } = {}) {
  let kept = null; // { key, at, result }
  let running = null; // { key, promise }
  let lastForced = 0;

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

  const get = (key, { force = false } = {}) => {
    const apiKey = String(key || '').trim();
    if (!apiKey) return Promise.resolve({ ok: false, reason: 'no-key' });
    if (kept && kept.key !== apiKey) kept = null;
    const age = kept ? now() - kept.at : Infinity;
    const allowedForce = force && now() - lastForced >= FORCE_MIN_MS;
    if (kept && age < cacheMs && !allowedForce) return Promise.resolve(kept.result);
    if (running && running.key === apiKey) return running.promise;
    if (allowedForce) lastForced = now();
    const promise = ask(apiKey).then((result) => {
      let given = result;
      if (result.ok) {
        kept = { key: apiKey, at: now(), result };
      } else if (result.reason === 'unavailable' && kept?.result?.ok) {
        // The service did not answer: the last answer is given again (marked), and asked for again in a minute.
        given = { ...kept.result, stale: true };
        kept = { key: apiKey, at: now(), result: kept.result };
      } else {
        kept = { key: apiKey, at: now(), result };
      }
      return given;
    }).finally(() => { if (running?.promise === promise) running = null; });
    running = { key: apiKey, promise };
    return promise;
  };

  const forget = () => { kept = null; };
  return { get, forget };
}
