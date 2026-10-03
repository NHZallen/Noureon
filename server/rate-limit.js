// A person may start so many things in a window: a plain count per key in a sliding window, kept in memory (it only has to be right while
// the server is up).

export function createRateLimiter({ limit, windowMs, now = Date.now }) {
  const hits = new Map();
  return {
    /** True when this one is allowed (and counted). */
    take(key) {
      const time = now();
      const recent = (hits.get(key) || []).filter((at) => time - at < windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return false;
      }
      recent.push(time);
      hits.set(key, recent);
      if (hits.size > 5000) for (const [name, list] of hits) if (!list.some((at) => time - at < windowMs)) hits.delete(name);
      return true;
    }
  };
}
