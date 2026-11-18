// Fields that hold a secret are drawn as dots in the page itself (browser-host/cdp-actions.mjs, maskPage and the guard of cdp-service.mjs), against a real Chromium when one is installed:
// the pictures of the model, the live screen and the picture kept with the message all show dots; a snapshot gives such a field without its value; a card, a code or a bank field cannot be typed into by the model.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium as playwright } from 'playwright-core';

import { runAction } from '../browser-host/cdp-actions.mjs';

const SERVICE = fileURLToPath(new URL('../browser-host/cdp-service.mjs', import.meta.url));
const chromiumPath = () => {
  if (process.env.CHROMIUM_PATH && fs.existsSync(process.env.CHROMIUM_PATH)) return process.env.CHROMIUM_PATH;
  const root = '/opt/pw-browsers';
  if (!fs.existsSync(root)) return null;
  const dir = fs.readdirSync(root).find((name) => name.startsWith('chromium-') && fs.existsSync(path.join(root, name, 'chrome-linux64', 'chrome')));
  return dir ? path.join(root, dir, 'chrome-linux64', 'chrome') : null;
};

const PAGE = `<!doctype html><title>Pay</title>
<input id="search" type="search" aria-label="Search the shop">
<form id="login" onsubmit="return false"><input id="email" type="email" aria-label="Email address"><input id="pw" type="password" aria-label="Password"></form>
<form id="news"><input id="news-email" type="text" aria-label="Your name"></form>
<input id="card" autocomplete="cc-number" aria-label="Card number">
<input id="cvc" aria-label="Security code">
<input id="otp" autocomplete="one-time-code" aria-label="Code">
<input id="iban" aria-label="IBAN">
<iframe id="frame" srcdoc="<input id='fcard' autocomplete='cc-number' aria-label='Card in a frame'>"></iframe>`;

const computed = (page, selector) => page.evaluate((s) => {
  const el = s.startsWith('frame:') ? document.getElementById('frame').contentDocument.querySelector(s.slice(6)) : document.querySelector(s);
  return getComputedStyle(el).webkitTextSecurity;
}, selector);

test('secret fields are dots in the page and have no value in a snapshot; ordinary fields are not touched; a card, a code or a bank field cannot be typed into', { skip: chromiumPath() ? false : 'no Chromium here' }, async (t) => {
  const site = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(PAGE); });
  await new Promise((resolve) => site.listen(0, '127.0.0.1', resolve));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'secret-fields-'));
  const port = 20000 + Math.floor(Math.random() * 20000);
  const browser = spawn(chromiumPath(), ['--headless=new', '--no-sandbox', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore', detached: true });
  let service = null;
  t.after(async () => {
    service?.kill('SIGKILL');
    const gone = new Promise((resolve) => browser.once('exit', resolve));
    try { process.kill(-browser.pid, 'SIGKILL'); } catch { browser.kill('SIGKILL'); }
    await gone;
    site.closeAllConnections();
    await new Promise((resolve) => site.close(resolve));
    try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch { /* a temporary folder */ }
  });
  const devtools = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 240; i += 1) { try { await fetch(`${devtools}/json/version`); break; } catch { await new Promise((resolve) => setTimeout(resolve, 250)); } }
  const act = (action) => runAction(action, devtools);
  await act({ type: 'navigate', url: `http://127.0.0.1:${site.address().port}/` });

  // The values are in the fields before anyone looks (the person typed them by taking over, or the page filled them).
  const connected = await playwright.connectOverCDP(devtools);
  const page = connected.contexts()[0].pages().find((p) => p.url().startsWith('http://127.0.0.1'));
  await page.fill('#search', 'red shoes');
  await page.fill('#email', 'who@example.com');
  await page.fill('#pw', 'hunter2-pw');
  await page.fill('#news-email', 'Ada');
  await page.fill('#card', '4242424242424242');
  await page.fill('#cvc', '123');
  await page.fill('#otp', '654321');
  await page.fill('#iban', 'GB82WEST12345698765432');
  await page.evaluate(() => { document.getElementById('frame').contentDocument.getElementById('fcard').value = '4000000000000002'; });
  assert.equal(await computed(page, '#card'), 'none', 'nothing has looked yet, so nothing is marked');

  // A look of the model: the snapshot, then the picture.
  const look = await act({ type: 'snapshot' });
  const field = (name) => look.elements.find((e) => e.name === name);
  assert.equal(field('Search the shop').value, 'red shoes', 'an ordinary field is given as it is');
  assert.equal(field('Your name').value, 'Ada', 'a field of a form without a password is an ordinary field');
  for (const name of ['Email address', 'Card number', 'Security code', 'Code', 'IBAN']) {
    assert.equal(field(name).value, undefined, `${name} has no value in the snapshot`);
    assert.equal(field(name).filled, true, `${name} says that it is filled`);
  }
  assert.equal(field('Password').role, 'password field');
  assert.ok(!JSON.stringify(look).match(/4242|who@example|654321|GB82|hunter2|123"/), 'none of the values is anywhere in what the model gets');
  const secretsOf = Object.fromEntries(look.elements.filter((e) => e.secret).map((e) => [e.name, e.secret]));
  assert.deepEqual(secretsOf, { 'Email address': 'login', 'Card number': 'card', 'Security code': 'card', Code: 'code', IBAN: 'bank' });

  assert.equal(await computed(page, '#search'), 'none');
  assert.equal(await computed(page, '#news-email'), 'none');
  for (const selector of ['#email', '#card', '#cvc', '#otp', '#iban', 'frame:#fcard']) assert.equal(await computed(page, selector), 'disc', `${selector} is drawn as dots`);

  // The model cannot type a card, a code or a bank number; it can type an ordinary field and the user name.
  await assert.rejects(act({ type: 'type', ref: field('Card number').ref, text: '4111111111111111' }), /filled by the user/);
  await assert.rejects(act({ type: 'type', ref: field('Code').ref, text: '111111' }), /filled by the user/);
  await assert.rejects(act({ type: 'type', ref: field('IBAN').ref, text: 'DE00' }), /filled by the user/);
  await assert.rejects(act({ type: 'type', ref: field('Password').ref, text: 'x' }), /login tool/);
  assert.equal((await act({ type: 'type', ref: field('Search the shop').ref, text: 'blue' })).ok, true);

  // The picture is taken after the marking: the page shows the dots when it is captured (a picture of dots and of digits are not the same picture).
  const withDots = await act({ type: 'screenshot', format: 'png' });
  assert.ok(withDots.base64.length > 100);

  // The guard of the long-lived sidecar marks what appears later, with no look of the model.
  await page.evaluate(() => { const el = document.createElement('input'); el.id = 'late'; el.setAttribute('autocomplete', 'cc-csc'); document.body.appendChild(el); });
  assert.equal(await computed(page, '#late'), 'none');
  service = spawn(process.execPath, [SERVICE], { env: { ...process.env, DEVTOOLS: devtools, BROWSER_MASK_MS: '250' }, stdio: ['pipe', 'ignore', 'ignore'] });
  let marked = 'none';
  for (let i = 0; i < 40 && marked !== 'disc'; i += 1) { await new Promise((resolve) => setTimeout(resolve, 100)); marked = await computed(page, '#late'); }
  assert.equal(marked, 'disc', 'the guard drew the new field as dots by itself');

  // The eye: while the person holds the browser, what they typed is shown as typed; the guard keeps it so, a look of the model puts the dots back first, and asking again for the dots does too.
  const until = async (selector, wanted) => { let now = null; for (let i = 0; i < 40 && now !== wanted; i += 1) { now = await computed(page, selector); if (now !== wanted) await new Promise((resolve) => setTimeout(resolve, 100)); } return now; };
  service.stdin.write(`${JSON.stringify({ id: 101, action: { type: 'reveal', on: true } })}\n`);
  assert.equal(await until('#card', 'none'), 'none', 'the eye shows the card field as typed');
  assert.equal(await until('frame:#fcard', 'none'), 'none', 'and the one in a frame');
  await new Promise((resolve) => setTimeout(resolve, 700));
  assert.equal(await computed(page, '#card'), 'none', 'the guard does not hide it again while the eye is open');
  await act({ type: 'snapshot' });
  assert.equal(await computed(page, '#card'), 'disc', 'a look of the model puts the dots back before it looks');
  service.stdin.write(`${JSON.stringify({ id: 102, action: { type: 'reveal', on: true } })}\n`);
  assert.equal(await until('#card', 'none'), 'none');
  service.stdin.write(`${JSON.stringify({ id: 103, action: { type: 'reveal', on: false } })}\n`);
  assert.equal(await until('#card', 'disc'), 'disc', 'the dots come back when the eye is closed');
  assert.equal(await computed(page, '#search'), 'none', 'an ordinary field is never touched by the eye');
  await connected.close().catch(() => {});
});
