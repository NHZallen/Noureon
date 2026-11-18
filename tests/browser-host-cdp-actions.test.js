// Which addresses the browser may be sent to (browser-host/cdp-actions.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkNavigableUrl, isUserPage, orderByCreation } from '../browser-host/cdp-actions.mjs';

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

test('the order of the tabs: the order they were made in (/json/list lists newest first), a tab that another tab opened standing right after it, as the browser does', () => {
  const pages = [tab('A', 'about:blank'), tab('B', 'https://b.example/'), tab('C', 'https://c.example/'), tab('D', 'https://d.example/'), tab('P', 'https://p.example/', '', { openerId: 'A' }), tab('Q', 'https://q.example/', '', { openerId: 'A' })];
  // made in the order A, B, C, D, P, Q
  const newestFirst = ['Q', 'P', 'D', 'C', 'B', 'A'];
  assert.deepEqual(orderByCreation([...pages].reverse(), newestFirst).map((p) => p.targetId), ['A', 'P', 'Q', 'B', 'C', 'D']);
  assert.deepEqual(orderByCreation(pages.slice(0, 4), ['D', 'C', 'B', 'A']).map((p) => p.targetId), ['A', 'B', 'C', 'D']);
  assert.deepEqual(orderByCreation([tab('Z', 'x'), tab('A', 'y')], ['A']).map((p) => p.targetId), ['A', 'Z'], 'one that /json/list does not know goes last');
  assert.deepEqual(orderByCreation([tab('P', 'x', '', { openerId: 'gone' })], ['P']).map((p) => p.targetId), ['P'], 'an opener that is not there is no reason to lose the tab');
});
