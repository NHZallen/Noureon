// The runner as a program: `node sandbox-host/runner/main.js`. Settings come from the environment (see config.js).

import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { loadConfig } from './config.js';
import { createHandler } from './http.js';
import { createSessionManager } from './session.js';

const log = (event, fields = {}) => console.log(JSON.stringify({ at: new Date().toISOString(), event, ...fields }));

let config;
try {
  config = loadConfig();
} catch (error) {
  log('config_error', { message: error.message });
  process.exit(1);
}

// Containers left by an earlier run of this program (a crash, a restart) are removed.
try {
  const left = execFileSync(config.dockerBin, ['ps', '-aq', '--filter', 'name=nsb-'], { encoding: 'utf8' }).split('\n').filter(Boolean);
  if (left.length) execFileSync(config.dockerBin, ['rm', '-f', ...left], { stdio: 'ignore' });
  log('cleaned', { containers: left.length });
} catch (error) {
  log('docker_unavailable', { message: String(error.message || '').slice(0, 160) });
  process.exit(1);
}

const manager = createSessionManager({ config, log });
const server = createServer(createHandler({ manager, config, log }));
server.requestTimeout = 0;
server.headersTimeout = 30_000;
server.listen(config.port, config.host, () => log('listening', { host: config.host, port: config.port, image: config.image, maxSessions: config.maxSessions }));
const sweeper = setInterval(() => { manager.sweep().catch(() => {}); }, 30_000);
sweeper.unref();

const stop = async (signal) => {
  log('stopping', { signal });
  server.close();
  await manager.shutdown();
  process.exit(0);
};
process.on('SIGTERM', () => { void stop('SIGTERM'); });
process.on('SIGINT', () => { void stop('SIGINT'); });
