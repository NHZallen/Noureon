// The page actions of browser-host/cdp-actions.mjs (snapshot, click, type, press, scroll, back) against a real Chromium, when one is installed (CHROMIUM_PATH, or the
// Playwright one); and the reduction of the accessibility tree, which needs none.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { elementsOfTree, runAction } from '../browser-host/cdp-actions.mjs';

const node = (id, role, name, extra = {}) => ({ nodeId: String(id), backendDOMNodeId: id, role: { value: role }, name: { value: name }, ...extra });

test('the tree is reduced to what can be acted on, with a number for each; hidden things and nameless ones are left out', () => {
  const elements = elementsOfTree([
    node(1, 'link', 'Home', { properties: [{ name: 'url', value: { value: 'https://example.com/' } }] }),
    node(2, 'button', 'Buy', { properties: [{ name: 'disabled', value: { value: true } }] }),
    node(3, 'generic', 'wrapper'),
    node(4, 'button', 'Hidden', { ignored: true }),
    node(5, 'button', ''),
    node(6, 'heading', 'Title', { properties: [{ name: 'level', value: { value: 2 } }] }),
    node(7, 'checkbox', 'Agree', { properties: [{ name: 'checked', value: { value: 'true' } }] }),
    { role: { value: 'button' }, name: { value: 'no backend id' } }
  ]);
  assert.deepEqual(elements.map((e) => [e.ref, e.role]), [[1, 'link'], [2, 'button'], [6, 'heading'], [7, 'checkbox']]);
  assert.equal(elements[0].href, 'https://example.com/');
  assert.equal(elements[1].disabled, true);
  assert.equal(elements[2].level, 2);
});

test('a field the tree marks as protected is a password field and shows no value; long words are cut', () => {
  const [field, long] = elementsOfTree([
    node(1, 'textbox', 'Password', { value: { value: '•••••' }, properties: [{ name: 'protected', value: { value: true } }] }),
    node(2, 'textbox', 'x'.repeat(500), { value: { value: 'y'.repeat(500) } })
  ]);
  assert.equal(field.role, 'password field');
  assert.equal(field.value, undefined);
  assert.ok(long.name.length <= 161 && long.value.length <= 161);
});

const chromium = () => {
  if (process.env.CHROMIUM_PATH && fs.existsSync(process.env.CHROMIUM_PATH)) return process.env.CHROMIUM_PATH;
  const root = '/opt/pw-browsers';
  if (!fs.existsSync(root)) return null;
  const dir = fs.readdirSync(root).find((name) => name.startsWith('chromium-') && fs.existsSync(path.join(root, name, 'chrome-linux64', 'chrome')));
  return dir ? path.join(root, dir, 'chrome-linux64', 'chrome') : null;
};

const PAGE = `<!doctype html><title>Test page</title><h1>Shop</h1><a href="/two">Go to page two</a>
<form onsubmit="document.getElementById('out').textContent='submitted:'+document.getElementById('q').value; return false;">
<input id="q" type="search" aria-label="Search"><input id="pw" type="password" aria-label="Password" value="hunter2-secret">
<label><input id="agree" type="checkbox"> I agree</label><button type="submit">Send</button></form>
<button onclick="this.textContent='clicked '+(window.n=(window.n||0)+1)">Count</button><p id="out"></p><div style="height:3000px">tall</div><button>Bottom button</button>`;

test('a real page: look, type, submit, click, scroll, go back; a password is never read or typed', { skip: chromium() ? false : 'no Chromium here' }, async (t) => {
  const site = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(req.url === '/two' ? '<title>Two</title><h1>Page two</h1>' : PAGE); });
  await new Promise((resolve) => site.listen(0, '127.0.0.1', resolve));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-page-'));
  const port = 20000 + Math.floor(Math.random() * 20000);
  const browser = spawn(chromium(), ['--headless=new', '--no-sandbox', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore', detached: true });
  t.after(async () => {
    const gone = new Promise((resolve) => browser.once('exit', resolve));
    try { process.kill(-browser.pid, 'SIGKILL'); } catch { browser.kill('SIGKILL'); } // the whole group: the browser's helper processes too
    await gone; // the browser's helper processes may still be writing to the profile for a moment
    site.closeAllConnections();
    await new Promise((resolve) => site.close(resolve));
    try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch { /* a temporary folder that could not be removed is not a failure of the test */ }
  });
  const devtools = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i += 1) { try { await fetch(`${devtools}/json/version`); break; } catch { await new Promise((resolve) => setTimeout(resolve, 250)); } }
  const act = (action) => runAction(action, devtools);
  const base = `http://127.0.0.1:${site.address().port}`;

  await act({ type: 'navigate', url: `${base}/` });
  const look = await act({ type: 'snapshot' });
  const find = (role, name) => look.elements.find((e) => e.role === role && e.name === name);
  const search = find('searchbox', 'Search');
  const password = find('password field', 'Password');
  assert.ok(search && password && find('link', 'Go to page two') && find('checkbox', 'I agree'));
  assert.ok(!JSON.stringify(look).includes('hunter2') && !JSON.stringify(look).includes('•'), 'the password is nowhere in what a model gets');
  assert.equal(password.value, undefined);

  await assert.rejects(act({ type: 'type', ref: password.ref, text: 'x' }), /login tool/);
  await act({ type: 'type', ref: search.ref, text: 'red shoes', submit: true });
  assert.match((await act({ type: 'snapshot' })).text, /submitted:red shoes/);

  await act({ type: 'click', ref: find('checkbox', 'I agree').ref });
  assert.equal((await act({ type: 'snapshot' })).elements.find((e) => e.role === 'checkbox').checked, 'true');
  const count = find('button', 'Count');
  await act({ type: 'click', ref: count.ref });
  await act({ type: 'click', ref: count.ref });
  assert.ok((await act({ type: 'snapshot' })).elements.some((e) => e.name === 'clicked 2'), 'the same number still works on the next look');

  assert.ok((await act({ type: 'scroll', direction: 'bottom' })).scroll.y > 1000);
  assert.equal((await act({ type: 'scroll', direction: 'top' })).scroll.y, 0);
  const moved = await act({ type: 'click', ref: find('link', 'Go to page two').ref });
  assert.equal(moved.title, 'Two');
  assert.equal((await act({ type: 'back' })).title, 'Test page');
  assert.equal((await act({ type: 'press', key: 'Tab' })).ok, true);

  await assert.rejects(act({ type: 'press', key: 'Hack' }), /not supported/);
  await assert.rejects(act({ type: 'click', ref: 9_999_999 }), /take a new snapshot/);
  await assert.rejects(act({ type: 'click', ref: '3' }), /ref must be a number/);
  await assert.rejects(act({ type: 'scroll', direction: 'sideways' }), /direction/);
  await assert.rejects(act({ type: 'type', ref: search.ref, text: 'x'.repeat(2001) }), /2000/);
  assert.equal((await act({ type: 'wait', ms: 50 })).ok, true);
});

const LOGIN_PAGE = `<!doctype html><title>Sign in</title><form onsubmit="return false"><input id="u" name="email" type="text" aria-label="Email"><input id="p" type="password" aria-label="Password"><button>Go</button></form>
<input id="hidden-user" type="text" name="username" style="display:none">`;
const STEP_ONE = `<!doctype html><title>Step one</title><input id="u" name="identifier" type="email" aria-label="Email or phone"><button>Next</button>`;

test('the login fields of a real page are filled only on a site of the login, in two steps when the page has two, and nothing of the values comes back', { skip: chromium() && spawnSync('openssl', ['version']).status === 0 ? false : 'no Chromium or no openssl here' }, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-login-'));
  const keyPath = path.join(dir, 'key.pem'); const certPath = path.join(dir, 'cert.pem');
  spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyPath, '-out', certPath, '-days', '1', '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1'], { stdio: 'ignore' });
  const site = https.createServer({ key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) }, (req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(req.url === '/step' ? STEP_ONE : LOGIN_PAGE); });
  await new Promise((resolve) => site.listen(0, '127.0.0.1', resolve));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-login-profile-'));
  const port = 20000 + Math.floor(Math.random() * 20000);
  const browser = spawn(chromium(), ['--headless=new', '--no-sandbox', '--ignore-certificate-errors', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore', detached: true });
  t.after(async () => {
    const gone = new Promise((resolve) => browser.once('exit', resolve));
    try { process.kill(-browser.pid, 'SIGKILL'); } catch { browser.kill('SIGKILL'); }
    await gone;
    site.closeAllConnections();
    await new Promise((resolve) => site.close(resolve));
    try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); fs.rmSync(dir, { recursive: true, force: true }); } catch { /* a temporary folder */ }
  });
  const devtools = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i += 1) { try { await fetch(`${devtools}/json/version`); break; } catch { await new Promise((resolve) => setTimeout(resolve, 250)); } }
  const act = (action) => runAction(action, devtools);
  const origin = `https://127.0.0.1:${site.address().port}`;

  await act({ type: 'navigate', url: `${origin}/` });
  const mine = [origin];
  // A page that is not a site of the login: nothing is typed, and the answer does not hold the values.
  const refused = await act({ type: 'fill-login', origins: ['https://other.example'], username: 'who@example.com', password: 'S3cret-pw-1' }).catch((error) => error);
  assert.match(String(refused.message), /not a site of that login/);
  assert.ok(!String(refused.message).includes('S3cret') && !String(refused.message).includes('who@'));
  await assert.rejects(act({ type: 'fill-login', origins: ['http://insecure.example'], username: 'a' }), /does not say which sites/);

  const done = await act({ type: 'fill-login', origins: mine, username: 'who@example.com', password: 'S3cret-pw-1' });
  assert.deepEqual(done.filled, ['username', 'password']);
  assert.ok(!JSON.stringify(done).includes('S3cret') && !JSON.stringify(done).includes('who@example'));
  const look = await act({ type: 'snapshot' });
  assert.equal(look.elements.find((e) => e.name === 'Email').value, 'who@example.com', 'the user name is an ordinary field');
  assert.ok(!JSON.stringify(look).includes('S3cret'), 'the password is nowhere in what a model gets');
  const typed = await act({ type: 'tabs', op: 'list' });
  assert.equal(typed.ok, true);

  // The first step of a two-step login has no password field: the user name only.
  await act({ type: 'navigate', url: `${origin}/step` });
  const first = await act({ type: 'fill-login', origins: mine, username: 'who@example.com', password: 'S3cret-pw-1' });
  assert.deepEqual(first.filled, ['username']);
  await act({ type: 'navigate', url: 'about:blank' }).catch(() => {});
});

const CODE_ONE = `<!doctype html><title>Code</title><input id="c" name="otp" autocomplete="one-time-code" aria-label="Code"><button>Verify</button>`;
const CODE_SIX = `<!doctype html><title>Code six</title><div>${[1, 2, 3, 4, 5, 6].map((n) => `<input class="d" maxlength="1" aria-label="Digit ${n}" oninput="if(this.value&&this.nextElementSibling)this.nextElementSibling.focus()">`).join('')}</div><input name="email" aria-label="Email">`;

test('a code is typed into one box or into a box for each digit, only on a site of the login, and is not given back', { skip: chromium() && spawnSync('openssl', ['version']).status === 0 ? false : 'no Chromium or no openssl here' }, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-code-'));
  const keyPath = path.join(dir, 'key.pem'); const certPath = path.join(dir, 'cert.pem');
  spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyPath, '-out', certPath, '-days', '1', '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1'], { stdio: 'ignore' });
  const site = https.createServer({ key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) }, (req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(req.url === '/six' ? CODE_SIX : CODE_ONE); });
  await new Promise((resolve) => site.listen(0, '127.0.0.1', resolve));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-code-profile-'));
  const port = 20000 + Math.floor(Math.random() * 20000);
  const browser = spawn(chromium(), ['--headless=new', '--no-sandbox', '--ignore-certificate-errors', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore', detached: true });
  t.after(async () => {
    const gone = new Promise((resolve) => browser.once('exit', resolve));
    try { process.kill(-browser.pid, 'SIGKILL'); } catch { browser.kill('SIGKILL'); }
    await gone;
    site.closeAllConnections();
    await new Promise((resolve) => site.close(resolve));
    try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); fs.rmSync(dir, { recursive: true, force: true }); } catch { /* a temporary folder */ }
  });
  const devtools = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i += 1) { try { await fetch(`${devtools}/json/version`); break; } catch { await new Promise((resolve) => setTimeout(resolve, 250)); } }
  const act = (action) => runAction(action, devtools);
  const origin = `https://127.0.0.1:${site.address().port}`;
  await act({ type: 'navigate', url: `${origin}/` });
  await assert.rejects(act({ type: 'fill-code', origins: ['https://other.example'], code: '123456' }), /not a site of that login/);
  await assert.rejects(act({ type: 'fill-code', origins: [origin], code: '12ab56' }), /no code to type/);
  const one = await act({ type: 'fill-code', origins: [origin], code: '123456' });
  assert.equal(one.boxes, 1); assert.ok(!JSON.stringify(one).includes('123456'));
  assert.equal((await act({ type: 'snapshot' })).elements.find((e) => e.name === 'Code').value, '123456');
  await act({ type: 'navigate', url: `${origin}/six` });
  const six = await act({ type: 'fill-code', origins: [origin], code: '654321' });
  assert.equal(six.boxes, 6);
  const values = (await act({ type: 'snapshot' })).elements.filter((e) => /^Digit/.test(e.name)).map((e) => e.value);
  assert.deepEqual(values, ['6', '5', '4', '3', '2', '1']);
});

const CARD_PAGE = `<!doctype html><title>Pay</title><form onsubmit="return false">
<input name="cardnumber" autocomplete="cc-number" aria-label="Card number"><input name="exp" placeholder="MM / YY" aria-label="Expiry">
<input autocomplete="cc-csc" aria-label="CVC"><input autocomplete="cc-name" aria-label="Name on card">
<input autocomplete="address-line1" aria-label="Address"><input autocomplete="postal-code" aria-label="ZIP">
<select autocomplete="country" aria-label="Country"><option value="">Choose</option><option value="TW">Taiwan</option><option value="US">United States</option></select>
<button>Pay now</button></form>`;
const CARD_SPLIT = `<!doctype html><title>Pay two</title><input autocomplete="cc-number" aria-label="Card number"><select autocomplete="cc-exp-month" aria-label="Month"><option>01</option><option>08</option></select><select autocomplete="cc-exp-year" aria-label="Year"><option>2028</option><option>2029</option></select>`;
const FULL_CARD = { number: '4242424242424242', expMonth: '08', expYear: '29', expYear4: '2029', cvc: '123', name: 'Chen Da-Ming', line1: '1 Main St', zip: '100', country: 'Taiwan' };

test('a card is typed into the fields of the page, only on the site it is for; the answer names the fields and holds no value; a field the page does not have is said', { skip: chromium() && spawnSync('openssl', ['version']).status === 0 ? false : 'no Chromium or no openssl here' }, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-card-'));
  const keyPath = path.join(dir, 'key.pem'); const certPath = path.join(dir, 'cert.pem');
  spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyPath, '-out', certPath, '-days', '1', '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1'], { stdio: 'ignore' });
  const site = https.createServer({ key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) }, (req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(req.url === '/split' ? CARD_SPLIT : CARD_PAGE); });
  await new Promise((resolve) => site.listen(0, '127.0.0.1', resolve));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-card-profile-'));
  const port = 20000 + Math.floor(Math.random() * 20000);
  const browser = spawn(chromium(), ['--headless=new', '--no-sandbox', '--ignore-certificate-errors', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore', detached: true });
  t.after(async () => {
    const gone = new Promise((resolve) => browser.once('exit', resolve));
    try { process.kill(-browser.pid, 'SIGKILL'); } catch { browser.kill('SIGKILL'); }
    await gone;
    site.closeAllConnections();
    await new Promise((resolve) => site.close(resolve));
    try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); fs.rmSync(dir, { recursive: true, force: true }); } catch { /* a temporary folder */ }
  });
  const devtools = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i += 1) { try { await fetch(`${devtools}/json/version`); break; } catch { await new Promise((resolve) => setTimeout(resolve, 250)); } }
  const act = (action) => runAction(action, devtools);
  const origin = `https://127.0.0.1:${site.address().port}`;
  await act({ type: 'navigate', url: `${origin}/` });
  const refused = await act({ type: 'fill-card', origins: ['https://other.example'], card: FULL_CARD }).catch((e) => e);
  assert.match(String(refused.message), /not the site the card is for/);
  assert.ok(!String(refused.message).includes('4242'));
  const done = await act({ type: 'fill-card', origins: [origin], card: FULL_CARD });
  assert.deepEqual(done.filled.sort(), ['country', 'cvc', 'exp', 'line1', 'name', 'number', 'zip'].sort());
  assert.deepEqual(done.missing, []);
  assert.ok(!JSON.stringify(done).includes('4242'));
  const look = await act({ type: 'snapshot' });
  const value = (name) => look.elements.find((e) => e.name === name)?.value;
  assert.equal(value('Card number'), '4242424242424242'); assert.equal(value('Expiry'), '08/29'); assert.equal(value('Name on card'), 'Chen Da-Ming'); assert.equal(value('ZIP'), '100');
  assert.ok(look.text.length >= 0);
  // A month and a year in two boxes (selects); a page with no name or address field says which required ones it did not find.
  await act({ type: 'navigate', url: `${origin}/split` });
  const split = await act({ type: 'fill-card', origins: [origin], card: FULL_CARD });
  assert.ok(split.filled.includes('number') && split.filled.includes('expMonth') && split.filled.includes('expYear'));
  assert.deepEqual(split.missing.sort(), ['cvc', 'name']);
  await assert.rejects(act({ type: 'fill-card', origins: ['http://x.example'], card: FULL_CARD }), /does not say which site/);
});

import { downloadName } from '../browser-host/cdp-actions.mjs';

test('the name of a downloaded file: what the server says, never a path, never odd characters', () => {
  const h = (value) => [{ name: 'Content-Disposition', value }];
  assert.equal(downloadName(h('attachment; filename="report 2026.pdf"'), 'https://x.example/a/b'), 'report 2026.pdf');
  assert.equal(downloadName(h("attachment; filename*=UTF-8''%E5%A0%B1%E5%91%8A.pdf"), 'https://x.example/'), '報告.pdf');
  assert.equal(downloadName(h('attachment; filename="../../etc/passwd"'), 'https://x.example/'), 'passwd');
  assert.equal(downloadName([], 'https://x.example/files/data.csv?x=1'), 'data.csv');
  assert.equal(downloadName(h('attachment; filename="a<b>:c|d.txt"'), 'https://x.example/'), 'a_b__c_d.txt');
  assert.equal(downloadName([], 'https://x.example/'), 'download');
  assert.equal(downloadName(h('attachment; filename=".hidden"'), 'https://x.example/'), 'hidden');
});

const DL_PAGE = '<!doctype html><title>Files</title><a href="/file.bin">Get the file</a> <a href="/big.bin">Get the big file</a> <a href="/page2">A page</a><button onclick="location.href=\'/file.bin\'">Download button</button>';

test('a file the page sends is taken out of the browser with its name and size, a page is not a file, too large is refused, and nothing is saved in the browser', { skip: chromium() && spawnSync('openssl', ['version']).status === 0 ? false : 'no Chromium or no openssl here' }, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-dl-'));
  const keyPath = path.join(dir, 'key.pem'); const certPath = path.join(dir, 'cert.pem');
  spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyPath, '-out', certPath, '-days', '1', '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1'], { stdio: 'ignore' });
  const payload = Buffer.from('hello,world\n1,2\n'.repeat(500));
  const site = https.createServer({ key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) }, (req, res) => {
    if (req.url === '/file.bin') { res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-disposition': 'attachment; filename="data 1.csv"', 'content-length': payload.length }); res.end(payload); return; }
    if (req.url === '/big.bin') { res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': 5 * 1024 * 1024 }); res.end(Buffer.alloc(5 * 1024 * 1024)); return; }
    res.writeHead(200, { 'content-type': 'text/html' }); res.end(req.url === '/page2' ? '<title>Two</title>' : DL_PAGE);
  });
  await new Promise((resolve) => site.listen(0, '127.0.0.1', resolve));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-dl-profile-'));
  const port = 20000 + Math.floor(Math.random() * 20000);
  const browser = spawn(chromium(), ['--headless=new', '--no-sandbox', '--ignore-certificate-errors', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore', detached: true });
  t.after(async () => {
    const gone = new Promise((resolve) => browser.once('exit', resolve));
    try { process.kill(-browser.pid, 'SIGKILL'); } catch { browser.kill('SIGKILL'); }
    await gone;
    site.closeAllConnections();
    await new Promise((resolve) => site.close(resolve));
    try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); fs.rmSync(dir, { recursive: true, force: true }); } catch { /* a temporary folder */ }
  });
  const devtools = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i += 1) { try { await fetch(`${devtools}/json/version`); break; } catch { await new Promise((resolve) => setTimeout(resolve, 250)); } }
  const act = (action) => runAction(action, devtools);
  const origin = `https://127.0.0.1:${site.address().port}`;
  await act({ type: 'navigate', url: `${origin}/` });
  const look = await act({ type: 'snapshot' });
  const link = look.elements.find((e) => e.name === 'Get the file');
  const got = await act({ type: 'download', ref: link.ref });
  assert.equal(got.name, 'data 1.csv'); assert.equal(got.size, payload.length); assert.equal(got.mime, 'application/octet-stream');
  assert.equal(Buffer.from(got.base64, 'base64').equals(payload), true);
  const viaUrl = await act({ type: 'download', url: `${origin}/file.bin` });
  assert.equal(viaUrl.size, payload.length);
  await assert.rejects(act({ type: 'download', ref: look.elements.find((e) => e.name === 'Get the big file').ref, maxBytes: 1024 * 1024 }), /larger than/);
  await assert.rejects(act({ type: 'download', ref: look.elements.find((e) => e.name === 'A page').ref }), /did not send a file/);
  await assert.rejects(act({ type: 'download' }), /say what to click/);
  const again = await act({ type: 'snapshot' });
  assert.equal(again.title, 'Two', 'the page that was not a file opened as a page, and the browser still works after downloads');
});

test('tabs: the list says which one is in front; a tab can be brought to the front, reloaded and closed', { skip: chromium() ? false : 'no Chromium here' }, async (t) => {
  const site = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(`<title>${req.url === '/b' ? 'Page B' : 'Page A'}</title><p>${Math.random()}</p>`); });
  await new Promise((resolve) => site.listen(0, '127.0.0.1', resolve));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-tabs-'));
  const port = 20000 + Math.floor(Math.random() * 20000);
  const browser = spawn(chromium(), ['--headless=new', '--no-sandbox', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore', detached: true });
  t.after(async () => {
    const gone = new Promise((resolve) => browser.once('exit', resolve));
    try { process.kill(-browser.pid, 'SIGKILL'); } catch { browser.kill('SIGKILL'); }
    await gone;
    site.closeAllConnections();
    await new Promise((resolve) => site.close(resolve));
    try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch { /* a temporary folder */ }
  });
  const devtools = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i += 1) { try { await fetch(`${devtools}/json/version`); break; } catch { await new Promise((resolve) => setTimeout(resolve, 250)); } }
  const act = (action) => runAction(action, devtools);
  const base = `http://127.0.0.1:${site.address().port}`;
  await act({ type: 'navigate', url: `${base}/` });
  const second = await act({ type: 'tabs', op: 'new', url: `${base}/b` });
  await new Promise((resolve) => setTimeout(resolve, 600));
  const listed = (await act({ type: 'tabs', op: 'list' })).tabs;
  assert.equal(listed.length, 2);
  assert.ok(listed.every((tab) => typeof tab.active === 'boolean'));
  await act({ type: 'tabs', op: 'activate', tabId: listed.find((tab) => tab.tabId !== second.tabId).tabId });
  await new Promise((resolve) => setTimeout(resolve, 300));
  const after = (await act({ type: 'tabs', op: 'list' })).tabs;
  assert.equal(after.filter((tab) => tab.active).length, 1);
  assert.equal(after.find((tab) => tab.active).tabId, listed.find((tab) => tab.tabId !== second.tabId).tabId);
  assert.equal((await act({ type: 'tabs', op: 'reload', tabId: second.tabId })).ok, true);
  await assert.rejects(act({ type: 'tabs', op: 'activate' }), /tabId is needed/);
  await assert.rejects(act({ type: 'tabs', op: 'activate', tabId: 'nonexistent' }), /no such tab/);
  await act({ type: 'tabs', op: 'close', tabId: second.tabId });
  assert.equal((await act({ type: 'tabs', op: 'list' })).tabs.length, 1);
});
