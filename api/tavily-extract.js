export const config = {
  api: {
    bodyParser: {
      sizeLimit: '64kb'
    }
  }
};

const TAVILY_EXTRACT_URL = 'https://api.tavily.com/extract';
const MAX_URLS = 10;
const DEPTHS = new Set(['basic', 'advanced']);
const FORMATS = new Set(['markdown', 'text']);

// Tavily reads the pages itself (like tavily-search.js, this only carries the page's request, with its key, to Tavily); only
// the fields that read pages are passed on.
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

  const authorization = req.headers.authorization;
  if (!authorization) {
    res.status(401).json({ error: 'Missing Tavily Authorization header' });
    return;
  }

  const body = (typeof req.body === 'string' ? safeParse(req.body) : req.body) || {};
  const urls = [...new Set((Array.isArray(body.urls) ? body.urls : []).map((value) => String(value || '').trim()).filter(isWebAddress))].slice(0, MAX_URLS);
  if (urls.length === 0) {
    res.status(400).json({ error: 'Missing page addresses (http or https)' });
    return;
  }

  try {
    const upstream = await fetch(TAVILY_EXTRACT_URL, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        urls,
        extract_depth: DEPTHS.has(body.extract_depth) ? body.extract_depth : 'basic',
        format: FORMATS.has(body.format) ? body.format : 'markdown',
        include_images: false
      })
    });

    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json; charset=utf-8');
    res.end(text);
  } catch (error) {
    res.status(502).json({
      error: 'Tavily proxy request failed',
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
