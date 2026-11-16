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
// The live screen (design section 6, 12.2). Two H.264 pipelines the viewer chooses between, and only the one somebody watches is run (neko destroys the
// others): `hq` for the focus mode (the size of the screen, 20 fps, 4 Mbps) and `lq` for the preview card (about 640 wide, 15 fps, 1.2 Mbps). `lq` gives only its
// width and lets the height follow (a fixed 640x480 would stretch a 16:9 or an upright screen); that is still to be checked on the real host.
export const LIVE_PIPELINES = Object.freeze({
  hq: { fps: '20', gst_prefix: '! video/x-raw,format=I420', gst_encoder: 'x264enc', gst_params: { threads: '2', bitrate: '4000', 'key-int-max': '20', 'byte-stream': 'true', tune: 'zerolatency', 'speed-preset': 'veryfast' }, gst_suffix: '! video/x-h264,stream-format=byte-stream' },
  lq: { fps: '15', gst_prefix: '! videoscale ! video/x-raw,width=640,format=I420', gst_encoder: 'x264enc', gst_params: { threads: '2', bitrate: '1200', 'key-int-max': '15', 'byte-stream': 'true', tune: 'zerolatency', 'speed-preset': 'ultrafast' }, gst_suffix: '! video/x-h264,stream-format=byte-stream' }
});
const IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;
/** What the live screen needs of one browser: `apiToken` (random, kept on this machine only), `udpPort` (one port for UDP and TCP, one per browser), `publicIp`, `bindIp` (where the port is published). */
export function checkLive(live) {
  if (!live || typeof live !== 'object') throw new Error('bad live settings');
  const { apiToken, udpPort, publicIp } = live;
  const bindIp = live.bindIp ?? publicIp;
  if (typeof apiToken !== 'string' || !/^[0-9a-f]{32,64}$/.test(apiToken)) throw new Error('bad live api token');
  if (!Number.isInteger(udpPort) || udpPort < 1024 || udpPort > 65535) throw new Error('bad live port');
  if (typeof publicIp !== 'string' || !IPV4.test(publicIp)) throw new Error('bad live public ip');
  if (typeof bindIp !== 'string' || !IPV4.test(bindIp)) throw new Error('bad live bind ip');
  return { apiToken, udpPort, publicIp, bindIp };
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
 * network, image, memory, shmSize, pidsLimit, cgroupParent (optional), live (optional: see checkLive; without it nothing is published and the members are the two passwords)
 */
export function browserRunArgs(options) {
  const { sessionId, confPath, policiesPath, seccompPath } = options;
  const live = options.live ? checkLive(options.live) : null;
  const userPassword = live ? null : options.userPassword;
  const adminPassword = live ? null : options.adminPassword;
  const screen = checkScreen(options.screen);
  const network = checkText(options.network ?? 'noureon-browser', 'network');
  const image = checkText(options.image ?? IMAGE, 'image');
  const memory = checkText(options.memory ?? '2g', 'memory');
  const shm = checkText(options.shmSize ?? '1g', 'shm size');
  const pids = Math.max(64, Math.min(4096, Math.floor(Number(options.pidsLimit)) || 1024));
  for (const [what, value] of [['conf path', confPath], ['policies path', policiesPath], ['seccomp path', seccompPath]]) {
    if (typeof value !== 'string' || !value.startsWith('/') || /[\s,:=]/.test(value)) throw new Error(`bad ${what}`);
  }
  if (!live) {
    for (const [what, value] of [['user password', userPassword], ['admin password', adminPassword]]) {
      if (typeof value !== 'string' || !/^[0-9a-f]{24,64}$/.test(value)) throw new Error(`bad ${what}`);
    }
  }
  const args = ['run', '-d', '--name', containerName(sessionId), '--network', network, '--restart', 'no',
    '--label', 'noureon.browser=1', '--label', `noureon.session=${sessionId}`,
    '--cap-drop=ALL', ...BROWSER_CAPS.flatMap((cap) => [`--cap-add=${cap}`]),
    '--security-opt', 'no-new-privileges', '--security-opt', `seccomp=${seccompPath}`,
    '--memory', memory, '--memory-swap', memory, '--shm-size', shm, '--pids-limit', String(pids)];
  if (options.cgroupParent) args.push('--cgroup-parent', checkText(options.cgroupParent, 'cgroup parent'));
  args.push('--mount', `type=volume,src=${volumeName(sessionId)},dst=${PROFILE_MOUNT}`,
    '-v', `${confPath}:/etc/neko/supervisord/chromium.conf:ro`, '-v', `${policiesPath}:/etc/chromium/policies/managed/policies.json:ro`,
    '-e', `NEKO_DESKTOP_SCREEN=${screen.w}x${screen.h}@20`);
  if (live) {
    // Members are made and removed from this machine with the api token (one for each person who looks, gone when they leave); nobody can control until they are given it.
    // One port (UDP and TCP) for all of this browser's WebRTC, shown to the viewer as the public address; no third-party STUN (the browser cannot reach one, and the
    // viewer's address is not told to anyone else).
    args.push('-p', `${live.bindIp}:${live.udpPort}:${live.udpPort}/udp`, '-p', `${live.bindIp}:${live.udpPort}:${live.udpPort}/tcp`);
    for (const [name, value] of [
      ['NEKO_MEMBER_PROVIDER', 'file'], ['NEKO_MEMBER_FILE_PATH', '/tmp/neko-members.json'], ['NEKO_SESSION_API_TOKEN', live.apiToken], ['NEKO_SESSION_LOCKED_CONTROLS', 'true'],
      ['NEKO_WEBRTC_UDPMUX', String(live.udpPort)], ['NEKO_WEBRTC_TCPMUX', String(live.udpPort)], ['NEKO_WEBRTC_NAT1TO1', live.publicIp],
      ['NEKO_WEBRTC_ICESERVERS_BACKEND', '[]'], ['NEKO_WEBRTC_ICESERVERS_FRONTEND', '[]'],
      ['NEKO_CAPTURE_VIDEO_CODEC', 'h264'], ['NEKO_CAPTURE_VIDEO_IDS', 'hq lq'], ['NEKO_CAPTURE_VIDEO_PIPELINES', JSON.stringify(LIVE_PIPELINES)]
    ]) args.push('-e', `${name}=${value}`);
  } else {
    args.push('-e', `NEKO_MEMBER_MULTIUSER_USER_PASSWORD=${userPassword}`, '-e', `NEKO_MEMBER_MULTIUSER_ADMIN_PASSWORD=${adminPassword}`);
  }
  args.push(image);
  return args;
}

/** The actions that carry a secret (a password, a card): their body goes in through standard input, never as an argument (an argument is in the process list of the machine). */
export const SECRET_ACTIONS = Object.freeze(['fill-login', 'fill-code', 'fill-card']);
const MAX_STDIN_ACTION = 32 * 1024;
/** The actions whose body goes in through standard input: the ones with a secret, and the one that carries a file (too large for an argument). */
export const STDIN_ACTIONS = Object.freeze([...SECRET_ACTIONS, 'upload']);
export const MAX_UPLOAD_ACTION = 12 * 1024 * 1024;

/** One DevTools action, run in a throw-away container that joins the browser's network (the DevTools port is never published). */
export function sidecarArgs({ sessionId, scriptPath, action }) {
  if (typeof scriptPath !== 'string' || !scriptPath.startsWith('/') || /[\s,:=]/.test(scriptPath)) throw new Error('bad script path');
  const json = JSON.stringify(action ?? {});
  const viaStdin = STDIN_ACTIONS.includes(action?.type);
  if (json.length > (action?.type === 'upload' ? MAX_UPLOAD_ACTION : viaStdin ? MAX_STDIN_ACTION : 8192)) throw new Error('action too large');
  return ['run', '--rm', ...(viaStdin ? ['-i'] : []), '--network', `container:${containerName(sessionId)}`, '--cap-drop=ALL', '--security-opt', 'no-new-privileges', '--read-only',
    '--user', '65534:65534', '--memory', '256m', '--pids-limit', '64', '-v', `${scriptPath}:/app/cdp-actions.mjs:ro`, SIDECAR_IMAGE, 'node', '/app/cdp-actions.mjs', viaStdin ? '--stdin' : json];
}

/** The address of the browser container on the isolated network (what the live screen and its proxy talk to). */
export const ipArgs = (sessionId) => ['inspect', '-f', '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}', containerName(sessionId)];
export const stopArgs = (sessionId) => ['stop', '-t', '10', containerName(sessionId)];
export const removeArgs = (sessionId) => ['rm', '-f', containerName(sessionId)];
export const volumeRemoveArgs = (sessionId) => ['volume', 'rm', '-f', volumeName(sessionId)];
export const healthArgs = (sessionId) => ['inspect', '-f', '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}nohealth{{end}}', containerName(sessionId)];
export const orphanContainersArgs = () => ['ps', '-a', '--filter', 'label=noureon.browser=1', '--format', '{{.Label "noureon.session"}} {{.State}}'];
export const orphanVolumesArgs = () => ['volume', 'ls', '--filter', 'label=noureon.browser=1', '--format', '{{.Label "noureon.session"}}'];
