import {
  applyProxyResponseHeaders,
  authenticateProxyUser,
  createProxyRequestContext,
  parseRequestBody,
  readProviderAuthorization,
  requireJsonRequest,
  recordProxyEvent,
  sendProxyError,
  validateTavilyProxyBody
} from './_proxy-security.js';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '64kb'
    }
  }
};

const TAVILY_SEARCH_URL = 'https://api.tavily.com/search';

export default async function handler(req, res) {
  applyProxyResponseHeaders(res);
  const requestContext = createProxyRequestContext(res, 'tavily-search');
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
    const body = JSON.stringify(validateTavilyProxyBody(parseRequestBody(req, 64 * 1024)));
    const user = await authenticateProxyUser(req);
    requestContext.userId = user.id;
    const upstream = await fetch(TAVILY_SEARCH_URL, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json'
      },
      body,
      signal: AbortSignal.timeout(30_000)
    });

    if (!upstream.ok) {
      res.status(upstream.status).json({ error: 'Tavily upstream request failed', code: 'UPSTREAM_REJECTED' });
      recordProxyEvent(requestContext, { status: upstream.status, outcome: 'upstream_rejected', userId: user.id });
      return;
    }

    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json; charset=utf-8');
    res.end(text);
    recordProxyEvent(requestContext, { status: upstream.status, outcome: 'success' });
  } catch (error) {
    const status = sendProxyError(res, error, 'Tavily proxy request failed');
    recordProxyEvent(requestContext, { status, outcome: 'failed' });
  }
}
