export const config = {
  api: {
    bodyParser: {
      sizeLimit: '25mb'
    },
    responseLimit: false
  }
};

const STEP_PLAN_CHAT_COMPLETIONS_URL = 'https://api.stepfun.com/step_plan/v1/chat/completions';

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
    const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
    const upstream = await fetch(STEP_PLAN_CHAT_COMPLETIONS_URL, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream'
      },
      body
    });

    res.status(upstream.status);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'text/event-stream; charset=utf-8');
    res.setHeader('X-Accel-Buffering', 'no');

    if (!upstream.body) {
      res.end(await upstream.text());
      return;
    }

    res.flushHeaders?.();
    const reader = upstream.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  } catch (error) {
    res.status(502).json({
      error: 'Step Plan proxy request failed',
      detail: error?.message || 'Unknown error'
    });
  }
}
