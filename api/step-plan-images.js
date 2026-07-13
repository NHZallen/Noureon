export const config = {
  api: {
    bodyParser: false,
    responseLimit: false
  }
};

const STEP_PLAN_IMAGE_PATHS = Object.freeze({
  generations: 'https://api.stepfun.com/step_plan/v1/images/generations',
  edits: 'https://api.stepfun.com/step_plan/v1/images/edits'
});

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

  const operation = req.query?.operation;
  const endpoint = STEP_PLAN_IMAGE_PATHS[operation];
  if (!endpoint) {
    res.status(400).json({ error: 'Unsupported Step Plan image operation' });
    return;
  }

  try {
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        ...(req.headers['content-type'] ? { 'Content-Type': req.headers['content-type'] } : {}),
        Accept: 'application/json'
      },
      body: req,
      duplex: 'half'
    });
    const body = await upstream.arrayBuffer();
    res.status(upstream.status);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json; charset=utf-8');
    res.end(Buffer.from(body));
  } catch (error) {
    res.status(502).json({
      error: 'Step Plan image proxy request failed',
      detail: error?.message || 'Unknown error'
    });
  }
}
