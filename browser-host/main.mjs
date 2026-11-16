// Starts browser-host: reads the settings, removes what an earlier run left behind, serves the routes, and checks the clocks every 10 seconds.
//   node main.mjs        (the systemd unit noureon-browser-host.service runs this; settings come from /etc/noureon-browser/host.env)
import os from 'node:os';
import { loadConfig } from './config.mjs';
import { createVerifier } from './auth.mjs';
import { createDockerAdapter } from './docker-adapter.mjs';
import { createSessionManager } from './session-manager.mjs';
import { createServer } from './server.mjs';

const log = (entry) => console.log(JSON.stringify({ t: new Date().toISOString(), ...entry }));
let config;
try { config = loadConfig(process.env); } catch (error) { console.error(`browser-host cannot start: ${error.message}`); process.exit(78); }

const adapter = createDockerAdapter({ paths: config.paths, options: config.docker });
const manager = createSessionManager({ adapter, config: config.manager, log });
// A program on this machine (the installer's health check, the acceptance scripts) shows as its source whichever address of the machine the kernel picks: the bridge address while
// the bridge is up, the public address while no browser is running and the bridge has no carrier (seen on the real machine, 2026-11-16). So the machine's own addresses count as "this machine".
// Nobody outside can have one of them as a source (the kernel drops such packets), the service listens on the private bridge only, and every request still has to be signed.
const isLocalAddress = (ip) => Object.values(os.networkInterfaces()).flat().some((entry) => entry && entry.family === 'IPv4' && entry.address === ip);
const verifier = createVerifier({ secrets: config.secrets, allowedIps: config.allowedIps, isLocalAddress });
const server = createServer({ manager, verifier, maxProfileBytes: config.manager.maxProfileBytes, log, tls: config.tls ? { cert: (await import('node:fs')).readFileSync(config.tls.cert), key: (await import('node:fs')).readFileSync(config.tls.key) } : null });

const removed = await manager.recover().catch((error) => { log({ ev: 'recover_failed', why: String(error?.message || error).slice(0, 160) }); return 0; });
log({ ev: 'starting', leftoversRemoved: removed, maxSessions: config.manager.maxSessions, enabled: config.manager.enabled, allowedIps: config.allowedIps });
const timer = setInterval(() => { manager.tick().catch((error) => log({ ev: 'tick_failed', why: String(error?.message || error).slice(0, 160) })); }, 10_000);
server.listen(config.port, config.bind, () => log({ ev: 'listening', bind: config.bind, port: config.port, tls: Boolean(config.tls) }));

let stopping = false;
const shutdown = async (signal) => {
  if (stopping) return; stopping = true;
  log({ ev: 'shutting_down', signal });
  clearInterval(timer); server.close();
  await manager.shutdown().catch(() => {});
  process.exit(0);
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
