export const config = {
  api: {
    bodyParser: false,
    responseLimit: false
  }
};

const STEP_PLAN_FILES_URL = 'https://api.stepfun.com/v1/files';

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
    res.status(401).json({ error: 'Missing Step Plan Authorization header' });
    return;
  }

  try {
    const upstream = await fetch(STEP_PLAN_FILES_URL, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Type': req.headers['content-type'] || 'multipart/form-data'
      },
      body: req,
      duplex: 'half'
    });

    res.status(upstream.status);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json; charset=utf-8');

    if (!upstream.body) {
      res.end(await upstream.text());
      return;
    }

    const reader = upstream.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  } catch (error) {
    res.status(502).json({
      error: 'Step Plan file upload failed',
      detail: error?.message || 'Unknown error'
    });
  }
}
