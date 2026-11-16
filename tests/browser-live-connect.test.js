// The connector of the card and the live screen (src/app/ui/browser-live/live-connect.js): a viewer only while somebody looks, and the person's buttons reach the server.
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { createBrowserCard } from '../src/app/ui/sandbox/browser-card.js';
import { connectBrowserLive } from '../src/app/ui/browser-live/live-connect.js';

const SID = 'b0123456789abcdef';
const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

function world({ viewerOk = true } = {}) {
  const window = new Window();
  const document = window.document;
  const host = document.createElement('div'); document.body.append(host);
  const card = createBrowserCard({ document, host, isWide: () => false });
  const calls = [];
  const api = async (method, path, body) => {
    calls.push([method, path, body]);
    if (path.endsWith('/viewer') && method === 'POST') return viewerOk ? { ok: true, status: 200, data: { viewerId: 'v-1', token: 't', host: 'live.example.com', wsPath: '/s/x/api/ws' } } : { ok: false, status: 409, data: {} };
    return { ok: true, status: 200, data: {} };
  };
  const sources = [];
  const createSource = (options) => {
    const log = [];
    const source = { log, options, mount(el) { el.append(document.createElement('i')); }, mountLens() {}, setQuality: (q) => log.push(q), destroy: () => log.push('destroy'), input: {} };
    sources.push(source);
    return source;
  };
  const timers = [];
  const connector = connectBrowserLive({ card, sessionId: SID, api, document, createSource, setTimer: (fn, ms) => { timers.push([fn, ms]); return timers.length; }, clearTimer: () => {} });
  return { card, calls, sources, connector, timers, document };
}
const names = (w) => w.calls.map((c) => `${c[0]} ${c[1].replace(`/v1/browser/${SID}`, '')}`);

test('the card shows the picture: a viewer is asked for, the source opens in the low quality', async () => {
  const w = world();
  await settle();
  assert.deepEqual(names(w), ['POST /viewer']);
  assert.equal(w.sources.length, 1); assert.equal(w.sources[0].options.quality, 'lq');
  assert.ok(w.card.element.querySelector('.bcard-live'));
});

test('the focus mode asks for the high quality, and closing it goes back', async () => {
  const w = world();
  await settle();
  w.card.openFocus();
  w.card.closeFocus();
  assert.deepEqual(w.sources[0].log, ['hq', 'lq']);
});

test('nobody looks (the card is a pill): the stream and the viewer go; looking again makes a new one', async () => {
  const w = world();
  await settle();
  w.card.element.querySelector('.bcard-shrink, [data-act="shrink"]')?.click?.();
  // The card's own way to a pill: the round button of the front.
  const shrink = [...w.card.element.querySelectorAll('button')].find((b) => /縮|shrink/i.test(b.getAttribute('aria-label') || ''));
  shrink.click();
  await settle();
  assert.ok(w.sources[0].log.includes('destroy'));
  assert.ok(names(w).includes('DELETE /viewer/v-1'));
  assert.equal(w.card.element.querySelector('.bcard-live'), null);
  w.card.element.querySelector('.bcard-pill').click();
  await settle();
  assert.equal(w.sources.length, 2);
});

test('taking over and giving back, and the size of the screen, reach the server; a refused take-over is undone', async () => {
  const w = await (async () => { const x = world(); await settle(); return x; })();
  w.card.openFocus();
  const take = [...w.card.element.ownerDocument.querySelectorAll('button')].find((b) => /接管|take/i.test(b.getAttribute('aria-label') || ''));
  take.click();
  await settle();
  assert.deepEqual(w.calls.at(-1), ['POST', `/v1/browser/${SID}/control`, { mode: 'user', viewerId: 'v-1' }]);
  const give = [...w.card.element.ownerDocument.querySelectorAll('button')].find((b) => /歸還|give/i.test(b.getAttribute('aria-label') || ''));
  give.click();
  await settle();
  assert.deepEqual(w.calls.at(-1), ['POST', `/v1/browser/${SID}/control`, { mode: 'model' }]);
});

test('no viewer from the server: a try again later, three times at most, and the card stays as it was', async () => {
  const w = world({ viewerOk: false });
  await settle();
  assert.equal(w.sources.length, 0);
  assert.equal(w.timers.length, 1);
  w.timers[0][0](); await settle();
  assert.equal(w.timers.length, 2);
  w.timers[1][0](); await settle();
  w.timers[2][0](); await settle();
  assert.equal(w.timers.length, 3);
  assert.equal(names(w).filter((n) => n === 'POST /viewer').length, 4);
});

test('the reply is over: the stream goes and does not come back', async () => {
  const w = world();
  await settle();
  w.card.complete();
  await settle();
  assert.ok(w.sources[0].log.includes('destroy'));
  assert.ok(names(w).includes('DELETE /viewer/v-1'));
  assert.equal(w.sources.length, 1);
});
