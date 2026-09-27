import assert from 'node:assert/strict';
import test from 'node:test';

import { deliverFile, prefersShareSheet } from '../../src/app/ui/files/file-card-interactions.js';

const UA = {
  iosChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.7204.156 Mobile/15E148 Safari/604.1',
  iosSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  iosGoogleApp: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/380.0.1 Mobile/15E148 Safari/604.1',
  androidChrome: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36'
};

function fakeWindow({ userAgent, standalone = false, share, userActivation } = {}) {
  const clicks = [];
  const document = {
    body: { appendChild: () => {} },
    createElement: () => ({ click() { clicks.push(this.download); }, remove() {} })
  };
  const window = {
    navigator: { userAgent, platform: 'iPhone', maxTouchPoints: 5, standalone, share, canShare: () => true, userActivation },
    matchMedia: () => ({ matches: false }),
    File: class { constructor(parts, name, options) { this.name = name; this.type = options.type; } },
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} },
    setTimeout: () => {}
  };
  return { window, document, clicks };
}

const blob = { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' };

test('iPhone browsers other than Safari use the share sheet', () => {
  assert.equal(prefersShareSheet(fakeWindow({ userAgent: UA.iosChrome }).window), true);
  assert.equal(prefersShareSheet(fakeWindow({ userAgent: UA.iosGoogleApp }).window), true);
  assert.equal(prefersShareSheet(fakeWindow({ userAgent: UA.iosSafari }).window), false, 'Safari follows download links');
  assert.equal(prefersShareSheet(fakeWindow({ userAgent: UA.iosSafari, standalone: true }).window), true, 'home-screen apps do not');
  const android = fakeWindow({ userAgent: UA.androidChrome });
  android.window.navigator.platform = 'Linux';
  assert.equal(prefersShareSheet(android.window), false);
});

test('Chrome on iPhone shares the file; Safari downloads it', async () => {
  const shared = [];
  const chrome = fakeWindow({ userAgent: UA.iosChrome, share: async (data) => { shared.push(data.files[0].name); } });
  assert.equal(await deliverFile({ ...chrome, blob, fileName: 'deck.pptx' }), 'shared');
  assert.deepEqual(shared, ['deck.pptx']);
  assert.deepEqual(chrome.clicks, []);

  const safari = fakeWindow({ userAgent: UA.iosSafari, share: async () => { throw new Error('unused'); } });
  assert.equal(await deliverFile({ ...safari, blob, fileName: 'deck.pptx' }), 'downloaded');
  assert.deepEqual(safari.clicks, ['deck.pptx']);
});

test('a tap that expired while the file was generated asks for one more tap', async () => {
  const expired = fakeWindow({ userAgent: UA.iosChrome, userActivation: { isActive: false }, share: async () => { throw new Error('must not be called'); } });
  assert.equal(await deliverFile({ ...expired, blob, fileName: 'deck.pptx' }), 'needs-tap');
  assert.deepEqual(expired.clicks, [], 'no silent download link that iOS Chrome would ignore');

  const refused = fakeWindow({ userAgent: UA.iosChrome, share: async () => { const error = new Error('gesture'); error.name = 'NotAllowedError'; throw error; } });
  assert.equal(await deliverFile({ ...refused, blob, fileName: 'deck.pptx' }), 'needs-tap');

  const cancelled = fakeWindow({ userAgent: UA.iosChrome, share: async () => { const error = new Error('closed'); error.name = 'AbortError'; throw error; } });
  assert.equal(await deliverFile({ ...cancelled, blob, fileName: 'deck.pptx' }), 'cancelled');
});
