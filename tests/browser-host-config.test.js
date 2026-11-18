// The settings of browser-host (browser-host/config.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../browser-host/config.mjs';

const GOOD = { BROWSER_HOST_SECRET: 'a'.repeat(40), BROWSER_ALLOWED_IPS: '10.0.1.0/24' };

test('good settings, and the defaults', () => {
  const c = loadConfig(GOOD);
  assert.deepEqual(c.allowedIps, ['10.0.1.0/24']); assert.equal(c.bind, '127.0.0.1'); assert.equal(c.port, 40010);
  assert.equal(c.manager.maxSessions, 2); assert.equal(c.manager.idleMs, 1_800_000); assert.equal(c.manager.taskMaxMs, 7_200_000); assert.equal(c.manager.enabled, true);
  assert.equal(c.paths.seccomp, '/opt/noureon-browser/chromium-seccomp.json');
  assert.equal(loadConfig({ ...GOOD, BROWSER_ENABLED: 'false' }).manager.enabled, false);
  assert.deepEqual(loadConfig({ ...GOOD, BROWSER_HOST_SECRET: `${'a'.repeat(32)},${'b'.repeat(32)}` }).secrets.length, 2);
});

test('a missing or weak secret, or an empty allow-list, stops the start with a plain message that does not print the secret', () => {
  assert.throws(() => loadConfig({ BROWSER_ALLOWED_IPS: '1.2.3.4' }), /BROWSER_HOST_SECRET is empty/);
  assert.throws(() => loadConfig({ ...GOOD, BROWSER_HOST_SECRET: 'tooshort' }), (e) => /32 characters/.test(e.message) && !e.message.includes('tooshort'));
  assert.throws(() => loadConfig({ BROWSER_HOST_SECRET: GOOD.BROWSER_HOST_SECRET }), /BROWSER_ALLOWED_IPS is empty/);
});

test('numbers are checked, and without TLS the service may not listen on a public address', () => {
  assert.throws(() => loadConfig({ ...GOOD, BROWSER_MAX_SESSIONS: '0' }), /BROWSER_MAX_SESSIONS/);
  assert.throws(() => loadConfig({ ...GOOD, BROWSER_MAX_SESSIONS: 'two' }), /BROWSER_MAX_SESSIONS/);
  assert.throws(() => loadConfig({ ...GOOD, BROWSER_HOST_PORT: '80' }), /BROWSER_HOST_PORT/);
  assert.throws(() => loadConfig({ ...GOOD, BROWSER_HOST_BIND: '0.0.0.0' }), /TLS/);
  assert.throws(() => loadConfig({ ...GOOD, BROWSER_HOST_BIND: '84.247.153.81' }), /TLS/);
  assert.equal(loadConfig({ ...GOOD, BROWSER_HOST_BIND: '172.29.0.1' }).bind, '172.29.0.1');
  assert.equal(loadConfig({ ...GOOD, BROWSER_HOST_BIND: '0.0.0.0', BROWSER_HOST_TLS_CERT: '/c', BROWSER_HOST_TLS_KEY: '/k' }).bind, '0.0.0.0');
  assert.throws(() => loadConfig({ ...GOOD, BROWSER_HOST_TLS_CERT: '/c' }), /go together/);
  assert.throws(() => loadConfig({ ...GOOD, BROWSER_APP_DIR: 'relative' }), /absolute/);
});

test('the browser policies keep cookies: the image\'s own preferences set cookies to "session only" (4), which deletes a login the next time the browser starts', async () => {
  const policies = JSON.parse((await import('node:fs')).readFileSync(new URL('../browser-host/policies.json', import.meta.url), 'utf8'));
  assert.equal(policies.DefaultCookiesSetting, 1);
  assert.deepEqual(policies.URLBlocklist.includes('chrome://*'), true);
  assert.equal(policies.BrowserGuestModeEnabled, false);
});

test('the live screen is off by default and checked when on', () => {
  assert.equal(loadConfig(GOOD).live, null);
  const on = loadConfig({ ...GOOD, BROWSER_LIVE_PUBLIC_IP: '203.0.113.7', BROWSER_LIVE_HOST: 'Live.Example.com' });
  assert.deepEqual({ ...on.live }, { publicIp: '203.0.113.7', bindIp: undefined, host: 'live.example.com', slots: 8, allowedOrigins: [], portBase: 52000, maxViewers: 3, proxyBind: '172.29.0.1', proxyPort: 40011 });
  assert.deepEqual(loadConfig({ ...GOOD, BROWSER_LIVE_PUBLIC_IP: '203.0.113.7', BROWSER_LIVE_HOST: 'live.example.com', BROWSER_LIVE_ALLOWED_ORIGINS: 'https://staging.noureon.com, http://bad.example, https://noureon.com' }).live.allowedOrigins, ['https://staging.noureon.com', 'https://noureon.com']);
  assert.throws(() => loadConfig({ ...GOOD, BROWSER_LIVE_PUBLIC_IP: '999.1.1.1', BROWSER_LIVE_HOST: 'live.example.com' }), /IPv4/);
  assert.throws(() => loadConfig({ ...GOOD, BROWSER_LIVE_PUBLIC_IP: '203.0.113.7', BROWSER_LIVE_HOST: 'https://x/y' }), /BROWSER_LIVE_HOST/);
  assert.throws(() => loadConfig({ ...GOOD, BROWSER_LIVE_PUBLIC_IP: '203.0.113.7', BROWSER_LIVE_HOST: 'live.example.com', BROWSER_LIVE_PORT_BASE: '80' }), /BROWSER_LIVE_PORT_BASE/);
});

test('the browser policy: the new tab page is a blank page, not an error page of the block list; chrome:// pages stay blocked', async () => {
  const { readFile } = await import('node:fs/promises');
  const { readFileSync } = await import('node:fs');
  const policy = JSON.parse(await readFile(new URL('../browser-host/policies.json', import.meta.url), 'utf8'));
  assert.equal(policy.NewTabPageLocation, 'about:blank');
  assert.equal(policy.AIModeSettings, 1, 'no AI mode in the address bar: its pop-up is a chrome-untrusted page, which the block list turns into an English error page');
  assert.ok(policy.URLBlocklist.includes('chrome://*'));
  assert.deepEqual(policy.URLAllowlist, ['chrome://sandbox', 'chrome://omnibox-popup.top-chrome'], 'the only chrome:// pages let through: the sandbox report, and the drop-down of the address bar (a chrome:// page that the person sees when they type; blocked it showed an error panel instead of the suggestions)');
  assert.equal(policy.ApplicationLocaleValue, 'zh-TW', 'the pages of the browser itself in Chinese (with the language files in the image)');
  assert.match(readFileSync(new URL('../browser-host/chromium.conf.template', import.meta.url), 'utf8'), /LANGUAGE="zh_TW:zh"/, 'on Linux the language of Chromium\'s pages comes from this variable');
});
