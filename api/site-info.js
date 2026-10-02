import { PAGE_BYTES, TIMEOUT_MS, attributes, cleanHost, fetchPublic } from './_site-fetch.js';

// The names sites give themselves ("Vercel", "Supabase"), for the small labels beside a citation. A site says its name in
// its page (og:site_name, application-name); the page is read here, by this server, so the sites a visitor looked at
// stay between the visitor and this server. A site that says nothing has no name here, and the label uses its address.

const MAX_HOSTS = 12;
const MAX_NAME_CHARS = 40;

const decode = (value) => String(value || '')
  .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#0*39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
  .replace(/&#(\d+);/g, (match, code) => { const number = Number(code); return number > 31 && number < 65536 ? String.fromCharCode(number) : ''; });

const clean = (value) => decode(value).replace(/\s+/g, ' ').trim();

/** The name a page gives its site, '' when it gives none (or one that is not a name: too long, or an address). */
export function siteNameOf(html) {
  const wanted = ['og:site_name', 'application-name', 'apple-mobile-web-app-title'];
  const found = {};
  for (const tag of String(html || '').match(/<meta\b[^>]*>/gi) || []) {
    const meta = attributes(tag);
    const key = String(meta.property || meta.name || '').toLowerCase();
    if (wanted.includes(key) && meta.content && !found[key]) found[key] = clean(meta.content);
  }
  for (const key of wanted) {
    const name = found[key];
    if (name && name.length <= MAX_NAME_CHARS && !/^https?:\/\//i.test(name) && !/[<>]/.test(name)) return name;
  }
  return '';
}

async function nameOf(host, overall) {
  try {
    const page = await fetchPublic(`https://${host}/`, { accept: 'text/html,application/xhtml+xml', maxBytes: PAGE_BYTES, signal: AbortSignal.any([overall, AbortSignal.timeout(TIMEOUT_MS)]) });
    return siteNameOf(page.bytes.toString('utf8'));
  } catch {
    return '';
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const requested = req.query?.hosts ?? new URL(req.url, 'https://noureon.com').searchParams.get('hosts');
  const hosts = [...new Set(String(Array.isArray(requested) ? requested[0] : requested || '').split(',').map(cleanHost).filter(Boolean))].slice(0, MAX_HOSTS);
  if (hosts.length === 0) {
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.status(400).json({ error: 'Site names are needed' });
    return;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS * 2);
  try {
    const names = {};
    await Promise.all(hosts.map(async (host) => {
      const name = await nameOf(host, controller.signal);
      if (name) names[host] = name;
    }));
    // A name does not change: kept for a week. A site that gave none is asked again tomorrow.
    res.setHeader('Cache-Control', Object.keys(names).length === hosts.length
      ? 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400'
      : 'public, max-age=3600, s-maxage=86400');
    res.status(200).json({ names });
  } finally {
    clearTimeout(timer);
  }
}
