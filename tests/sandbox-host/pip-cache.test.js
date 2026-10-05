import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { PipCacheError, createDockerPipInstaller, createPipCache, pipCommandsOf, pipToolName } from '../../sandbox-host/runner/pip-cache.js';

const MB = 1024 * 1024;
const folder = () => mkdtempSync(join(tmpdir(), 'noureon-pipcache-'));
const PIP = { package: 'twitter-cli', version: '0.8.5', command: 'twitter' };

/** An installer that puts a tool of `size` bytes with its program in the folder it is given. */
const fakeInstaller = ({ size = 1024, program = true, fail = null } = {}) => {
  const calls = [];
  const install = async ({ package: pkg, version, target }) => {
    calls.push({ pkg, version, target });
    if (fail) throw fail;
    if (program) {
      mkdirSync(join(target, 'bin'), { recursive: true });
      writeFileSync(join(target, 'bin', 'twitter'), '#!/usr/bin/python\n');
    }
    writeFileSync(join(target, 'payload.bin'), Buffer.alloc(size));
  };
  return { install, calls };
};

test('a tool is installed once and then found: the same folder for every reply, and two at the same moment share one install', async () => {
  const dir = folder();
  try {
    const { install, calls } = fakeInstaller();
    const cache = createPipCache({ dir, install });
    const [a, b] = await Promise.all([cache.ensure(PIP), cache.ensure(PIP)]);
    assert.equal(a.name, 'twitter-cli-0.8.5');
    assert.equal(a.path, join(dir, 'twitter-cli-0.8.5'));
    assert.equal(b.path, a.path);
    assert.equal(calls.length, 1, 'one install for both');
    assert.ok(existsSync(join(a.path, 'bin', 'twitter')));
    assert.deepEqual(readdirSync(dir), ['twitter-cli-0.8.5'], 'no partial folder is left');
    await cache.ensure(PIP);
    assert.equal(calls.length, 1, 'found, not installed again');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('what is not a valid tool is refused, and a failed install leaves nothing behind and says why', async () => {
  const dir = folder();
  try {
    const cache = createPipCache({ dir, install: fakeInstaller().install });
    for (const bad of [{ ...PIP, package: '../x' }, { ...PIP, package: 'a b' }, { ...PIP, version: '1.0; rm' }, { ...PIP, version: 'latest' }, { package: 'x', version: '1', command: '../bin' }, { package: 'x', version: '1' }]) {
      await assert.rejects(() => cache.ensure(bad), (error) => error instanceof PipCacheError && error.code === 'bad_request');
    }
    const failing = createPipCache({ dir, install: fakeInstaller({ fail: new PipCacheError('install_failed', 'no matching wheel') }).install });
    await assert.rejects(() => failing.ensure(PIP), (error) => error.code === 'install_failed' && /no matching wheel/.test(error.message));
    const noProgram = createPipCache({ dir, install: fakeInstaller({ program: false }).install });
    await assert.rejects(() => noProgram.ensure(PIP), (error) => error.code === 'no_program');
    assert.deepEqual(readdirSync(dir), [], 'nothing left of the failures');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the cache is kept to its size: the tool unused for longest goes first, never the one just installed or one used a moment ago', async () => {
  const dir = folder();
  try {
    let clock = Date.parse('2026-10-05T00:00:00Z');
    const { install } = fakeInstaller({ size: 2 * MB });
    const cache = createPipCache({ dir, install, maxBytes: 5 * MB, now: () => clock, idleMs: 10 * 60_000 });
    const names = [];
    for (const version of ['1.0', '2.0', '3.0']) {
      clock += 60 * 60_000;
      names.push((await cache.ensure({ package: 'tool', version, command: 'twitter' })).name);
    }
    assert.deepEqual(readdirSync(dir).sort(), ['tool-2.0', 'tool-3.0'], 'the oldest was removed to get under 5 MB');
    // Used again: it is the newest now, and so the next one to go is the other.
    clock += 60 * 60_000;
    await cache.ensure({ package: 'tool', version: '2.0', command: 'twitter' });
    clock += 60 * 60_000;
    await cache.ensure({ package: 'tool', version: '4.0', command: 'twitter' });
    assert.deepEqual(readdirSync(dir).sort(), ['tool-2.0', 'tool-4.0']);
    // Nothing used in the last ten minutes is taken, even over the size.
    clock += 1000;
    await cache.ensure({ package: 'tool', version: '5.0', command: 'twitter' });
    assert.ok(readdirSync(dir).includes('tool-5.0') && readdirSync(dir).includes('tool-4.0'), 'tool-4.0 was used a second ago, tool-5.0 was just installed');
    // A partial install of an earlier run goes once it is old.
    const part = join(dir, 'tool-9.9.part-1-2');
    mkdirSync(part);
    utimesSync(part, new Date(clock - 2 * 3_600_000), new Date(clock - 2 * 3_600_000));
    cache.trim('none');
    assert.equal(existsSync(part), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the names: a folder per package and version, and the commands of a tool', () => {
  assert.equal(pipToolName('Twitter_CLI', '0.8.5'), 'twitter-cli-0.8.5');
  assert.deepEqual(pipCommandsOf({ command: 'rdt' }), ['rdt']);
  assert.deepEqual(pipCommandsOf({ command: 'csvstat', commands: ['csvstat', 'csvcut', 'csvcut', '../bad', 'a b'] }), ['csvstat', 'csvcut']);
});

test('the container that installs a tool has the network pip needs and nothing else: read only, no rights, limited, wheels only', async () => {
  const seen = [];
  const make = (exit, stderr = '') => createDockerPipInstaller({
    dockerBin: 'docker', image: 'noureon-sandbox:1', owner: '65534:65534',
    spawn: (bin, args) => {
      seen.push(args);
      const listeners = {};
      const stderrListeners = [];
      const child = {
        stderr: { on: (event, fn) => stderrListeners.push(fn) },
        on: (event, fn) => { listeners[event] = fn; }
      };
      if (args[0] === 'run') setTimeout(() => { stderrListeners.forEach((fn) => fn(Buffer.from(stderr))); listeners.exit?.(exit); }, 1);
      return child;
    }
  });
  await make(0)({ package: 'twitter-cli', version: '0.8.5', target: '/data/pip-cache/x.part-1' });
  const joined = seen[0].join(' ');
  for (const wanted of ['--read-only', '--cap-drop ALL', '--security-opt no-new-privileges', '--pids-limit 256', '--memory 1g', '--user 65534:65534', '-v /data/pip-cache/x.part-1:/target:rw', '--entrypoint python noureon-sandbox:1', '--only-binary :all:', '--target /target', 'twitter-cli==0.8.5']) {
    assert.ok(joined.includes(wanted), wanted);
  }
  assert.ok(joined.includes('--network host'), 'the machine\'s network: Docker there does not give a container of its own one');
  assert.equal(joined.includes('--network none'), false);
  assert.equal(joined.includes('--privileged'), false);
  assert.equal(seen[0].filter((arg) => arg === '-v').length, 1, 'only the folder being filled is mounted');
  await assert.rejects(() => make(1, 'ERROR: x\nERROR: No matching distribution found for twitter-cli==9\n')({ package: 'twitter-cli', version: '9', target: '/t' }), (error) => error.code === 'install_failed' && /No matching distribution/.test(error.message));
});
