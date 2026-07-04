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
  const originalEndpoint = process.env.GOOGLE_FORM_ENDPOINT;
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
    process.env.GOOGLE_FORM_ENDPOINT = 'https://forms.example.test/submit';
    await handler({ method: 'POST', body: { formType: 'feedback', message: 'hello' }, headers: {} }, res);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalEndpoint === undefined) {
      delete process.env.GOOGLE_FORM_ENDPOINT;
    } else {
      process.env.GOOGLE_FORM_ENDPOINT = originalEndpoint;
    }
  }

  assert.equal(res.statusCode, 200);
  assert.equal(res.body, 'ok');
  assert.equal(calls[0].url, 'https://forms.example.test/submit');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers['Content-Type'], 'text/plain;charset=utf-8');
  assert.equal(calls[0].options.body, JSON.stringify({ formType: 'feedback', message: 'hello' }));
});

test('google form proxy refuses to forward when endpoint env is missing', async () => {
  const originalFetch = globalThis.fetch;
  const originalEndpoint = process.env.GOOGLE_FORM_ENDPOINT;
  const calls = [];
  globalThis.fetch = async (...args) => {
    calls.push(args);
    throw new Error('fetch should not be called');
  };
  const res = createResponse();

  try {
    delete process.env.GOOGLE_FORM_ENDPOINT;
    await handler({ method: 'POST', body: { message: 'blocked' }, headers: {} }, res);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalEndpoint === undefined) {
      delete process.env.GOOGLE_FORM_ENDPOINT;
    } else {
      process.env.GOOGLE_FORM_ENDPOINT = originalEndpoint;
    }
  }

  assert.equal(res.statusCode, 501);
  assert.match(res.body, /Google form endpoint is not configured/);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal(calls.length, 0);
});

test('google form proxy preserves upstream errors as readable same-origin responses', async () => {
  const originalFetch = globalThis.fetch;
  const originalEndpoint = process.env.GOOGLE_FORM_ENDPOINT;
  globalThis.fetch = async () => ({
    status: 403,
    headers: { get: () => 'text/plain' },
    text: async () => 'forbidden'
  });
  const res = createResponse();

  try {
    process.env.GOOGLE_FORM_ENDPOINT = 'https://forms.example.test/submit';
    await handler({ method: 'POST', body: '{"message":"blocked"}', headers: {} }, res);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalEndpoint === undefined) {
      delete process.env.GOOGLE_FORM_ENDPOINT;
    } else {
      process.env.GOOGLE_FORM_ENDPOINT = originalEndpoint;
    }
  }

  assert.equal(res.statusCode, 403);
  assert.equal(res.body, 'forbidden');
  assert.equal(res.headers.get('cache-control'), 'no-store');
});

test('google form proxy rejects non-POST methods', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (...args) => {
    calls.push(args);
    throw new Error('fetch should not be called');
  };
  const res = createResponse();

  try {
    await handler({ method: 'GET', headers: {} }, res);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(res.statusCode, 405);
  assert.match(res.body, /Method not allowed/);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal(calls.length, 0);
});

test('google form proxy verifies Turnstile and never forwards the token', async () => {
  const originalFetch = globalThis.fetch;
  const originalEndpoint = process.env.GOOGLE_FORM_ENDPOINT;
  const originalSecret = process.env.TURNSTILE_SECRET_KEY;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url.includes('/turnstile/v0/siteverify')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true })
      };
    }
    return {
      status: 200,
      headers: { get: () => 'text/plain; charset=utf-8' },
      text: async () => 'ok'
    };
  };
  const res = createResponse();

  try {
    process.env.GOOGLE_FORM_ENDPOINT = 'https://forms.example.test/submit';
    process.env.TURNSTILE_SECRET_KEY = 'server-secret';
    await handler({
      method: 'POST',
      body: { formType: 'feedback', message: 'hello', turnstileToken: 'browser-token' },
      headers: { 'x-forwarded-for': '203.0.113.10, 10.0.0.1' }
    }, res);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalEndpoint === undefined) delete process.env.GOOGLE_FORM_ENDPOINT;
    else process.env.GOOGLE_FORM_ENDPOINT = originalEndpoint;
    if (originalSecret === undefined) delete process.env.TURNSTILE_SECRET_KEY;
    else process.env.TURNSTILE_SECRET_KEY = originalSecret;
  }

  assert.equal(res.statusCode, 200);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
  const verificationBody = new URLSearchParams(calls[0].options.body);
  assert.equal(verificationBody.get('secret'), 'server-secret');
  assert.equal(verificationBody.get('response'), 'browser-token');
  assert.equal(verificationBody.get('remoteip'), '203.0.113.10');
  assert.equal(calls[1].options.body, JSON.stringify({ formType: 'feedback', message: 'hello' }));
});

test('google form proxy rejects invalid Turnstile tokens before forwarding', async () => {
  const originalFetch = globalThis.fetch;
  const originalEndpoint = process.env.GOOGLE_FORM_ENDPOINT;
  const originalSecret = process.env.TURNSTILE_SECRET_KEY;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      json: async () => ({ success: false, 'error-codes': ['invalid-input-response'] })
    };
  };
  const res = createResponse();

  try {
    process.env.GOOGLE_FORM_ENDPOINT = 'https://forms.example.test/submit';
    process.env.TURNSTILE_SECRET_KEY = 'server-secret';
    await handler({
      method: 'POST',
      body: { message: 'blocked', turnstileToken: 'invalid-token' },
      headers: {}
    }, res);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalEndpoint === undefined) delete process.env.GOOGLE_FORM_ENDPOINT;
    else process.env.GOOGLE_FORM_ENDPOINT = originalEndpoint;
    if (originalSecret === undefined) delete process.env.TURNSTILE_SECRET_KEY;
    else process.env.TURNSTILE_SECRET_KEY = originalSecret;
  }

  assert.equal(res.statusCode, 403);
  assert.match(res.body, /Turnstile verification failed/);
  assert.equal(calls.length, 1);
});
