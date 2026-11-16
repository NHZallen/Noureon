// The settings of browser-host, from the environment (/etc/noureon-browser/host.env through systemd). Every value is checked; a bad one stops the start with a
// plain message (the secrets themselves are never printed).
import path from 'node:path';

const int = (env, name, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) => {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} must be a whole number from ${min} to ${max}`);
  return value;
};
const list = (text) => String(text || '').split(',').map((part) => part.trim()).filter(Boolean);

export function loadConfig(env = process.env) {
  const secrets = list(env.BROWSER_HOST_SECRET);
  if (!secrets.length) throw new Error('BROWSER_HOST_SECRET is empty (put one or two random secrets, 32 characters or more, separated by commas)');
  if (secrets.some((secret) => secret.length < 32)) throw new Error('every secret in BROWSER_HOST_SECRET must be at least 32 characters');
  const allowedIps = list(env.BROWSER_ALLOWED_IPS);
  if (!allowedIps.length) throw new Error('BROWSER_ALLOWED_IPS is empty: list the address or range of the main server (nobody is let in otherwise)');
  const app = env.BROWSER_APP_DIR || '/opt/noureon-browser';
  if (!path.isAbsolute(app)) throw new Error('BROWSER_APP_DIR must be an absolute path');
  const tls = env.BROWSER_HOST_TLS_CERT || env.BROWSER_HOST_TLS_KEY ? { cert: env.BROWSER_HOST_TLS_CERT, key: env.BROWSER_HOST_TLS_KEY } : null;
  if (tls && (!tls.cert || !tls.key)) throw new Error('BROWSER_HOST_TLS_CERT and BROWSER_HOST_TLS_KEY go together');
  const bind = env.BROWSER_HOST_BIND || '127.0.0.1';
  if (!tls && !['127.0.0.1', '::1'].includes(bind) && !/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(bind)) {
    throw new Error('without TLS the service may only listen on a loopback or private address (BROWSER_HOST_BIND); set BROWSER_HOST_TLS_CERT and BROWSER_HOST_TLS_KEY to listen elsewhere');
  }
  return {
    secrets, allowedIps, bind, port: int(env, 'BROWSER_HOST_PORT', 40010, { min: 1024, max: 65535 }), tls,
    manager: {
      enabled: env.BROWSER_ENABLED !== 'false',
      maxSessions: int(env, 'BROWSER_MAX_SESSIONS', 2, { min: 1, max: 8 }),
      maxQueue: int(env, 'BROWSER_MAX_QUEUE', 10, { min: 0, max: 100 }),
      idleMs: int(env, 'BROWSER_IDLE_MINUTES', 60, { min: 1, max: 1440 }) * 60_000,
      taskMaxMs: int(env, 'BROWSER_TASK_MAX_MINUTES', 120, { min: 1, max: 1440 }) * 60_000,
      maxProfileBytes: int(env, 'BROWSER_MAX_PROFILE_MB', 150, { min: 1, max: 1024 }) * 1024 * 1024
    },
    paths: { conf: path.join(app, 'chromium.conf'), policies: path.join(app, 'policies.json'), seccomp: path.join(app, 'chromium-seccomp.json'), cdpScript: path.join(app, 'service', 'cdp-actions.mjs') },
    docker: { network: env.BROWSER_NET_NAME || 'noureon-browser', image: env.BROWSER_IMAGE || undefined, memory: env.BROWSER_MEMORY || '2g', shmSize: env.BROWSER_SHM || '1g', pidsLimit: int(env, 'BROWSER_PIDS', 1024, { min: 64, max: 4096 }), cgroupParent: env.BROWSER_CGROUP_PARENT || undefined, volumeMb: int(env, 'BROWSER_PROFILE_VOLUME_MB', 512, { min: 16, max: 1024 }), maxProfileBytes: int(env, 'BROWSER_MAX_PROFILE_MB', 150, { min: 1, max: 1024 }) * 1024 * 1024 }
  };
}
