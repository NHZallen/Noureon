// The page actions of browser-host/cdp-actions.mjs (snapshot, click, type, press, scroll, back) against a real Chromium, when one is installed (CHROMIUM_PATH, or the
// Playwright one); and the reduction of the accessibility tree, which needs none.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
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
  const browser = spawn(chromium(), ['--headless=new', '--no-sandbox', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
  t.after(async () => { browser.kill('SIGKILL'); site.closeAllConnections(); await new Promise((resolve) => site.close(resolve)); fs.rmSync(profile, { recursive: true, force: true }); });
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
