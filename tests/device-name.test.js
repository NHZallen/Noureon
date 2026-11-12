import assert from 'node:assert/strict';
import test from 'node:test';

import { deviceName } from '../src/app/runtime/security/device-name.js';

const AGENTS = {
  'iPhone · Safari': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  'iPhone · Chrome': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1',
  'iPhone · Google app': 'Mozilla/5.0 (iPhone; CPU iPhone OS 27_2_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/445.5.1006576801 Mobile/15E148 Safari/604.1',
  'iPad · Safari': 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  'Mac · Safari': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  'Mac · Chrome': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Windows PC · Edge': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
  'Windows PC · Firefox': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
  'Android phone · Chrome': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  'Android tablet · Samsung Internet': 'Mozilla/5.0 (Linux; Android 14; SM-X900) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Safari/537.36',
  'Linux · Chrome': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
};

test('the device and the browser are named in a few words, the app\'s own browser views by their app', () => {
  for (const [expected, agent] of Object.entries(AGENTS)) assert.equal(deviceName(agent), expected);
});

test('an empty, odd or very long text gives a name that can be shown', () => {
  assert.equal(deviceName(''), 'Unknown device');
  assert.equal(deviceName(undefined), 'Unknown device');
  assert.equal(deviceName('curl/8.0'), 'Unknown device');
  assert.equal(deviceName('node'), 'Unknown device');
  assert.ok(deviceName(`${'x'.repeat(5000)} iPhone Safari/604.1`).length < 60);
});
