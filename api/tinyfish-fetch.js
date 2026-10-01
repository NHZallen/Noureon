export const config = {
  api: {
    bodyParser: {
      sizeLimit: '64kb'
    }
  }
};

const TINYFISH_FETCH_URL = 'https://api.fetch.tinyfish.ai';
// TinyFish takes at most ten addresses in one request.
const MAX_URLS = 10;
const FORMATS = new Set(['markdown', 'html', 'json']);

// TinyFish reads the pages itself, so nothing here fetches a page; this only carries the page's request to it with the key
// in X-API-Key (the page sends the same POST with an Authorization header as for Tavily, tavily-search.js).
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
  const urls = [...new Set((Array.isArray(body.urls) ? body.urls : []).map((value) => String(value || '').trim()).filter(isWebAddress))].slice(0, MAX_URLS);
  if (urls.length === 0) {
    res.status(400).json({ error: 'Missing page addresses (http or https)' });
    return;
  }

  try {
    const upstream = await fetch(TINYFISH_FETCH_URL, {
      method: 'POST',
      headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls, format: FORMATS.has(body.format) ? body.format : 'markdown' })
    });
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

function isWebAddress(value) {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
