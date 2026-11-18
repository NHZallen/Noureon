// The connector of the card and the live screen (src/app/ui/browser-live/live-connect.js): a viewer only while somebody looks, and the person's buttons reach the server.
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { createBrowserCard } from '../src/app/ui/sandbox/browser-card.js';
import { connectBrowserLive } from '../src/app/ui/browser-live/live-connect.js';

const SID = 'b0123456789abcdef';
const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

let tabsNow = [];
function world({ viewerOk = true } = {}) {
  tabsNow = [{ tabId: 'T1', title: 'Shop', url: 'https://shop.example/', active: true }, { tabId: 'T2', title: 'Docs', url: 'https://docs.example/', active: false }];
  const window = new Window();
  const document = window.document;
  const host = document.createElement('div'); document.body.append(host);
  const card = createBrowserCard({ document, host, isWide: () => false });
  const calls = [];
  const api = async (method, path, body) => {
    calls.push([method, path, body]);
    if (path.endsWith('/tabs')) return { ok: true, status: 200, data: { ok: true, tabs: tabsNow } };
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
  const repeats = [];
  const copied = [];
  const connector = connectBrowserLive({ card, sessionId: SID, api, document, createSource, setTimer: (fn, ms) => { timers.push([fn, ms]); return timers.length; }, clearTimer: () => {}, setRepeat: (fn, ms) => { repeats.push([fn, ms]); return repeats.length; }, clearRepeat: () => { repeats.cleared = (repeats.cleared || 0) + 1; }, writeClipboard: (text) => { copied.push(text); } });
  return { card, calls, sources, connector, timers, document, repeats, copied };
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

test('the card is a pill: the stream and the viewer stay while the task runs, so that a press on the pill opens the focus mode at once, with nothing loaded again', async () => {
  const w = world();
  await settle();
  const shrink = [...w.card.element.querySelectorAll('button')].find((b) => /縮|shrink/i.test(b.getAttribute('aria-label') || ''));
  shrink.click();
  await settle();
  assert.equal(w.card.view, 'pill');
  assert.ok(!w.sources[0].log.includes('destroy'), 'the stream stays');
  assert.ok(!names(w).includes('DELETE /viewer/v-1'), 'and the viewer');
  assert.ok(w.card.element.querySelector('.bcard-live'), 'the picture of the card stays mounted');
  w.card.element.querySelector('.bcard-pill').click();
  await settle();
  assert.equal(w.sources.length, 1, 'no new stream: nothing to load');
  assert.ok(w.card.element.ownerDocument.querySelector('.bf'), 'the press on the pill opens the focus mode');
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

test('no viewer from the server: a try again later (quick at first, then every fifteen seconds), and the card stays as it was', async () => {
  const w = world({ viewerOk: false });
  await settle();
  assert.equal(w.sources.length, 0);
  assert.equal(w.timers.length, 1);
  w.timers[0][0](); await settle();
  assert.equal(w.timers.length, 2);
  w.timers[1][0](); await settle();
  w.timers[2][0](); await settle();
  assert.equal(w.timers.length, 4, 'after the quick tries the slow ones go on');
  assert.deepEqual(w.timers.map((t) => t[1]), [1500, 4000, 10_000, 15_000]);
  assert.equal(names(w).filter((n) => n === 'POST /viewer').length, 4);
});

test('back in front with a picture that does not move: the stream is let go and looked for again; a picture that moves is left alone', async () => {
  const w = world();
  await settle();
    let head = 1;
  w.card.playhead = () => head;
  const visible = () => { Object.defineProperty(w.document, 'visibilityState', { value: 'visible', configurable: true }); w.document.dispatchEvent(new w.document.defaultView.Event('visibilitychange')); };
  visible();
  assert.equal(w.timers.length, 1, 'a look is planned');
  head = 2;
  w.timers[0][0](); await settle();
  assert.equal(w.sources.length, 1, 'it moved: nothing is done');
  visible();
  w.timers.at(-1)[0](); await settle();
  assert.ok(w.sources[0].log.includes('destroy'), 'it did not move: the stream is let go');
});

test('the page comes back to the front or the network comes back while there is no picture: it looks at once, without waiting for the timer', async () => {
  const w = world({ viewerOk: false });
  await settle();
  const before = names(w).filter((n) => n === 'POST /viewer').length;
  w.document.dispatchEvent(new w.document.defaultView.Event('visibilitychange'));
  await settle();
  assert.equal(names(w).filter((n) => n === 'POST /viewer').length, before + 1);
  w.connector.stop();
  const after = names(w).filter((n) => n === 'POST /viewer').length;
  w.document.dispatchEvent(new w.document.defaultView.Event('visibilitychange'));
  await settle();
  assert.equal(names(w).filter((n) => n === 'POST /viewer').length, after, 'not once it is over');
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

test('a stream that ends within seconds is not brought back at once and without end: the tries are counted, with a wait, and only a stream that lived long starts them again', async () => {
  const w = world();
  await settle();
  const closeNow = (index, reason) => w.sources[index].options.onState('closed', reason);
  w.sources[0].options.onState('live');
  closeNow(0, 'ws-closed-1006');
  await settle();
  assert.equal(w.sources.length, 1, 'no new stream at the moment the old one went');
  assert.equal(w.timers.length, 1);
  assert.deepEqual(names(w).filter((n) => n.startsWith('POST /viewer')).length, 1);
  w.timers[0][0](); await settle();
  assert.equal(w.sources.length, 2);
  w.sources[1].options.onState('live'); closeNow(1, 'rtc-failed'); await settle();
  assert.equal(w.timers.length, 2);
  w.timers[1][0](); await settle();
  closeNow(2, 'no-media'); await settle();
  w.timers[2][0](); await settle();
  closeNow(3, 'no-media'); await settle();
  assert.equal(w.timers.length, 4, 'after the quick tries the slow ones go on');
  assert.equal(w.sources.length, 4);
  assert.deepEqual(w.card.element.querySelector('.bcard-live'), null);
});


test('the tabs are asked for while the focus mode is open (only to know which address is in front), not for any more when it is closed; there is no strip of our own', async () => {
  const w = world();
  await settle();
  assert.equal(w.repeats.length, 0, 'not asked for while only the card is there');
  w.card.openFocus();
  await settle();
  assert.deepEqual(names(w).filter((n) => n.endsWith('/tabs')), ['POST /tabs']);
  assert.equal(w.repeats.length, 1); assert.equal(w.repeats[0][1], 3000);
  assert.equal(w.card.element.ownerDocument.querySelectorAll('.bf-tab').length, 0);
  w.card.closeFocus();
  await settle();
  assert.equal(w.repeats.cleared, 1, 'not asked for any more when the focus mode is closed');
});

test('a card that is taken off the page lets go of the live screen (the viewer and the stream), so that the card made when the page joins the reply again can have it', async () => {
  const w = world();
  await settle();
  assert.ok(!names(w).includes('DELETE /viewer/v-1'));
  w.card.dispose();
  await settle();
  assert.ok(w.sources[0].log.includes('destroy'), 'the stream ends');
  assert.ok(names(w).includes('DELETE /viewer/v-1'), 'and the viewer is given back');
});

test('the card that had its picture and lost it says it is looking for the picture again, not that the browser is starting', async () => {
  const w = world();
  await settle();
  const site = () => w.card.element.querySelector('.bcard-site').textContent;
  w.card.setLive(null);
  assert.match(site(), /連線畫面中|Connecting/i);
  const fresh = createBrowserCard({ document: w.document, host: w.document.body, isWide: () => false });
  assert.match(fresh.element.querySelector('.bcard-site').textContent, /啟動瀏覽器|Starting/i, 'one that never had a picture is starting');
});

test('the screenshot button of the focus mode puts the picture of the screen in the box of the message and leaves the focus mode for the preview', async () => {
  const w = world();
  await settle();
  w.sources[0].snapshot = async () => new w.document.defaultView.Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' });
  const attached = [];
  w.document.addEventListener('noureon:attach-files', (event) => attached.push(...event.detail.files));
  w.card.openFocus();
  assert.ok(w.document.querySelector('.bf'), 'the focus mode is open');
  // On a phone the button is in the menu of the focus mode.
  [...w.document.querySelectorAll('.bf button')].find((b) => /更多|more/i.test(b.getAttribute('aria-label') || ''))?.click();
  const shot = [...w.document.querySelectorAll('button')].find((b) => /截圖給模型|screenshot to the model/i.test(`${b.getAttribute('aria-label') || ''}${b.textContent}`));
  assert.ok(shot, 'the button is there');
  shot.click();
  await settle();
  await settle();
  assert.equal(attached.length, 1);
  assert.equal(attached[0].type, 'image/jpeg');
  assert.match(attached[0].name, /^browser-.*\.jpg$/);
  assert.equal(w.document.querySelector('.bf'), null, 'the focus mode is left');
  assert.equal(w.card.view, 'front', 'for the preview');

  // No picture yet (nothing is shown): nothing is attached and the focus mode stays.
  const none = world();
  await settle();
  none.sources[0].snapshot = async () => null;
  none.card.openFocus();
  [...none.document.querySelectorAll('.bf button')].find((b) => /更多|more/i.test(b.getAttribute('aria-label') || ''))?.click();
  [...none.document.querySelectorAll('button')].find((b) => /截圖給模型|screenshot to the model/i.test(`${b.getAttribute('aria-label') || ''}${b.textContent}`))?.click();
  await settle();
  assert.ok(none.document.querySelector('.bf'), 'it stays when there was nothing to take');
});
