// The exact `docker` command lines of browser-host, as pure functions (no Docker is run here). Every value that can come from outside (session id, user id,
// screen size) is checked before it is put into a command line, and the lines are lists of arguments for execFile (no shell), so nothing a caller sends can become
// an extra flag. The tests pin every safety flag. Design doc §4.1 and §10; the privileges are the ones round nine proved enough (§3.4).

export const IMAGE = 'ghcr.io/m1k1o/neko/chromium:latest';          // P1 pins a digest in host.env (BROWSER_IMAGE)
export const HELPER_IMAGE = 'alpine:3.20';                          // unpacks and packs the profile
export const SIDECAR_IMAGE = 'node:22-alpine';                      // runs the DevTools actions inside the browser's network
export const BROWSER_UID = 1000;                                    // the user "neko" of the image
// What the image's start-up (supervisord, running as root for a moment) needs; the browser itself runs without any of them (round nine).
export const BROWSER_CAPS = ['SETUID', 'SETGID', 'CHOWN', 'DAC_OVERRIDE', 'FOWNER', 'KILL'];
export const PROFILE_MOUNT = '/home/neko/.config/chromium';          // --user-data-dir of the Chromium conf
export const PROFILE_EXCLUDES = ['Cache', 'Code Cache', 'GPUCache', 'Service Worker/CacheStorage', 'ShaderCache', 'GrShaderCache', 'DawnCache'];

const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$/;
// Must not start with '-': the image is a free argument at the end of the line, and a value like '--privileged' there would be read as a flag.
const SAFE_TEXT = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]*$/;

export function checkSessionId(id) {
  if (typeof id !== 'string' || !SESSION_ID.test(id)) throw new Error('bad session id');
  return id;
}
export function checkScreen(screen = {}) {
  const w = Number(screen.w ?? 1024); const h = Number(screen.h ?? 768);
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 320 || h < 320 || w > 1920 || h > 1920) throw new Error('bad screen size');
  return { w, h };
}
const checkText = (value, what) => { if (typeof value !== 'string' || !value || !SAFE_TEXT.test(value)) throw new Error(`bad ${what}`); return value; };

export const containerName = (sessionId) => `noureon-browser-${checkSessionId(sessionId)}`;
export const volumeName = (sessionId) => `noureon-profile-${checkSessionId(sessionId)}`;

/** The profile lives in memory (tmpfs): nothing of it reaches the disk of this machine, and removing the volume removes it. */
export function volumeCreateArgs({ sessionId, sizeMb = 512 }) {
  const size = Math.max(16, Math.min(1024, Math.floor(Number(sizeMb)) || 512));
  return ['volume', 'create', '--driver', 'local', '--opt', 'type=tmpfs', '--opt', 'device=tmpfs', '--opt', `o=size=${size}m,uid=${BROWSER_UID},gid=${BROWSER_UID},mode=0700`,
    '--label', 'noureon.browser=1', '--label', `noureon.session=${checkSessionId(sessionId)}`, volumeName(sessionId)];
}

export const holderName = (sessionId) => `noureon-hold-${checkSessionId(sessionId)}`;

/**
 * A volume of type tmpfs exists only while some container has it mounted: when the last one stops, its contents are gone (seen on the real machine: the login state
 * unpacked by the helper vanished before the browser started, and the pack after the browser stopped was empty). This small container does nothing but keep the volume mounted
 * from before the login state is unpacked until the volume is removed. No network, no capabilities, nothing but that volume.
 */
export function holderRunArgs({ sessionId }) {
  return ['run', '-d', '--name', holderName(sessionId), '--network', 'none', '--cap-drop=ALL', '--security-opt', 'no-new-privileges', '--read-only', '--user', `${BROWSER_UID}:${BROWSER_UID}`,
    '--memory', '16m', '--pids-limit', '8', '--label', 'noureon.browser=1', '--label', `noureon.session=${checkSessionId(sessionId)}`, '--label', 'noureon.role=holder',
    '-v', `${volumeName(sessionId)}:/data:ro`, HELPER_IMAGE, 'sleep', '2147483647'];
}
export const holderRemoveArgs = (sessionId) => ['rm', '-f', holderName(sessionId)];

const helperBase = (mount) => ['run', '--rm', '-i', '--network', 'none', '--cap-drop=ALL', '--security-opt', 'no-new-privileges', '--read-only', '--user', `${BROWSER_UID}:${BROWSER_UID}`,
  '--memory', '256m', '--pids-limit', '64', '-v', mount, HELPER_IMAGE];

/** Unpacks a profile archive (tar.gz on stdin) into the volume. No network, no capabilities, only that volume visible. */
export function profileLoadArgs({ sessionId }) {
  return [...helperBase(`${volumeName(sessionId)}:/data`), 'tar', 'xzf', '-', '-C', '/data'];
}
/** Packs the volume (tar.gz on stdout), without the caches. The volume is mounted read-only. */
export function profileSaveArgs({ sessionId }) {
  return [...helperBase(`${volumeName(sessionId)}:/data:ro`), 'tar', 'czf', '-', ...PROFILE_EXCLUDES.flatMap((name) => ['--exclude', name]), '-C', '/data', '.'];
}

/**
 * options: sessionId, screen {w,h}, userPassword, adminPassword (random, per session), confPath, policiesPath, seccompPath (absolute, on this machine),
 * network, image, memory, shmSize, pidsLimit, cgroupParent (optional)
 */
export function browserRunArgs(options) {
  const { sessionId, confPath, policiesPath, seccompPath, userPassword, adminPassword } = options;
  const screen = checkScreen(options.screen);
  const network = checkText(options.network ?? 'noureon-browser', 'network');
  const image = checkText(options.image ?? IMAGE, 'image');
  const memory = checkText(options.memory ?? '2g', 'memory');
  const shm = checkText(options.shmSize ?? '1g', 'shm size');
  const pids = Math.max(64, Math.min(4096, Math.floor(Number(options.pidsLimit)) || 1024));
  for (const [what, value] of [['conf path', confPath], ['policies path', policiesPath], ['seccomp path', seccompPath]]) {
    if (typeof value !== 'string' || !value.startsWith('/') || /[\s,:=]/.test(value)) throw new Error(`bad ${what}`);
  }
  for (const [what, value] of [['user password', userPassword], ['admin password', adminPassword]]) {
    if (typeof value !== 'string' || !/^[0-9a-f]{24,64}$/.test(value)) throw new Error(`bad ${what}`);
  }
  const args = ['run', '-d', '--name', containerName(sessionId), '--network', network, '--restart', 'no',
    '--label', 'noureon.browser=1', '--label', `noureon.session=${sessionId}`,
    '--cap-drop=ALL', ...BROWSER_CAPS.flatMap((cap) => [`--cap-add=${cap}`]),
    '--security-opt', 'no-new-privileges', '--security-opt', `seccomp=${seccompPath}`,
    '--memory', memory, '--memory-swap', memory, '--shm-size', shm, '--pids-limit', String(pids)];
  if (options.cgroupParent) args.push('--cgroup-parent', checkText(options.cgroupParent, 'cgroup parent'));
  args.push('--mount', `type=volume,src=${volumeName(sessionId)},dst=${PROFILE_MOUNT}`,
    '-v', `${confPath}:/etc/neko/supervisord/chromium.conf:ro`, '-v', `${policiesPath}:/etc/chromium/policies/managed/policies.json:ro`,
    '-e', `NEKO_DESKTOP_SCREEN=${screen.w}x${screen.h}@20`, '-e', `NEKO_MEMBER_MULTIUSER_USER_PASSWORD=${userPassword}`, '-e', `NEKO_MEMBER_MULTIUSER_ADMIN_PASSWORD=${adminPassword}`,
    image);
  return args;
}

/** One DevTools action, run in a throw-away container that joins the browser's network (the DevTools port is never published). */
export function sidecarArgs({ sessionId, scriptPath, action }) {
  if (typeof scriptPath !== 'string' || !scriptPath.startsWith('/') || /[\s,:=]/.test(scriptPath)) throw new Error('bad script path');
  const json = JSON.stringify(action ?? {});
  if (json.length > 8192) throw new Error('action too large');
  return ['run', '--rm', '--network', `container:${containerName(sessionId)}`, '--cap-drop=ALL', '--security-opt', 'no-new-privileges', '--read-only',
    '--user', '65534:65534', '--memory', '256m', '--pids-limit', '64', '-v', `${scriptPath}:/app/cdp-actions.mjs:ro`, SIDECAR_IMAGE, 'node', '/app/cdp-actions.mjs', json];
}

export const stopArgs = (sessionId) => ['stop', '-t', '10', containerName(sessionId)];
export const removeArgs = (sessionId) => ['rm', '-f', containerName(sessionId)];
export const volumeRemoveArgs = (sessionId) => ['volume', 'rm', '-f', volumeName(sessionId)];
export const healthArgs = (sessionId) => ['inspect', '-f', '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}nohealth{{end}}', containerName(sessionId)];
export const orphanContainersArgs = () => ['ps', '-a', '--filter', 'label=noureon.browser=1', '--format', '{{.Label "noureon.session"}} {{.State}}'];
export const orphanVolumesArgs = () => ['volume', 'ls', '--filter', 'label=noureon.browser=1', '--format', '{{.Label "noureon.session"}}'];
