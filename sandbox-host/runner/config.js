// The runner's settings, from the environment (a service file sets them on the host).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const number = (value, fallback, min, max) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
};

export function loadConfig(env = process.env) {
  const tokenFile = env.RUNNER_TOKEN_FILE;
  const token = String(env.RUNNER_TOKEN || (tokenFile ? readFileSync(tokenFile, 'utf8') : '')).trim();
  if (token.length < 32) throw new Error('RUNNER_TOKEN (or RUNNER_TOKEN_FILE) must hold a secret of at least 32 characters.');
  const dataDir = env.SANDBOX_DATA_DIR || '/var/lib/noureon-sandbox';
  return Object.freeze({
    // Where it listens: the host's address inside the machine, which the services of the machine reach and the internet does not.
    host: env.RUNNER_HOST || '127.0.0.1',
    port: number(env.RUNNER_PORT, 7788, 1, 65535),
    token,
    // Who may ask (the machine's own pod network and itself), on top of the secret.
    allow: Object.freeze(String(env.RUNNER_ALLOW || '10.42.0.0/16,127.0.0.1/32').split(',').map((entry) => entry.trim()).filter(Boolean)),
    dockerBin: env.DOCKER_BIN || 'docker',
    image: env.SANDBOX_IMAGE || 'noureon-sandbox:1',
    dataDir,
    // The programs of the CLI tools: kept here (inside the data folder, so the machine's Docker sees the same path), fetched only from
    // these hosts, none larger than this.
    cliCacheDir: env.SANDBOX_CLI_CACHE_DIR || join(dataDir, 'cli-cache'),
    cliHosts: Object.freeze(String(env.SANDBOX_CLI_HOSTS || 'github.com,objects.githubusercontent.com,release-assets.githubusercontent.com').split(',').map((entry) => entry.trim()).filter(Boolean)),
    cliMaxBytes: number(env.SANDBOX_CLI_MAX_BYTES, 150 * 1024 * 1024, 1024, 1024 * 1024 * 1024),
    maxSessions: number(env.SANDBOX_MAX_SESSIONS, 2, 1, 8),
    // How long the person is given to answer a question about a site before it counts as a refusal.
    netAskTimeoutMs: number(env.SANDBOX_NET_ASK_MS, 10 * 60_000, 1000, 3_600_000),
    // Per container.
    memory: env.SANDBOX_MEMORY || '2g',
    cpus: env.SANDBOX_CPUS || '2',
    pids: number(env.SANDBOX_PIDS, 256, 16, 4096),
    tmpSize: env.SANDBOX_TMP_SIZE || '256m',
    workSize: env.SANDBOX_WORK_SIZE || '512m',
    // Where Python packages a tool installs go (they may hold programs of their own, so it is the one place besides /opt/cli that may run them).
    pipSize: env.SANDBOX_PIP_SIZE || '512m',
    // A session nobody has used for this long, or that is older than the longest reply, is removed.
    idleMs: number(env.SANDBOX_IDLE_MS, 10 * 60_000, 1000, 24 * 3_600_000),
    maxAgeMs: number(env.SANDBOX_MAX_AGE_MS, 2.5 * 3_600_000, 1000, 24 * 3_600_000),
    startTimeoutMs: number(env.SANDBOX_START_TIMEOUT_MS, 90_000, 1000, 600_000),
    // After a step's own time is up (the program stops itself) the container is killed this much later.
    killGraceMs: number(env.SANDBOX_KILL_GRACE_MS, 8000, 100, 60_000),
    owner: env.SANDBOX_OWNER || '65534:65534'
  });
}
