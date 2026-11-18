// The long-lived DevTools service (browser-host/cdp-service.mjs) against a real Chromium, when one is installed (CHROMIUM_PATH, or the Playwright one): one action for each line on
// standard input, one answer line for each, several at the same time, a bad line that does not stop it, and the end when standard input ends.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const SERVICE = fileURLToPath(new URL('../browser-host/cdp-service.mjs', import.meta.url));

const chromium = () => {
  if (process.env.CHROMIUM_PATH && fs.existsSync(process.env.CHROMIUM_PATH)) return process.env.CHROMIUM_PATH;
  const root = '/opt/pw-browsers';
  if (!fs.existsSync(root)) return null;
  const dir = fs.readdirSync(root).find((name) => name.startsWith('chromium-') && fs.existsSync(path.join(root, name, 'chrome-linux64', 'chrome')));
  return dir ? path.join(root, dir, 'chrome-linux64', 'chrome') : null;
};

test('the service: an answer for each line, a look and its picture together, a bad line ignored, an error that does not stop it, and it ends with its input', { skip: chromium() ? false : 'no Chromium here' }, async (t) => {
  const site = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<title>Service page</title><button>Go</button>'); });
  await new Promise((resolve) => site.listen(0, '127.0.0.1', resolve));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-service-'));
  const port = 20000 + Math.floor(Math.random() * 20000);
  const browser = spawn(chromium(), ['--headless=new', '--no-sandbox', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore', detached: true });
  const service = spawn(process.execPath, [SERVICE], { env: { ...process.env, DEVTOOLS: `http://127.0.0.1:${port}` }, stdio: ['pipe', 'pipe', 'pipe'] });
  t.after(async () => {
    service.kill('SIGKILL');
    const gone = new Promise((resolve) => browser.once('exit', resolve));
    try { process.kill(-browser.pid, 'SIGKILL'); } catch { browser.kill('SIGKILL'); }
    await gone;
    site.closeAllConnections();
    await new Promise((resolve) => site.close(resolve));
    try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch { /* a temporary folder */ }
  });
  const answers = new Map();
  const waiting = new Map();
  let buffer = '';
  service.stdout.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    for (let at = buffer.indexOf('\n'); at !== -1; at = buffer.indexOf('\n')) {
      const message = JSON.parse(buffer.slice(0, at)); buffer = buffer.slice(at + 1);
      answers.set(message.id, message.result); waiting.get(message.id)?.(message.result);
    }
  });
  const ask = (id, action) => new Promise((resolve) => { waiting.set(id, resolve); service.stdin.write(`${JSON.stringify({ id, action })}\n`); });
  for (let i = 0; i < 240; i += 1) { try { await fetch(`http://127.0.0.1:${port}/json/version`); break; } catch { await new Promise((resolve) => setTimeout(resolve, 250)); } }

  const opened = await ask(1, { type: 'navigate', url: `http://127.0.0.1:${site.address().port}/` });
  assert.equal(opened.ok, true); assert.equal(opened.title, 'Service page');
  assert.ok(Number.isInteger(opened.scriptMs) && opened.scriptMs >= 0, 'how long the action took in here');

  service.stdin.write('this is not json\n');
  service.stdin.write(`${JSON.stringify({ id: 'not a number', action: { type: 'wait', ms: 1 } })}\n`);
  const [look, picture, bad] = await Promise.all([ask(2, { type: 'snapshot' }), ask(3, { type: 'screenshot', format: 'jpeg', quality: 40 }), ask(4, { type: 'click', ref: '3' })]);
  assert.ok(look.ok && look.elements.some((e) => e.role === 'button' && e.name === 'Go'));
  assert.ok(picture.ok && picture.mime === 'image/jpeg' && picture.base64.length > 100);
  assert.equal(bad.ok, false); assert.match(bad.error, /ref must be a number/);
  assert.equal((await ask(5, { type: 'wait', ms: 10 })).ok, true, 'it goes on after an error');
  assert.deepEqual([...answers.keys()].sort(), [1, 2, 3, 4, 5], 'one answer for each line that had a number');

  const ended = new Promise((resolve) => service.once('exit', resolve));
  service.stdin.end();
  assert.equal(await ended, 0, 'it ends when its input does');
});
