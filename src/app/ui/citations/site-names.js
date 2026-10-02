// The names sites give themselves ("Vercel", "Supabase"), asked of this app's own server (api/site-info.js) once per site
// and kept for the session. Until a name is known, or for a site that gives none, its address is shown.

const names = new Map();
const asked = new Set();
const listeners = new Set();
const PER_REQUEST = 12;

/** The name a site gave itself, or '' when it is not known (yet). */
export const knownSiteName = (host) => names.get(host) || '';

/** `listener()` is called when names have arrived. Returns the way to stop listening. */
export function onSiteNames(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Asks for the names of the sites not asked about yet. Never throws: a site without a name just keeps its address. */
export async function loadSiteNames(hosts, { fetchImpl = (...args) => fetch(...args) } = {}) {
  const wanted = [...new Set((hosts || []).filter(Boolean))].filter((host) => !asked.has(host));
  if (wanted.length === 0) return;
  wanted.forEach((host) => asked.add(host));
  let arrived = false;
  for (let index = 0; index < wanted.length; index += PER_REQUEST) {
    const group = wanted.slice(index, index + PER_REQUEST);
    try {
      const response = await fetchImpl(`/api/site-info?hosts=${encodeURIComponent(group.join(','))}`);
      if (!response.ok) continue;
      const data = await response.json();
      for (const host of group) {
        const name = typeof data?.names?.[host] === 'string' ? data.names[host].trim() : '';
        if (name) {
          names.set(host, name);
          arrived = true;
        }
      }
    } catch {
      // The addresses stay.
    }
  }
  if (arrived) listeners.forEach((listener) => listener());
}

/** For tests: forget everything. */
export function resetSiteNames() {
  names.clear();
  asked.clear();
  listeners.clear();
}
