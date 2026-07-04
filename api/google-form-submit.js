export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb'
    }
  }
};

export const getGoogleFormEndpoint = () => process.env.GOOGLE_FORM_ENDPOINT?.trim() || '';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'content-type');
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const endpoint = getGoogleFormEndpoint();
  if (!endpoint) {
    res.status(501).json({ error: 'Google form endpoint is not configured' });
    return;
  }

  try {
    const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body
    });
    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'text/plain; charset=utf-8');
    res.end(text);
  } catch (error) {
    res.status(502).json({
      error: 'Google form proxy request failed',
      detail: error?.message || 'Unknown error'
    });
  }
}
