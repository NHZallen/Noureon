// Which addresses the browser may be sent to (browser-host/cdp-actions.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { TAB_ORDER_EXTENSION, checkNavigableUrl, isUserPage, orderByCreation, sortByStrip } from '../browser-host/cdp-actions.mjs';

test('web pages are allowed and normalised', () => {
  assert.equal(checkNavigableUrl('https://example.com/a?b=1#c'), 'https://example.com/a?b=1#c');
  assert.equal(checkNavigableUrl('http://example.com'), 'http://example.com/');
  assert.equal(checkNavigableUrl('  https://example.com/  '), 'https://example.com/');
});

test('nothing but http and https: the internal pages, local files and scripts are refused', () => {
  for (const bad of ['chrome://sandbox', 'chrome://inspect', 'chrome-extension://abc/page.html', 'file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,<script>1</script>',
    'blob:https://example.com/x', 'view-source:https://example.com', 'devtools://devtools/bundled/inspector.html', 'about:blank', 'ftp://example.com/x', 'ws://example.com/', '//example.com/x', 'example.com']) {
    assert.throws(() => checkNavigableUrl(bad), /only http and https|bad url/, bad);
  }
});

test('about:blank is allowed only where asked for (a new empty tab)', () => {
  assert.equal(checkNavigableUrl('about:blank', { allowBlank: true }), 'about:blank');
  assert.throws(() => checkNavigableUrl('about:srcdoc', { allowBlank: true }), /only http/);
});

test('addresses with a password, control characters, spaces inside, or absurd length are refused', () => {
  for (const bad of ['https://user:pass@example.com/', 'https://user@example.com/', 'https://exa mple.com/', 'https://example.com/\nx', 'https://example.com/\u0000', `https://example.com/${'a'.repeat(5000)}`, '', null, 42, undefined]) {
    assert.throws(() => checkNavigableUrl(bad), /bad url|not allowed/, String(bad).slice(0, 40));
  }
});

test('the browser\'s own windows are not tabs; real pages, the new tab page and an error page are', () => {
  const page = (url) => ({ type: 'page', url, targetId: 'x' });
  for (const url of ['https://example.com/', 'http://127.0.0.1:8000/a', 'about:blank', 'chrome://newtab/', 'chrome://new-tab-page/', 'chrome://new-tab-page-third-party/', 'chrome://new-tab-page-third-party', 'chrome-error://chromewebdata/']) assert.equal(isUserPage(page(url)), true, url);
  for (const url of ['chrome://omnibox-popup.top-chrome/', 'chrome://tab-strip.top-chrome/', 'chrome://sandbox/', 'chrome-untrusted://top-chrome/', 'devtools://devtools/bundled/devtools_app.html', 'chrome-extension://abc/page.html']) assert.equal(isUserPage(page(url)), false, url);
  assert.equal(isUserPage({ type: 'service_worker', url: 'https://example.com/sw.js' }), false);
  assert.equal(isUserPage({ type: 'background_page', url: 'https://example.com/' }), false);
  assert.equal(isUserPage(null), false);
});

const tab = (targetId, url, title = '', extra = {}) => ({ targetId, type: 'page', url, title: title || url, ...extra });

test('the extension id in the host is the one the key of the extension makes, and the policy lets that one extension in and nothing else', () => {
  const manifest = JSON.parse(readFileSync(new URL('../browser-host/image/tab-order/manifest.json', import.meta.url), 'utf8'));
  const id = [...createHash('sha256').update(Buffer.from(manifest.key, 'base64')).digest('hex').slice(0, 32)].map((c) => 'abcdefghijklmnop'[parseInt(c, 16)]).join('');
  assert.equal(id, TAB_ORDER_EXTENSION);
  assert.deepEqual(manifest.permissions, ['tabs'], 'no more than the tabs');
  assert.ok(!manifest.content_scripts && !manifest.externally_connectable && !manifest.host_permissions, 'nothing a page could reach');
  const policy = JSON.parse(readFileSync(new URL('../browser-host/policies.json', import.meta.url), 'utf8'));
  assert.deepEqual(policy.ExtensionInstallAllowlist, [id]);
  assert.deepEqual(policy.ExtensionInstallBlocklist, ['*']);
  assert.match(readFileSync(new URL('../browser-host/chromium.conf.template', import.meta.url), 'utf8'), /--load-extension=\/opt\/noureon-tab-order/);
});

test('the order of the strip: pages are matched to the entries of the extension by address, then title; the ones not found stay at the end; two windows keep their own order', () => {
  const pages = [tab('c', 'https://c.example/', 'C'), tab('a', 'https://a.example/', 'A'), tab('b', 'https://b.example/', 'B'), tab('x', 'about:blank')];
  const strip = [{ windowId: 1, index: 1, url: 'https://b.example/', title: 'B' }, { windowId: 1, index: 0, url: 'https://a.example/', title: 'A' }, { windowId: 1, index: 2, url: 'https://c.example/', title: 'C' }];
  assert.deepEqual(sortByStrip(pages, strip).map((p) => p.targetId), ['a', 'b', 'c', 'x']);
  // the address changed a moment ago: the title still finds it
  assert.deepEqual(sortByStrip([tab('a', 'https://a.example/new', 'A')], [{ windowId: 1, index: 0, url: 'https://a.example/old', title: 'A' }]).map((p) => p.targetId), ['a']);
  // two tabs that look the same are both there, once each
  const twins = [tab('t1', 'https://a.example/', 'A'), tab('t2', 'https://a.example/', 'A')];
  assert.deepEqual(sortByStrip(twins, [{ windowId: 1, index: 0, url: 'https://a.example/', title: 'A' }, { windowId: 1, index: 1, url: 'https://a.example/', title: 'A' }]).map((p) => p.targetId).sort(), ['t1', 't2']);
  assert.deepEqual(sortByStrip(pages, [{ windowId: 2, index: 0, url: 'https://c.example/', title: 'C' }, { windowId: 1, index: 0, url: 'https://a.example/', title: 'A' }]).map((p) => p.targetId), ['a', 'c', 'b', 'x']);
});

test('without the extension: the order they were made in (/json/list lists newest first), a tab that another tab opened standing right after it, as the browser does', () => {
  const pages = [tab('A', 'about:blank'), tab('B', 'https://b.example/'), tab('C', 'https://c.example/'), tab('D', 'https://d.example/'), tab('P', 'https://p.example/', '', { openerId: 'A' }), tab('Q', 'https://q.example/', '', { openerId: 'A' })];
  // made in the order A, B, C, D, P, Q
  const newestFirst = ['Q', 'P', 'D', 'C', 'B', 'A'];
  assert.deepEqual(orderByCreation([...pages].reverse(), newestFirst).map((p) => p.targetId), ['A', 'P', 'Q', 'B', 'C', 'D']);
  assert.deepEqual(orderByCreation(pages.slice(0, 4), ['D', 'C', 'B', 'A']).map((p) => p.targetId), ['A', 'B', 'C', 'D']);
  assert.deepEqual(orderByCreation([tab('Z', 'x'), tab('A', 'y')], ['A']).map((p) => p.targetId), ['A', 'Z'], 'one that /json/list does not know goes last');
  assert.deepEqual(orderByCreation([tab('P', 'x', '', { openerId: 'gone' })], ['P']).map((p) => p.targetId), ['P'], 'an opener that is not there is no reason to lose the tab');
});
