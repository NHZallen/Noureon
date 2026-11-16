// Which addresses the browser may be sent to (browser-host/cdp-actions.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkNavigableUrl } from '../browser-host/cdp-actions.mjs';

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
