// The way a usage reader keeps what a service says about a key (opencode-usage.js, openrouter-usage.js): one answer, for one key (a person has one), for a
// minute; a second ask while one is running waits for it; a tap (`force`) goes through at most every few seconds; when the service does not answer, the last answer
// for the same key is given again, marked `stale`. `ask(key)` resolves { ok: true, ... } or { ok: false, reason }, where the reason `unavailable` is the one that
// keeps an older answer. Another key never gets the answer kept for the first.
//
// Shared by the page and tests: no `window`, no `document`, no storage.

export const USAGE_CACHE_MS = 60_000;
// A refresh the person asks for (a tap) is let through at most this often.
const FORCE_MIN_MS = 5_000;

export function createUsageCache({ ask, now = () => Date.now(), cacheMs = USAGE_CACHE_MS }) {
  let kept = null; // { key, at, result }
  let running = null; // { key, promise }
  let lastForced = 0;

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
