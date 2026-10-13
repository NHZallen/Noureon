// OpenCode Go's chat, for the browser: the service does not answer a browser's cross-site request (no CORS headers), so the page sends it here
// (same site) and this function sends it on. Three forms of API (`?format=chat|responses|messages`), one path each at OpenCode. The key
// comes in the Authorization header, as for the NVIDIA function, and is only passed on. What the service wants of a client is added here: its own
// User-Agent, and the id of the conversation as `x-opencode-session` (when the page gives one).
// docs/superpowers/specs/2026-10-13-opencode-provider-design.md, §3.

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '25mb'
    },
    responseLimit: false
  }
};

const BASE_URL = 'https://opencode.ai/inference/go/v1';
const PATHS = { chat: '/chat/completions', responses: '/responses', messages: '/messages' };
const USER_AGENT = 'Noureon/1 (+https://noureon.com)';
const SESSION_ID = /^[A-Za-z0-9._-]{1,100}$/;

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type, x-opencode-session');
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const path = PATHS[String(req.query?.format || 'chat')];
  if (!path) {
    res.status(400).json({ error: 'Unknown format' });
    return;
  }

  const authorization = req.headers.authorization;
  if (!authorization) {
    res.status(401).json({ error: 'Missing OpenCode Authorization header' });
    return;
  }
  const session = String(req.headers['x-opencode-session'] || '');

  // The page closing the connection stops what is asked of the service too.
  const controller = new AbortController();
  res.on('close', () => { if (!res.writableEnded) controller.abort(); });

  try {
    const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
    const upstream = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        'User-Agent': USER_AGENT,
        ...(SESSION_ID.test(session) ? { 'x-opencode-session': session } : {})
      },
      body,
      signal: controller.signal
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
    if (controller.signal.aborted) return;
    res.status(502).json({
      error: 'OpenCode proxy request failed',
      detail: error?.message || 'Unknown error'
    });
  }
}
