import assert from 'node:assert/strict';
import test from 'node:test';

import handler from '../api/google-form-submit.js';

const createResponse = () => {
  const response = {
    headers: new Map(),
    statusCode: null,
    body: null,
    setHeader(key, value) {
      this.headers.set(key.toLowerCase(), value);
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.body = JSON.stringify(value);
      return this;
    },
    end(value = '') {
      this.body = value;
      return this;
    }
  };
  return response;
};

test('google form proxy forwards POST bodies to Apps Script server-side', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return {
      status: 200,
      headers: { get: () => 'text/plain; charset=utf-8' },
      text: async () => 'ok'
    };
  };
  const res = createResponse();

  try {
    await handler({ method: 'POST', body: { formType: 'feedback', message: 'hello' }, headers: {} }, res);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(res.statusCode, 200);
  assert.equal(res.body, 'ok');
  assert.match(calls[0].url, /^https:\/\/script\.google\.com\/macros\/s\//);
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers['Content-Type'], 'text/plain;charset=utf-8');
  assert.equal(calls[0].options.body, JSON.stringify({ formType: 'feedback', message: 'hello' }));
});

test('google form proxy preserves upstream errors as readable same-origin responses', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    status: 403,
    headers: { get: () => 'text/plain' },
    text: async () => 'forbidden'
  });
  const res = createResponse();

  try {
    await handler({ method: 'POST', body: '{"message":"blocked"}', headers: {} }, res);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(res.statusCode, 403);
  assert.equal(res.body, 'forbidden');
  assert.equal(res.headers.get('cache-control'), 'no-store');
});

test('google form proxy rejects non-POST methods', async () => {
  const res = createResponse();

  await handler({ method: 'GET', headers: {} }, res);

  assert.equal(res.statusCode, 405);
  assert.match(res.body, /Method not allowed/);
});
