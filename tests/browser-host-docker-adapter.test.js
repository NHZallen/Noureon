// The adapter that runs docker (browser-host/docker-adapter.mjs), with a fake `run`: which command lines, in which order, and what it does with the answers.
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createDockerAdapter, dockerRun, dockerService } from '../browser-host/docker-adapter.mjs';
import { HostError } from '../browser-host/session-manager.mjs';

const PATHS = { conf: '/opt/x/chromium.conf', policies: '/opt/x/policies.json', seccomp: '/opt/x/seccomp.json', cdpScript: '/opt/x/cdp-actions.mjs' };
const S = { sessionId: 'sess-12345678', screen: { w: 1024, h: 768 }, userPassword: 'a'.repeat(24), adminPassword: 'b'.repeat(24) };
const reply = (stdout = '', code = 0, stderr = '', extra = {}) => ({ code, stdout: Buffer.from(stdout), stderr, truncated: false, ...extra });

function setup(script = () => reply(), extra = {}) {
  const calls = [];
  let clock = 0;
  const run = async (args, opts) => { calls.push({ args, opts }); return script(args, opts, calls.length); };
  const adapter = createDockerAdapter({ run, paths: PATHS, now: () => clock, sleep: async (ms) => { clock += ms; }, ...extra });
  return { adapter, calls, run };
}

test('the calls become the exact command lines, in the right place', async () => {
  const t = setup();
  await t.adapter.createVolume(S);
  await t.adapter.loadProfile(S, Buffer.from('archive'));
  await t.adapter.startContainer(S);
  const [volume, holder, load, start] = t.calls;
  assert.deepEqual(volume.args.slice(0, 2), ['volume', 'create']);
  assert.equal(holder.args[0], 'run'); assert.ok(holder.args.includes('-d') && holder.args.includes('--network') && holder.args.includes('none'), 'the volume is kept mounted by a small container before anything is unpacked');
  assert.deepEqual(load.args.slice(-11), ['tar', 'xzf', '-', '--exclude', 'SingletonLock', '--exclude', 'SingletonSocket', '--exclude', 'SingletonCookie', '-C', '/data']);
  assert.equal(load.opts.input.toString(), 'archive', 'the archive goes in on stdin, not on the command line');
  assert.ok(!load.args.join(' ').includes('archive'));
  assert.equal(start.args[0], 'run'); assert.ok(start.args.includes('--cap-drop=ALL')); assert.ok(start.args.includes(`seccomp=${PATHS.seccomp}`));
});

test('waiting for the browser: ready when healthy, an error when the container stops, an error at the deadline', async () => {
  let n = 0;
  const t = setup(() => reply(['running starting', 'running starting', 'running healthy'][n++]));
  await t.adapter.waitReady(S, 60_000);
  assert.equal(t.calls.length, 3);
  await assert.rejects(setup(() => reply('exited unhealthy')).adapter.waitReady(S, 60_000), /stopped while starting/);
  await assert.rejects(setup(() => reply('running starting')).adapter.waitReady(S, 5000), /did not become ready/);
  await setup(() => reply('running nohealth')).adapter.waitReady(S, 5000);
});

test('packing: the bytes come back; a result that was too large is a 413; a failure keeps only the first line of docker\'s message', async () => {
  const packed = `packed-bytes${'.'.repeat(3000)}`;
  const t = setup(() => reply(packed));
  assert.equal((await t.adapter.exportProfile(S)).toString(), packed);
  await assert.rejects(setup(() => reply('x'.repeat(85))).adapter.exportProfile(S), (e) => e instanceof HostError && e.code === 'empty_profile', 'an empty folder packed is not a login state');
  assert.ok(t.calls[0].opts.maxBytes <= 150 * 1024 * 1024);
  await assert.rejects(setup(() => reply('', -1, '', { truncated: true })).adapter.exportProfile(S), (e) => e instanceof HostError && e.status === 413);
  await assert.rejects(setup(() => reply('', 1, 'boom first line\nsecret second line')).adapter.exportProfile(S), (e) => /boom first line/.test(e.message) && !/secret/.test(e.message));
});

test('stopping and removing things that are already gone is fine; real failures are reported', async () => {
  const gone = setup(() => reply('', 1, 'Error: No such container: x'));
  await gone.adapter.stopContainer(S); await gone.adapter.removeContainer(S);
  const goneVolume = setup(() => reply('', 1, 'Error: No such volume: x'));
  await goneVolume.adapter.removeVolume(S);
  await assert.rejects(setup(() => reply('', 1, 'permission denied')).adapter.removeVolume(S), /removing the profile volume failed/);
  const order = setup();
  await order.adapter.removeVolume(S);
  assert.deepEqual(order.calls.map((c) => c.args.slice(0, 2).join(' ')), ['rm -f', 'volume rm'], 'the holder goes first, then the volume');
});

test('a DevTools action: the answer of the sidecar is returned; a failed action is a 400 with its message; silence is a 502', async () => {
  const ok = setup(() => reply('{"ok":true,"tabs":[]}\n'));
  assert.deepEqual(await ok.adapter.action(S, { type: 'tabs', op: 'list' }), { ok: true, tabs: [] });
  assert.ok(ok.calls[0].args.includes(JSON.stringify({ type: 'tabs', op: 'list' })));
  await assert.rejects(setup(() => reply('{"ok":false,"error":"no such tab"}\n', 1)).adapter.action(S, { type: 'tabs', op: 'close', tabId: 'x' }), (e) => e.status === 400 && e.message === 'no such tab');
  await assert.rejects(setup(() => reply('garbage', 1)).adapter.action(S, { type: 'tabs', op: 'list' }), (e) => e.status === 502);
});

test('leftovers: the session ids of containers and volumes with our label', async () => {
  const t = setup((args) => (args[0] === 'ps' ? reply('sess-aaaaaaaa running\nsess-bbbbbbbb exited\n') : reply('sess-cccccccc\n')));
  assert.deepEqual(await t.adapter.listOrphans(), { containers: ['sess-aaaaaaaa', 'sess-bbbbbbbb'], volumes: ['sess-cccccccc'] });
  assert.deepEqual(await setup(() => reply('', 1, 'daemon down')).adapter.listOrphans(), { containers: [], volumes: [] });
});

test('the real runner: it never rejects, and a missing program is reported as a code', async () => {
  // `docker` may not exist here; either way the promise resolves with a result object.
  const result = await dockerRun(['--version'], { timeoutMs: 5000 });
  assert.equal(typeof result.code, 'number');
  assert.ok(Buffer.isBuffer(result.stdout));
});

test('square pixels: ok when the millimetres read back are the ones wanted; any other answer is a short reason, never a throw', async () => {
  const ok = setup(() => reply('1024 768 271 203\n'));
  assert.deepEqual(await ok.adapter.squarePixels(S, { w: 1024, h: 768 }), { ok: true, px: { w: 1024, h: 768 }, mm: { w: 271, h: 203 } });
  assert.deepEqual(ok.calls[0].args.slice(0, 3), ['exec', '-u', 'neko']);
  assert.equal(ok.calls[0].opts.timeoutMs, 10_000);
  const off = await setup(() => reply('1024 768 508 285')).adapter.squarePixels(S, { w: 1024, h: 768 });
  assert.equal(off.ok, false); assert.match(off.why, /read back 508x285 mm, wanted 271x203/);
  assert.deepEqual(await setup(() => reply('', 1, 'Traceback ... https://example.com')).adapter.squarePixels(S, { w: 1024, h: 768 }), { ok: false, why: 'exit 1' });
  assert.deepEqual(await setup(() => reply('', -2)).adapter.squarePixels(S, { w: 1024, h: 768 }), { ok: false, why: 'no answer in 10 s' });
  assert.deepEqual(await setup(() => reply('hello')).adapter.squarePixels(S, { w: 1024, h: 768 }), { ok: false, why: 'nothing read back' });
  const bad = setup();
  assert.deepEqual(await bad.adapter.squarePixels(S, { w: 10, h: 10 }), { ok: false, why: 'bad screen size' });
  assert.equal(bad.calls.length, 0, 'a bad size never reaches docker');
});

// ---- The long-lived sidecar for the actions of a browser ----
const SERVICE_PATHS = { ...PATHS, cdpService: '/opt/x/cdp-service.mjs' };
function fakeService() {
  const made = [];
  const startService = (args) => {
    const handle = { args, written: [], killed: false, line: () => {}, exit: () => {},
      write(text) { handle.written.push(text); return true; }, onLine(cb) { handle.line = cb; }, onExit(cb) { handle.exit = cb; },
      kill() { handle.killed = true; queueMicrotask(() => handle.exit(137, '')); },
      answer(id, result) { handle.line(JSON.stringify({ id, result })); } };
    made.push(handle);
    return handle;
  };
  return { made, startService };
}
const persistent = (script, extra = {}) => { const f = fakeService(); return { ...setup(script, { paths: SERVICE_PATHS, options: { persistentSidecar: true }, startService: f.startService, ...extra }), ...f }; };
const nextTick = () => new Promise((resolve) => setImmediate(resolve));

test('the sidecar: one container for all the actions of a browser, an answer for each by its number, and a secret goes in on the pipe, never on a command line', async () => {
  const t = persistent();
  const first = t.adapter.action(S, { type: 'snapshot' });
  const second = t.adapter.action(S, { type: 'screenshot' });
  const secret = t.adapter.action(S, { type: 'fill-login', username: 'who', password: 'S3cret-pw' });
  await nextTick();
  assert.equal(t.made.length, 1, 'one container, not one for each action');
  assert.equal(t.calls.length, 0, 'no `docker run` for the actions themselves');
  assert.ok(t.made[0].args.includes('--read-only') && t.made[0].args.includes('--cap-drop=ALL') && t.made[0].args.includes(`container:noureon-browser-${S.sessionId}`));
  assert.ok(!t.made[0].args.join(' ').includes('S3cret'), 'no secret on a command line');
  const sent = t.made[0].written.map((line) => JSON.parse(line));
  assert.deepEqual(sent.map((m) => m.action.type), ['snapshot', 'screenshot', 'fill-login']);
  assert.equal(sent[2].action.password, 'S3cret-pw', 'the secret travels on standard input');
  t.made[0].answer(sent[1].id, { ok: true, base64: 'PIC' });
  t.made[0].answer(sent[0].id, { ok: true, elements: [] });
  t.made[0].answer(sent[2].id, { ok: false, error: 'not here' });
  assert.deepEqual(await second, { ok: true, base64: 'PIC' });
  assert.deepEqual(await first, { ok: true, elements: [] });
  await assert.rejects(secret, (error) => error instanceof HostError && error.status === 400 && /not here/.test(error.message));
});

test('the sidecar: started when the browser is ready; it ends with the browser; a dead one is started again by the next action', async () => {
  const t = persistent();
  t.adapter.prepareActions(S);
  assert.equal(t.made.length, 1, 'ready before the first action');
  const pending = t.adapter.action(S, { type: 'snapshot' });
  await nextTick();
  t.made[0].exit(1, 'docker: Error response from daemon: boom');
  await assert.rejects(pending, (error) => error instanceof HostError && error.status === 502 && /exit 1.*boom/.test(error.message));
  const again = t.adapter.action(S, { type: 'wait', ms: 1 });
  await nextTick();
  assert.equal(t.made.length, 2, 'the next action starts a new one');
  t.made[1].answer(JSON.parse(t.made[1].written[0]).id, { ok: true });
  await again;
  await t.adapter.stopContainer(S);
  assert.equal(t.made[1].killed, true);
  assert.ok(t.calls.some((c) => c.args[0] === 'rm' && c.args.includes(`noureon-sidecar-${S.sessionId}`)), 'its container is removed too');
  t.adapter.prepareActions(S);
  assert.equal(t.made.length, 3);
  await t.adapter.removeContainer(S);
  assert.equal(t.made[2].killed, true);
});

test('the sidecar: an action with no answer in time says so and ends the sidecar; an oversized action is refused before it is sent; the other mode keeps a container for each action', async () => {
  const t = persistent();
  const realSetTimeout = global.setTimeout;
  global.setTimeout = (fn, ms, ...rest) => realSetTimeout(fn, ms === 60_000 ? 5 : ms, ...rest);
  try { await assert.rejects(t.adapter.action(S, { type: 'snapshot' }), (error) => error instanceof HostError && /no answer in 60 s/.test(error.message)); } finally { global.setTimeout = realSetTimeout; }
  assert.equal(t.made[0].killed, true);
  await assert.rejects(t.adapter.action(S, { type: 'navigate', url: `https://x.example/${'a'.repeat(9000)}` }), /too large/);
  const oneshot = setup(() => reply('{"ok":true,"title":"T"}'), { paths: SERVICE_PATHS, options: { persistentSidecar: false } });
  assert.equal((await oneshot.adapter.action(S, { type: 'snapshot' })).title, 'T');
  assert.equal(oneshot.calls.length, 1, 'a container run for the action');
  const noPath = setup(() => reply('{"ok":true}'), { options: { persistentSidecar: true } });
  await noPath.adapter.action(S, { type: 'snapshot' });
  assert.equal(noPath.calls.length, 1, 'without the path of the service it is the old way');
});

test('dockerService: lines in, whole lines out (also a very long one that arrives in pieces), one exit, kill, and a line that is too large ends it', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-docker-'));
  fs.writeFileSync(path.join(dir, 'docker'), '#!/usr/bin/env node\nconst rl = require("node:readline").createInterface({ input: process.stdin });\nrl.on("line", (l) => { process.stdout.write(l + "\\n"); });\nrl.on("close", () => process.exit(7));\n', { mode: 0o755 });
  const oldPath = process.env.PATH;
  process.env.PATH = `${dir}:${oldPath}`;
  const started = [];
  try {
    const lines = []; const exits = [];
    const service = dockerService(['run', 'x']);
    started.push(service);
    service.onLine((line) => lines.push(line)); service.onExit((code) => exits.push(code));
    const long = 'x'.repeat(300_000);
    service.write('one\n'); service.write(`${long}\n`); service.write('three\n');
    for (let i = 0; i < 100 && lines.length < 3; i += 1) await new Promise((resolve) => setTimeout(resolve, 50));
    assert.deepEqual(lines, ['one', long, 'three']);
    service.kill();
    for (let i = 0; i < 100 && !exits.length; i += 1) await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(exits.length, 1, 'told once');
    const small = dockerService(['run', 'x'], { maxLineBytes: 1000 }); const codes = [];
    started.push(small);
    small.onLine(() => {}); small.onExit((code) => codes.push(code));
    small.write(`${'y'.repeat(5000)}\n`);
    for (let i = 0; i < 100 && !codes.length; i += 1) await new Promise((resolve) => setTimeout(resolve, 50));
    assert.deepEqual(codes, [-1], 'an answer that is too large ends it');
    const none = dockerService(['run', 'x']);
    started.push(none);
    none.kill();
  } finally { for (const handle of started) handle.kill(); process.env.PATH = oldPath; fs.rmSync(dir, { recursive: true, force: true }); }
});
