// noureon.com/admin/browser: nothing for anyone but the people in charge; stop every browser (asked twice) and make invite codes.
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { isAdminBrowserRoute } from '../src/app/share-page/share-route.js';
import { BROWSER_ADMIN_TEXTS } from '../src/app/browser-admin/browser-admin-texts.js';
import { initializeBrowserAdminPage } from '../src/app/browser-admin/browser-admin-page.js';

const tick = () => new Promise((resolve) => setTimeout(resolve, 20));
const NOT_FOUND = '<!doctype html><html><head><title>404: NOT_FOUND</title></head><body><h1>404: NOT_FOUND</h1></body></html>';

const open = async ({ token = 'tok', admin = true, ok = true } = {}) => {
  const window = new Window({ url: 'https://noureon.test/admin/browser' });
  window.document.body.innerHTML = '<div id="app"></div>';
  const calls = [];
  const asked = [];
  const supabase = { auth: { getSession: async () => ({ data: { session: token ? { access_token: token } : null } }) } };
  const fetchImpl = async (path, options) => {
    if (String(path).startsWith('https://api.test')) { calls.push([options?.method, path.replace('https://api.test', ''), options?.headers?.Authorization]); return { ok: true, status: 200, json: async () => ({}) }; }
    asked.push(path); return { status: 404, text: async () => NOT_FOUND };
  };
  const serverClient = {
    getAccess: async () => (ok ? { ok: true, allowed: admin, admin } : { ok: false }),
    stopAllBrowsers: async () => { calls.push(['stop']); return { ok: true, stopped: 3 }; },
    mintCodes: async (n) => { calls.push(['mint', n]); return { ok: true, codes: ['NRN-AAAA-BBBB'] }; }
  };
  const result = await initializeBrowserAdminPage({ window, document: window.document, supabase, fetchImpl, baseUrl: 'https://api.test', serverClient });
  return { window, result, calls, asked };
};

test('the route and the five languages of the page', () => {
  assert.equal(isAdminBrowserRoute('/admin/browser'), true);
  assert.equal(isAdminBrowserRoute('/admin/browser/'), true);
  assert.equal(isAdminBrowserRoute('/admin/shares'), false);
  const keys = Object.keys(BROWSER_ADMIN_TEXTS.en).sort();
  for (const [language, table] of Object.entries(BROWSER_ADMIN_TEXTS)) assert.deepEqual(Object.keys(table).sort(), keys, language);
});

test('signed out, not named by the server, or a server that cannot be reached: the 404 of an address that is not there, nothing of the page', async () => {
  for (const options of [{ token: '' }, { admin: false }, { ok: false }]) {
    const page = await open(options);
    try {
      assert.equal(page.result.admin, false);
      assert.equal(page.asked.length, 1);
      assert.doesNotMatch(page.asked[0], /admin|browser/);
      assert.equal(page.window.document.querySelector('.sp-root'), null);
      assert.match(page.window.document.body.textContent, /404: NOT_FOUND/);
    } finally { await page.window.happyDOM.abort(); }
  }
});

test('stopping every browser asks twice; a click on make codes lists them with a copy button', async () => {
  const page = await open();
  try {
    assert.equal(page.result.admin, true);
    const doc = page.window.document;
    assert.match(doc.querySelector('.sp-title').textContent, /瀏覽器代理管理|Browser agent admin/);
    const stop = [...doc.querySelectorAll('.sp-btn')].find((b) => /全部停止|Stop all/.test(b.textContent));
    stop.click(); await tick();
    assert.ok(!page.calls.some((c) => c[0] === 'stop'), 'one press only asks');
    stop.click(); await tick();
    assert.deepEqual(page.calls.at(-1), ['stop']);
    assert.match(doc.querySelector('[role=status]').textContent, /3/);
    const make = [...doc.querySelectorAll('.sp-btn')].find((b) => /產生 5 組|Make 5/.test(b.textContent));
    make.click(); await tick();
    assert.deepEqual(page.calls.at(-1), ['mint', 5]);
    assert.match(doc.querySelector('.sp-admin-reasons').textContent, /NRN-AAAA-BBBB/);
  } finally { await page.window.happyDOM.abort(); }
});
