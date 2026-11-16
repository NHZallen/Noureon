// The docker command lines of browser-host (browser-host/docker-args.mjs): every safety flag is pinned, and nothing from outside can add a flag.
import test from 'node:test';
import assert from 'node:assert/strict';
import { holderRunArgs, browserRunArgs, sidecarArgs, profileLoadArgs, profileSaveArgs, volumeCreateArgs, containerName, volumeName, checkSessionId, checkScreen, BROWSER_CAPS, PROFILE_EXCLUDES } from '../browser-host/docker-args.mjs';

const GOOD = {
  sessionId: 'sess-12345678', screen: { w: 1024, h: 768 }, userPassword: 'a'.repeat(24), adminPassword: 'b'.repeat(24),
  confPath: '/opt/noureon-browser/chromium.conf', policiesPath: '/opt/noureon-browser/policies.json', seccompPath: '/opt/noureon-browser/chromium-seccomp.json'
};
const pairs = (args) => args.map((arg, i) => `${arg} ${args[i + 1] ?? ''}`.trim());

test('the browser container: no capabilities except the six, no new privileges, the seccomp profile, limits, the isolated network, no published ports', () => {
  const args = browserRunArgs(GOOD);
  assert.equal(args[0], 'run'); assert.ok(args.includes('-d'));
  assert.ok(args.includes('--cap-drop=ALL'));
  assert.deepEqual(args.filter((a) => a.startsWith('--cap-add=')).sort(), BROWSER_CAPS.map((c) => `--cap-add=${c}`).sort());
  assert.ok(pairs(args).includes('--security-opt no-new-privileges'));
  assert.ok(args.includes(`seccomp=${GOOD.seccompPath}`));
  assert.ok(pairs(args).includes('--network noureon-browser'));
  assert.ok(pairs(args).includes('--restart no'));
  assert.ok(pairs(args).includes('--memory 2g') && pairs(args).includes('--memory-swap 2g'), 'memory is limited and swap is off');
  assert.ok(args.includes('--pids-limit'));
  assert.equal(args.at(-1), 'ghcr.io/m1k1o/neko/chromium:latest');
});

test('the browser container never gets what would break out: no privileged mode, no host network or pid, no published port, no docker socket, no host paths except two read-only files', () => {
  const args = browserRunArgs(GOOD);
  // Exact flags (a substring test would trip over the harmless --pids-limit).
  const forbiddenFlags = ['--privileged', '--pid', '--ipc', '--uts', '--userns', '--device', '--publish', '-p', '--publish-all', '-P', '--net', '--add-host', '--dns', '--volumes-from'];
  for (const flag of forbiddenFlags) assert.ok(!args.some((a) => a === flag || a.startsWith(`${flag}=`)), `must not contain ${flag}`);
  assert.ok(!args.includes('host') && !args.some((a) => a === '--network=host' || a === 'container:x'), 'never the host network');
  for (const bad of ['--cap-add=SYS_ADMIN', '--cap-add=ALL', '--cap-add=SYS_PTRACE', '--cap-add=NET_ADMIN', '--cap-add=NET_RAW']) assert.ok(!args.includes(bad), `must not contain ${bad}`);
  const text = args.join(' ');
  for (const bad of ['docker.sock', 'apparmor=unconfined', 'seccomp=unconfined', '/var/run', ':/host']) assert.ok(!text.includes(bad), `must not contain ${bad}`);
  const mounts = browserRunArgs(GOOD).filter((a, i, all) => all[i - 1] === '-v' || all[i - 1] === '--mount');
  assert.equal(mounts.length, 3, 'the profile volume and exactly two read-only files (the Chromium conf and the policies)');
  const files = mounts.filter((m) => !m.startsWith('type=volume'));
  assert.equal(files.length, 2);
  assert.ok(files.every((m) => m.endsWith(':ro')), 'the two files are read-only');
  assert.ok(!browserRunArgs(GOOD).includes('--remote-allow-origins=*'));
});

test('the profile is a volume in memory (tmpfs) of its own and the container is labelled so that leftovers can be found', () => {
  const create = volumeCreateArgs({ sessionId: GOOD.sessionId });
  assert.ok(create.includes('type=tmpfs') && create.includes('device=tmpfs'));
  assert.ok(create.some((a) => a.startsWith('o=size=512m,uid=1000,gid=1000')));
  assert.equal(create.at(-1), volumeName(GOOD.sessionId));
  assert.ok(volumeCreateArgs({ sessionId: GOOD.sessionId, sizeMb: 99999 }).some((a) => a.startsWith('o=size=1024m')), 'the size is capped');
  const args = browserRunArgs(GOOD);
  assert.ok(args.includes(`type=volume,src=${volumeName(GOOD.sessionId)},dst=/home/neko/.config/chromium`));
  assert.ok(pairs(args).includes('--label noureon.browser=1'));
});

test('the helpers that unpack and pack the profile have no network, no capabilities, a read-only root, and see only their own volume', () => {
  for (const args of [profileLoadArgs(GOOD), profileSaveArgs(GOOD)]) {
    assert.ok(pairs(args).includes('--network none') && args.includes('--cap-drop=ALL') && args.includes('--read-only'));
    assert.ok(pairs(args).includes('--user 1000:1000'));
    assert.equal(args.filter((a) => a === '-v').length, 1);
  }
  assert.ok(profileSaveArgs(GOOD).some((a) => a.endsWith(':/data:ro')), 'packing reads the volume read-only');
  for (const name of PROFILE_EXCLUDES) assert.ok(pairs(profileSaveArgs(GOOD)).includes(`--exclude ${name}`), `${name} is left out`);
});

test('a DevTools action runs in a throw-away container in the browser network, with nothing else', () => {
  const args = sidecarArgs({ sessionId: GOOD.sessionId, scriptPath: '/opt/noureon-browser/cdp-actions.mjs', action: { type: 'navigate', url: 'https://example.com/' } });
  assert.ok(pairs(args).includes(`--network container:${containerName(GOOD.sessionId)}`));
  assert.ok(args.includes('--cap-drop=ALL') && args.includes('--read-only') && pairs(args).includes('--user 65534:65534'));
  assert.equal(args.at(-1), JSON.stringify({ type: 'navigate', url: 'https://example.com/' }), 'the action is one argument, never a shell string');
  assert.throws(() => sidecarArgs({ sessionId: GOOD.sessionId, scriptPath: '/x y', action: {} }), /script path/);
  assert.throws(() => sidecarArgs({ sessionId: GOOD.sessionId, scriptPath: '/x', action: { big: 'a'.repeat(9000) } }), /too large/);
});

test('nothing from outside can become a flag: ids, screen, paths, passwords and names are all checked', () => {
  for (const id of ['--privileged', '-v', 'a b c d e f g h', 'x;y;z;1234', '../../../etc', '', 'short', 'a'.repeat(65), 'ok_ok_ok$(id)', 'name\nname1234', null, 12345678]) {
    assert.throws(() => checkSessionId(id), /bad session id/, String(id));
    assert.throws(() => browserRunArgs({ ...GOOD, sessionId: id }), /bad session id/);
  }
  assert.throws(() => checkScreen({ w: 100, h: 768 }), /screen/);
  assert.throws(() => checkScreen({ w: 99999, h: 768 }), /screen/);
  assert.throws(() => checkScreen({ w: '1024; rm', h: 768 }), /screen/);
  assert.deepEqual(checkScreen({}), { w: 1024, h: 768 });
  for (const field of ['confPath', 'policiesPath', 'seccompPath']) {
    for (const bad of ['relative/path', '/with space/x', '/a,b', '/a:b', '/a=b', undefined]) assert.throws(() => browserRunArgs({ ...GOOD, [field]: bad }), /bad/, `${field} ${bad}`);
  }
  for (const bad of ['short', 'z'.repeat(24), 'a'.repeat(24) + ' --privileged', undefined]) assert.throws(() => browserRunArgs({ ...GOOD, userPassword: bad }), /password/);
  for (const bad of ['--privileged', 'a b', 'img;rm', '']) {
    assert.throws(() => browserRunArgs({ ...GOOD, image: bad }), /bad image/);
    assert.throws(() => browserRunArgs({ ...GOOD, network: bad }), /bad network/);
    assert.throws(() => browserRunArgs({ ...GOOD, memory: bad }), /bad memory/);
  }
});

test('an optional cgroup parent is added only when given, and checked', () => {
  assert.ok(!browserRunArgs(GOOD).includes('--cgroup-parent'));
  assert.ok(pairs(browserRunArgs({ ...GOOD, cgroupParent: 'noureon-browser.slice' })).includes('--cgroup-parent noureon-browser.slice'));
  assert.throws(() => browserRunArgs({ ...GOOD, cgroupParent: '--privileged' }), /cgroup/);
});

test('the container that keeps the profile volume mounted has no network, no capabilities and nothing but that volume (read-only)', () => {
  const args = holderRunArgs({ sessionId: GOOD.sessionId });
  const text = args.join(' ');
  assert.ok(text.includes('--network none') && args.includes('--cap-drop=ALL') && args.includes('--read-only') && text.includes('no-new-privileges'));
  assert.ok(text.includes(`-v ${volumeName(GOOD.sessionId)}:/data:ro`));
  assert.ok(text.includes('noureon.browser=1') && text.includes(`noureon.session=${GOOD.sessionId}`));
  for (const bad of ['--privileged', '--pid', '--net=host']) assert.ok(!args.includes(bad), bad);
  assert.ok(!text.includes('docker.sock'));
  assert.throws(() => holderRunArgs({ sessionId: '--privileged' }));
});
