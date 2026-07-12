import assert from 'node:assert/strict';
import test from 'node:test';

import nvidiaHandler, { config as nvidiaConfig } from '../api/nvidia-chat.js';
import tavilyHandler, { config as tavilyConfig } from '../api/tavily-search.js';
import {
  authenticateProxyUser,
  createProxyRequestContext,
  parseRequestBody,
  readProviderAuthorization,
  requireJsonRequest,
  recordProxyEvent,
  validateChatProxyBody,
  validateTavilyProxyBody
} from '../api/_proxy-security.js';

function createResponse() {
  return {
    headers: {},
    statusCode: 200,
    body: undefined,
    chunks: [],
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
    write(value) {
      this.chunks.push(Buffer.from(value).toString('utf8'));
    },
    end(value) {
      if (value != null) this.body = value;
    },
    flushHeaders() {}
  };
}

const jsonRequest = (body, headers = {}) => ({
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    authorization: 'Bearer provider-key',
    'x-noureon-authorization': 'Bearer supabase-session-token',
    'x-forwarded-for': '203.0.113.10',
    ...headers
  },
  body
});

test('proxy boundary requires JSON, bounded bodies, and Bearer authorization', () => {
  assert.throws(
    () => requireJsonRequest({ headers: { 'content-type': 'text/plain' } }),
    (error) => error.status === 415
  );
  assert.throws(
    () => readProviderAuthorization({ headers: { authorization: 'provider-key' } }),
    (error) => error.status === 401
  );
  assert.throws(
    () => parseRequestBody({ body: `{"value":"${'x'.repeat(100)}"}` }, 32),
    (error) => error.status === 413
  );
});

test('proxy authentication validates the Noureon session without forwarding provider credentials', async () => {
  const calls = [];
  const user = await authenticateProxyUser(jsonRequest({}), {
    env: { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'publishable-key' },
    fetchImpl: async (url, options) => {
      calls.push([url, options]);
      return new Response(JSON.stringify({ id: 'user-1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
  });

  assert.deepEqual(user, { id: 'user-1' });
  assert.equal(calls[0][1].headers.Authorization, 'Bearer supabase-session-token');
  assert.equal(JSON.stringify(calls[0][1].headers).includes('provider-key'), false);
  await assert.rejects(
    authenticateProxyUser(jsonRequest({}, { 'x-noureon-authorization': '' }), {
      env: { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'key' },
      fetchImpl: async () => new Response()
    }),
    (error) => error.status === 401 && error.code === 'NOUREON_AUTH_REQUIRED'
  );
});

test('proxy event records contain only request metadata and a shortened user hash', () => {
  const logs = [];
  const res = createResponse();
  let currentTime = 1_000;
  const context = createProxyRequestContext(res, 'nvidia-chat', {
    requestId: 'request-1',
    now: () => currentTime,
    logger: { info: (value) => logs.push(JSON.parse(value)) }
  });
  context.userId = 'private-user-id';
  currentTime = 1_125;
  recordProxyEvent(context, { status: 200, outcome: 'success' });
  recordProxyEvent(context, { status: 500, outcome: 'duplicate' });

  assert.equal(res.headers['X-Request-ID'], 'request-1');
  assert.equal(logs.length, 1);
  assert.deepEqual(Object.keys(logs[0]).sort(), [
    'durationMs', 'event', 'outcome', 'requestId', 'route', 'status', 'userHash'
  ]);
  assert.equal(logs[0].durationMs, 125);
  assert.equal(logs[0].userHash.length, 16);
  assert.equal(JSON.stringify(logs[0]).includes('private-user-id'), false);
});

test('chat schema accepts the current frontend contract and rejects unknown or unsafe fields', () => {
  const body = validateChatProxyBody({
    model: 'nvidia/model-1',
    messages: [{ role: 'user', content: 'Hello' }],
    stream: true,
    temperature: 0.7,
    top_p: 0.9,
    max_tokens: 1024,
    reasoning_effort: 'medium'
  });
  assert.equal(body.model, 'nvidia/model-1');
  assert.equal(body.messages[0].content, 'Hello');

  assert.throws(() => validateChatProxyBody({
    model: 'model', messages: [{ role: 'user', content: 'Hi' }], tools: []
  }), (error) => error.code === 'UNKNOWN_FIELD');
  assert.throws(() => validateChatProxyBody({
    model: 'model', messages: [{ role: 'admin', content: 'Hi' }]
  }), /role is not allowed/);
  assert.throws(() => validateChatProxyBody({
    model: 'model',
    messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'file:///etc/passwd' } }] }]
  }), (error) => error.code === 'URL_SCHEME_NOT_ALLOWED');
});

test('Tavily schema normalizes bounded options and rejects unknown fields', () => {
  assert.deepEqual(validateTavilyProxyBody({ query: ' latest facts ', max_results: 3 }), {
    query: 'latest facts',
    search_depth: 'basic',
    max_results: 3,
    topic: 'general',
    include_answer: false,
    include_raw_content: false,
    include_images: false,
    include_usage: false
  });
  assert.throws(
    () => validateTavilyProxyBody({ query: 'facts', include_domains: ['example.com'] }),
    (error) => error.code === 'UNKNOWN_FIELD'
  );
});

test('proxy body parser limits are reduced from the previous broad defaults', () => {
  assert.equal(nvidiaConfig.api.bodyParser.sizeLimit, '1mb');
  assert.equal(tavilyConfig.api.bodyParser.sizeLimit, '64kb');
});

test('NVIDIA proxy rejects invalid requests without contacting upstream', async () => {
  const originalFetch = globalThis.fetch;
  let fetched = false;
  globalThis.fetch = async () => {
    fetched = true;
    return new Response();
  };
  try {
    const res = createResponse();
    await nvidiaHandler(jsonRequest({ model: 'model', messages: [], unknown: true }), res);

    assert.equal(fetched, false);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.code, 'UNKNOWN_FIELD');
    assert.equal(res.headers['Cache-Control'], 'no-store');
    assert.equal(res.headers['X-Content-Type-Options'], 'nosniff');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Tavily proxy forwards normalized requests and redacts upstream error bodies', async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push([url, options]);
    if (String(url).endsWith('/auth/v1/user')) {
      return new Response(JSON.stringify({ id: 'user-1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    return new Response('provider-secret-in-error', { status: 429, headers: { 'content-type': 'text/plain' } });
  };
  process.env.SUPABASE_URL = 'https://project.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'publishable-key';
  try {
    const res = createResponse();
    await tavilyHandler(jsonRequest({ query: 'facts', max_results: 2 }), res);

    assert.equal(res.statusCode, 429);
    assert.equal(res.body.error, 'Tavily upstream request failed');
    assert.equal(JSON.stringify(res.body).includes('provider-secret'), false);
    assert.deepEqual(JSON.parse(requests[1][1].body), {
      query: 'facts',
      search_depth: 'basic',
      max_results: 2,
      topic: 'general',
      include_answer: false,
      include_raw_content: false,
      include_images: false,
      include_usage: false
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl == null) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey == null) delete process.env.SUPABASE_PUBLISHABLE_KEY;
    else process.env.SUPABASE_PUBLISHABLE_KEY = originalKey;
  }
});
