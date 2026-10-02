import { ICON_BYTES, PAGE_BYTES, TIMEOUT_MS, attributes, cleanHost, fetchPublic, isPrivateAddress, siteIconDeps } from './_site-fetch.js';

// A site's small icon, found by this server instead of the visitor's browser: many sites keep it in a <link> tag of
// their page and have no /favicon.ico, and some refuse to hand it to another site. The visitor's address and the sites
// they looked at stay between the visitor and this server; no third party's icon service is asked.

export { cleanHost, isPrivateAddress, siteIconDeps };

const MAX_CANDIDATES = 4;

const sizeOf = (sizes) => {
  const first = String(sizes || '').match(/(\d+)x\d+/i);
  return first ? Number(first[1]) : 0;
};

/** The icons a page names, best first: those near 32 pixels (the icon is drawn small), then touch icons. */
export function iconLinks(html, base) {
  const links = [];
  for (const tag of String(html || '').match(/<link\b[^>]*>/gi) || []) {
    const found = attributes(tag);
    const rel = String(found.rel || '').toLowerCase().split(/\s+/);
    const touch = rel.includes('apple-touch-icon') || rel.includes('apple-touch-icon-precomposed');
    if ((!rel.includes('icon') && !touch) || !found.href || /^data:/i.test(found.href)) continue;
    let url = '';
    try {
      url = new URL(found.href, base).href;
    } catch {
      continue;
    }
    const size = sizeOf(found.sizes);
    // 0 is "any size" (or unsaid): good enough. Closer to 32 is better; touch icons are big, so they come after.
    const distance = size ? Math.abs(size - 32) : 8;
    links.push({ url, rank: (touch ? 1000 : 0) + distance });
  }
  return links.sort((a, b) => a.rank - b.rank).map((link) => link.url);
}

/** What the bytes are, whatever the site called them (many send an icon as text/plain), or '' when it is not a picture. */
export function sniffImage(bytes) {
  const b = bytes;
  if (!b || b.length < 4) return '';
  if (b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) return 'image/x-icon';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (b.length > 12 && b.toString('ascii', 4, 8) === 'ftyp' && /avif|avis/.test(b.toString('ascii', 8, 12))) return 'image/avif';
  const head = b.toString('utf8', 0, 512).trimStart();
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)?(<!doctype svg[^>]*>\s*)?<svg\b/i.test(head)) return 'image/svg+xml';
  return '';
}

async function findIcon(host, overall) {
  // Each request has its own share of the time, so one slow answer does not use it all.
  const share = () => AbortSignal.any([overall, AbortSignal.timeout(TIMEOUT_MS)]);
  const candidates = [];
  try {
    const page = await fetchPublic(`https://${host}/`, { accept: 'text/html,application/xhtml+xml', maxBytes: PAGE_BYTES, signal: share() });
    candidates.push(...iconLinks(page.bytes.toString('utf8'), page.url));
  } catch {
    // The page may not answer to a server; its /favicon.ico still might.
  }
  candidates.push(`https://${host}/favicon.ico`);
  for (const url of [...new Set(candidates)].slice(0, MAX_CANDIDATES)) {
    try {
      const icon = await fetchPublic(url, { accept: 'image/*,*/*;q=0.5', maxBytes: ICON_BYTES, signal: share() });
      const type = sniffImage(icon.bytes);
      if (type) return { bytes: icon.bytes, type };
    } catch {
      // Next one.
    }
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const requested = req.query?.host ?? new URL(req.url, 'https://noureon.com').searchParams.get('host');
  const host = cleanHost(Array.isArray(requested) ? requested[0] : requested);
  if (!host) {
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.status(400).json({ error: 'A site name is needed' });
    return;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS * 2);
  try {
    const icon = await findIcon(host, controller.signal);
    if (!icon) {
      // A site without an icon is asked again tomorrow, not on every message.
      res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
      res.status(404).end();
      return;
    }
    res.setHeader('Content-Type', icon.type);
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // An icon is only ever drawn as a picture; opened by itself it can run nothing.
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    res.status(200).end(req.method === 'HEAD' ? undefined : icon.bytes);
  } catch {
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.status(502).end();
  } finally {
    clearTimeout(timer);
  }
}
