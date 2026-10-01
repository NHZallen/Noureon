export const config = {
  api: {
    bodyParser: {
      sizeLimit: '64kb'
    }
  }
};

const TINYFISH_SEARCH_URL = 'https://api.search.tinyfish.ai';
// Only these are passed on: the page's request is not a way to reach anything else on TinyFish.
const SEARCH_PARAMETERS = ['query', 'domain_type', 'location', 'language', 'page', 'recency_minutes', 'after_date', 'before_date'];
const DOMAIN_TYPES = new Set(['web', 'news', 'research_paper']);

// TinyFish's search is a GET with the key in X-API-Key; the page sends the same POST with an Authorization header as it
// does for Tavily (tavily-search.js), so the key never goes in an address.
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!apiKey) {
    res.status(401).json({ error: 'Missing TinyFish Authorization header' });
    return;
  }

  const body = (typeof req.body === 'string' ? safeParse(req.body) : req.body) || {};
  const query = String(body.query || '').trim();
  if (!query) {
    res.status(400).json({ error: 'Missing search query' });
    return;
  }

  const url = new URL(TINYFISH_SEARCH_URL);
  for (const name of SEARCH_PARAMETERS) {
    const value = body[name];
    if (value === undefined || value === null || value === '') continue;
    if (name === 'domain_type' && !DOMAIN_TYPES.has(value)) continue;
    url.searchParams.set(name, String(value));
  }

  try {
    const upstream = await fetch(url, { method: 'GET', headers: { 'X-API-Key': apiKey } });
    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json; charset=utf-8');
    res.end(text);
  } catch (error) {
    res.status(502).json({
      error: 'TinyFish proxy request failed',
      detail: error?.message || 'Unknown error'
    });
  }
}

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
