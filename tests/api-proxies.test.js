import assert from 'node:assert/strict';
import test from 'node:test';

import nvidiaChat from '../api/nvidia-chat.js';
import tavilySearch from '../api/tavily-search.js';

// A response as the platform gives one to a function: what was set, written and ended, and a way to say the page went away.
const respond = () => {
  const listeners = {};
  const res = {
    headers: {}, code: 200, body: undefined, chunks: [], headersSent: false, writableEnded: false,
    setHeader(key, value) { this.headers[key.toLowerCase()] = value; },
    status(code) { this.code = code; return this; },
    json(value) { this.body = value; this.headersSent = true; this.writableEnded = true; return this; },
    flushHeaders() { this.headersSent = true; },
    write(chunk) { this.headersSent = true; this.chunks.push(Buffer.from(chunk).toString('utf8')); return true; },
    end(value) { if (value !== undefined) this.body = value; this.headersSent = true; this.writableEnded = true; return this; },
    on(event, listener) { (listeners[event] ||= []).push(listener); return this; },
    emit(event) { for (const listener of listeners[event] || []) listener(); }
  };
  return res;
};

const withFetch = async (fetchImpl, run) => {
  const saved = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => { calls.push({ url: String(url), options }); return fetchImpl(url, options); };
  try {
    await run(calls);
  } finally {
    globalThis.fetch = saved;
  }
};

const streamOf = (...parts) => new ReadableStream({
  start(controller) {
    for (const part of parts) controller.enqueue(new TextEncoder().encode(part));
    controller.close();
  }
});

for (const [name, handler, upstreamUrl] of [
  ['Tavily search', tavilySearch, 'https://api.tavily.com/search'],
  ['NVIDIA chat', nvidiaChat, 'https://integrate.api.nvidia.com/v1/chat/completions']
]) {
  test(`${name}: a preflight is answered, and any method but POST is refused with the ones that are allowed`, async () => {
    const preflight = respond();
    await handler({ method: 'OPTIONS', headers: {} }, preflight);
    assert.equal(preflight.code, 204);
    assert.match(preflight.headers['access-control-allow-methods'], /POST/);
    assert.match(preflight.headers['access-control-allow-headers'], /authorization/);

    const get = respond();
    await handler({ method: 'GET', headers: {} }, get);
    assert.equal(get.code, 405);
    assert.equal(get.headers.allow, 'POST, OPTIONS');
  });

  test(`${name}: without the person's key nothing is asked of the service`, async () => {
    await withFetch(async () => new Response('{}'), async (calls) => {
      const res = respond();
      await handler({ method: 'POST', headers: {}, body: {} }, res);
      assert.equal(res.code, 401);
      assert.equal(calls.length, 0);
    });
  });

  test(`${name}: the person's key and request go to the service as they are, an object body as JSON`, async () => {
    await withFetch(async () => new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } }), async (calls) => {
      const asObject = respond();
      await handler({ method: 'POST', headers: { authorization: 'Bearer person-key' }, body: { query: 'q' } }, asObject);
      const asText = respond();
      await handler({ method: 'POST', headers: { authorization: 'Bearer person-key' }, body: '{"query":"text"}' }, asText);
      assert.equal(calls[0].url, upstreamUrl);
      assert.equal(calls[0].options.method, 'POST');
      assert.equal(calls[0].options.headers.Authorization, 'Bearer person-key');
      assert.equal(calls[0].options.body, '{"query":"q"}');
      assert.equal(calls[1].options.body, '{"query":"text"}');
      assert.equal(asObject.code, 200);
      assert.equal(asObject.headers['cache-control'], 'no-store');
    });
  });

  test(`${name}: what the service refuses is told as it is (a rate limit stays a rate limit), without keeping it`, async () => {
    await withFetch(async () => new Response('{"error":"slow down"}', { status: 429, headers: { 'content-type': 'application/json' } }), async () => {
      const res = respond();
      await handler({ method: 'POST', headers: { authorization: 'Bearer person-key' }, body: {} }, res);
      assert.equal(res.code, 429);
      assert.match(String(res.body ?? res.chunks.join('')), /slow down/);
      assert.equal(res.headers['cache-control'], 'no-store');
    });
  });

  test(`${name}: a service that cannot be reached is a 502 that names the failure and never the key`, async () => {
    await withFetch(async () => { throw new Error('socket hang up'); }, async () => {
      const res = respond();
      await handler({ method: 'POST', headers: { authorization: 'Bearer person-key-secret' }, body: {} }, res);
      assert.equal(res.code, 502);
      assert.equal(res.body.detail, 'socket hang up');
      assert.doesNotMatch(JSON.stringify(res.body), /person-key-secret/);
    });
  });
}

test('NVIDIA chat: the answer is passed on piece by piece as the service writes it, with the headers a stream needs', async () => {
  await withFetch(async () => new Response(streamOf('data: {"a":1}\n\n', 'data: [DONE]\n\n'), { status: 200, headers: { 'content-type': 'text/event-stream' } }), async () => {
    const res = respond();
    await nvidiaChat({ method: 'POST', headers: { authorization: 'Bearer k' }, body: { model: 'm' } }, res);
    assert.equal(res.code, 200);
    assert.deepEqual(res.chunks, ['data: {"a":1}\n\n', 'data: [DONE]\n\n']);
    assert.equal(res.headers['content-type'], 'text/event-stream');
    assert.equal(res.headers['x-accel-buffering'], 'no');
    assert.equal(res.writableEnded, true);
  });
});

test('NVIDIA chat: a service that answers without a stream is passed on whole, with its status', async () => {
  await withFetch(async () => ({ status: 503, headers: new Headers(), body: null, text: async () => 'busy' }), async () => {
    const res = respond();
    await nvidiaChat({ method: 'POST', headers: { authorization: 'Bearer k' }, body: {} }, res);
    assert.equal(res.code, 503);
    assert.equal(res.body, 'busy');
    assert.equal(res.headers['content-type'], 'text/event-stream; charset=utf-8');
  });
});

test('NVIDIA chat: a stream that breaks after it began is ended, not turned into a second answer', async () => {
  const broken = new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode('data: {"a":1}\n\n')); },
    pull() { throw new Error('connection reset'); }
  });
  await withFetch(async () => new Response(broken, { status: 200, headers: { 'content-type': 'text/event-stream' } }), async () => {
    const res = respond();
    await nvidiaChat({ method: 'POST', headers: { authorization: 'Bearer k' }, body: {} }, res);
    assert.equal(res.code, 200, 'no 502 over a stream that already began');
    assert.equal(res.writableEnded, true);
    assert.equal(res.chunks[0], 'data: {"a":1}\n\n');
  });
});

test('NVIDIA chat: when the page goes away the request to the service is stopped, and nothing more is written', async () => {
  let seenSignal;
  await withFetch((url, options) => new Promise((resolve, reject) => {
    seenSignal = options.signal;
    options.signal.addEventListener('abort', () => reject(new Error('aborted')));
  }), async () => {
    const res = respond();
    const running = nvidiaChat({ method: 'POST', headers: { authorization: 'Bearer k' }, body: {} }, res);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(seenSignal.aborted, false);
    res.emit('close');
    await running;
    assert.equal(seenSignal.aborted, true);
    assert.equal(res.headersSent, false, 'no 502 is written to a page that is gone');
  });
});
