export const config = {
  api: {
    bodyParser: {
      sizeLimit: '2mb'
    }
  }
};

const TAVILY_SEARCH_URL = 'https://api.tavily.com/search';

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

  try {
    const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
    const upstream = await fetch(TAVILY_SEARCH_URL, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json'
      },
      body
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
