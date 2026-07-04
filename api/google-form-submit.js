export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb'
    }
  }
};

export const getGoogleFormEndpoint = () => process.env.GOOGLE_FORM_ENDPOINT?.trim() || '';
export const getTurnstileSecret = () => process.env.TURNSTILE_SECRET_KEY?.trim() || '';

const parseRequestBody = (body) => {
  if (typeof body === 'string') return JSON.parse(body || '{}');
  return body && typeof body === 'object' ? { ...body } : {};
};

export async function verifyTurnstileToken({ token, secret, remoteIp, fetchImpl = fetch }) {
  const form = new URLSearchParams({ secret, response: token });
  if (remoteIp) form.set('remoteip', remoteIp);

  const response = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString()
  });

  if (!response.ok) {
    throw new Error(`Turnstile verification failed with HTTP ${response.status}`);
  }
  return response.json();
}

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
    const parsedBody = parseRequestBody(req.body);
    const turnstileSecret = getTurnstileSecret();
    if (!turnstileSecret && process.env.NODE_ENV === 'production') {
      res.status(503).json({ error: 'Turnstile verification is not configured' });
      return;
    }

    if (turnstileSecret) {
      const token = typeof parsedBody.turnstileToken === 'string' ? parsedBody.turnstileToken.trim() : '';
      if (!token) {
        res.status(400).json({ error: 'Turnstile token is required' });
        return;
      }

      const forwardedFor = req.headers?.['x-forwarded-for'];
      const remoteIp = Array.isArray(forwardedFor)
        ? forwardedFor[0]
        : String(forwardedFor || '').split(',')[0].trim();
      const verification = await verifyTurnstileToken({
        token,
        secret: turnstileSecret,
        remoteIp
      });
      if (!verification?.success) {
        res.status(403).json({
          error: 'Turnstile verification failed',
          codes: verification?.['error-codes'] || []
        });
        return;
      }
    }

    delete parsedBody.turnstileToken;
    const body = JSON.stringify(parsedBody);
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
