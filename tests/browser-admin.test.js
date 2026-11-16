// The browser agent part of noureon.com/admin: nothing for anyone but the people the server names; stop every browser (asked twice) and make invite codes; and the page that holds the parts.
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { BROWSER_ADMIN_TEXTS } from '../src/app/browser-admin/browser-admin-texts.js';
import { ADMIN_PAGE_TEXTS } from '../src/app/admin-page/admin-texts.js';
import { initializeAdminPage } from '../src/app/admin-page/admin-page.js';

const tick = () => new Promise((resolve) => setTimeout(resolve, 20));
const NOT_FOUND = '<!doctype html><html><head><title>404: NOT_FOUND</title></head><body><h1>404: NOT_FOUND</h1></body></html>';

const open = async ({ token = 'tok', browser = true, reports = false, serverOk = true } = {}) => {
  const window = new Window({ url: 'https://noureon.test/admin' });
  window.document.body.innerHTML = '<div id="app"></div>';
  const calls = [];
  const asked = [];
  const rpcs = [];
  const supabase = {
    auth: { getSession: async () => ({ data: { session: token ? { access_token: token } : null } }) },
    rpc: async (name) => { rpcs.push(name); if (name === 'is_service_admin') return { data: reports, error: null }; if (name === 'admin_list_share_reports') return { data: [], error: null }; return { data: true, error: null }; }
  };
  const fetchImpl = async (path) => { asked.push(path); return { status: 404, text: async () => NOT_FOUND }; };
  const serverClient = {
    getAccess: async () => (serverOk ? { ok: true, allowed: browser, admin: browser } : { ok: false }),
    stopAllBrowsers: async () => { calls.push(['stop']); return { ok: true, stopped: 3 }; },
    mintCodes: async (n) => { calls.push(['mint', n]); return { ok: true, codes: ['NRN-AAAA-BBBB'] }; }
  };
  const result = await initializeAdminPage({ window, document: window.document, supabase, fetchImpl, baseUrl: 'https://api.test', serverClient });
  return { window, result, calls, asked, rpcs };
};

test('the five languages of the browser part and of the page around it', () => {
  const keys = Object.keys(BROWSER_ADMIN_TEXTS.en).sort();
  for (const [language, table] of Object.entries(BROWSER_ADMIN_TEXTS)) assert.deepEqual(Object.keys(table).sort(), keys, language);
  const pageKeys = Object.keys(ADMIN_PAGE_TEXTS.en).sort();
  for (const [language, table] of Object.entries(ADMIN_PAGE_TEXTS)) assert.deepEqual(Object.keys(table).sort(), pageKeys, language);
});

test('signed out, named by nobody, or a server that cannot be reached: the 404 of an address that is not there, nothing of the page', async () => {
  for (const options of [{ token: '' }, { browser: false }, { serverOk: false }]) {
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
    assert.deepEqual(page.result.parts, ['browser']);
    const doc = page.window.document;
    assert.equal(doc.querySelectorAll('[role=tab]').length, 0, 'one part needs no tabs');
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

test('an account that may do both gets two tabs, the reports first; each tab shows only its own part', async () => {
  const page = await open({ reports: true, browser: true });
  try {
    const doc = page.window.document;
    assert.deepEqual(page.result.parts, ['reports', 'browser']);
    const tabs = [...doc.querySelectorAll('[role=tab]')];
    assert.equal(tabs.length, 2);
    assert.deepEqual(tabs.map((t) => t.getAttribute('aria-selected')), ['true', 'false']);
    assert.ok(page.rpcs.includes('admin_list_share_reports'));
    assert.equal(doc.querySelectorAll('.sp-admin-card').length, 0, 'the browser part is not drawn yet');
    tabs[1].click(); await tick();
    assert.deepEqual([...doc.querySelectorAll('[role=tab]')].map((t) => t.getAttribute('aria-selected')), ['false', 'true']);
    assert.ok([...doc.querySelectorAll('.sp-btn')].some((b) => /全部停止|Stop all/.test(b.textContent)));
  } finally { await page.window.happyDOM.abort(); }
});

test('an account that may only review reports gets the reports and never asks the browser part for anything', async () => {
  const page = await open({ reports: true, browser: false });
  try {
    assert.deepEqual(page.result.parts, ['reports']);
    assert.ok(![...page.window.document.querySelectorAll('.sp-btn')].some((b) => /全部停止|Stop all/.test(b.textContent)));
  } finally { await page.window.happyDOM.abort(); }
});
