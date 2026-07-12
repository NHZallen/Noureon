import {
  applyProxyResponseHeaders,
  authenticateProxyUser,
  createProxyRequestContext,
  parseRequestBody,
  readProviderAuthorization,
  requireJsonRequest,
  recordProxyEvent,
  sendProxyError,
  validateChatProxyBody
} from './_proxy-security.js';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb'
    },
    responseLimit: false
  }
};

const STEP_PLAN_CHAT_COMPLETIONS_URL = 'https://api.stepfun.com/v1/chat/completions';

export default async function handler(req, res) {
  applyProxyResponseHeaders(res);
  const requestContext = createProxyRequestContext(res, 'step-plan-chat');
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type, x-noureon-authorization');
    res.status(204).end();
    recordProxyEvent(requestContext, { status: 204, outcome: 'preflight' });
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    res.status(405).json({ error: 'Method not allowed' });
    recordProxyEvent(requestContext, { status: 405, outcome: 'method_rejected' });
    return;
  }

  try {
    requireJsonRequest(req);
    const authorization = readProviderAuthorization(req);
    const body = JSON.stringify(validateChatProxyBody(parseRequestBody(req, 1024 * 1024)));
    const user = await authenticateProxyUser(req);
    requestContext.userId = user.id;
    const upstream = await fetch(STEP_PLAN_CHAT_COMPLETIONS_URL, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream'
      },
      body,
      signal: AbortSignal.timeout(120_000)
    });

    if (!upstream.ok) {
      res.status(upstream.status).json({ error: 'Step Plan upstream request failed', code: 'UPSTREAM_REJECTED' });
      recordProxyEvent(requestContext, { status: upstream.status, outcome: 'upstream_rejected', userId: user.id });
      return;
    }

    res.status(upstream.status);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'text/event-stream; charset=utf-8');
    res.setHeader('X-Accel-Buffering', 'no');

    if (!upstream.body) {
      res.end(await upstream.text());
      recordProxyEvent(requestContext, { status: upstream.status, outcome: 'success' });
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
    recordProxyEvent(requestContext, { status: upstream.status, outcome: 'success' });
  } catch (error) {
    const status = sendProxyError(res, error, 'Step Plan proxy request failed');
    recordProxyEvent(requestContext, { status, outcome: 'failed' });
  }
}
