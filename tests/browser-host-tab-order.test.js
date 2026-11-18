// The order of the tabs the host tells (browser-host/cdp-actions.mjs, tabs list) against a real Chromium that has our tab-order extension loaded, when one is installed
// (CHROMIUM_PATH, or the Playwright one): the list is the order of the tab strip, which the extension API knows and DevTools does not.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runAction } from '../browser-host/cdp-actions.mjs';

const chromium = () => {
  if (process.env.CHROMIUM_PATH && fs.existsSync(process.env.CHROMIUM_PATH)) return process.env.CHROMIUM_PATH;
  const root = '/opt/pw-browsers';
  if (!fs.existsSync(root)) return null;
  const dir = fs.readdirSync(root).find((name) => name.startsWith('chromium-') && fs.existsSync(path.join(root, name, 'chrome-linux64', 'chrome')));
  return dir ? path.join(root, dir, 'chrome-linux64', 'chrome') : null;
};
const freePort = () => new Promise((resolve) => { const server = net.createServer(); server.listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close(() => resolve(port)); }); });
const until = async (check, { ms = 30_000, every = 150 } = {}) => {
  const end = Date.now() + ms;
  for (;;) {
    const value = await check();
    if (value || Date.now() > end) return value;
    await new Promise((resolve) => setTimeout(resolve, every));
  }
};

test('tabs list: the order of the tab strip, from the extension', { skip: !chromium() && 'no Chromium installed' }, async () => {
  const port = await freePort();
  const devtools = `http://127.0.0.1:${port}`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tab-order-'));
  const extension = path.resolve('browser-host/image/tab-order');
  const proc = spawn(chromium(), ['--headless=new', '--no-sandbox', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `--load-extension=${extension}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
  try {
    assert.ok(await until(async () => { try { return (await fetch(`${devtools}/json/version`)).ok; } catch { return false; } }), 'the browser is up');
    const act = (action) => runAction(action, devtools);
    // the extension's worker has to be there before the list can say anything from it
    assert.ok(await until(async () => (await (await fetch(`${devtools}/json/list`)).json()).some((item) => item.type === 'service_worker' && item.url.includes('einpcabpdadafpdbegpcfbmnhaemkhcd'))), 'the extension is loaded');
    for (const name of ['B', 'C', 'D']) await act({ type: 'tabs', op: 'new', url: 'about:blank' }).then(async ({ tabId }) => act({ type: 'navigate', url: `https://example.invalid/${name}`, tabId }).catch(() => null));
    const listed = (await act({ type: 'tabs', op: 'list' })).tabs;
    // what the strip itself says, through the same worker
    const targets = await (await fetch(`${devtools}/json/list`)).json();
    assert.ok(targets.length >= 4);
    assert.ok(listed.length >= 4, 'every tab is in the list');
    assert.equal(listed[0].url, 'about:blank', 'the first tab of the browser stands first');
    const names = listed.map((tab) => tab.url.split('/').pop());
    assert.ok(names.indexOf('B') < names.indexOf('C') && names.indexOf('C') < names.indexOf('D'), `made in the order B, C, D, they stand in that order: ${names.join(' ')}`);
  } finally {
    await new Promise((resolve) => { proc.once('exit', resolve); proc.kill(); setTimeout(resolve, 5_000); });
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
