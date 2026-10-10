// Starts the server: `node server/main.js`. The settings come from the environment (see server/README.md).

import { createServer } from 'node:http';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createAssetSweeper } from './asset-sweeper.js';
import { createCredentialStore } from './cli-credentials.js';
import { createConnectorService, createDbClientStore } from './mcp/connections.js';
import { createNotionOAuth } from './notion/oauth.js';
import { createKeyVault } from './key-vault.js';
import { createLogger } from './log.js';
import { LIMITS } from './protocol.js';
import { createRunManager } from './runs.js';
import { createRunStore } from './run-store.js';
import { createFileStore } from './file-store.js';
import { createSandboxHost } from './sandbox-client.js';
import { createServerSkills } from './skills.js';
import { createSkillBundleStore } from './skill-bundles.js';
import { createServiceClient } from './supabase-rest.js';
import { canDrawSlides } from './slides/available.js';
import { getFontKit } from './slides/font-kit.js';
import { executeVisionCheck } from './vision-check.js';

const log = createLogger();
let config;
try {
  config = loadConfig();
} catch (error) {
  log('config_error', { message: error.message });
  process.exit(1);
}

let runs = null;
let credentials = null;
let connectors = null;
let notion = null;
let files = null;
let sweeper = null;
let checkRunsStore = async () => {};
let checkSandbox = async () => {};
let checkSlides = async () => {};
if (config.runsConfigured) {
  try {
    const db = createServiceClient({ url: config.supabaseUrl, serviceKey: config.serviceKey });
    // Said once at the start, so a missing privilege shows in the log at once and not as replies that end in errors.
    checkRunsStore = () => db.select('server_runs', { select: 'id', limit: 1 })
      .then(() => log('runs_store_ok'))
      .catch((error) => log('runs_store_failed', { code: error?.code || '', status: error?.status || 0, message: String(error?.message || '').slice(0, 160) }));
    // Python runs on the sandbox host when it is set; the files it makes are kept in the person's storage.
    const host = config.sandboxUrl ? createSandboxHost({ url: config.sandboxUrl, token: config.sandboxToken }) : null;
    files = createFileStore({ url: config.supabaseUrl, serviceKey: config.serviceKey, db });
    const skillBundles = createSkillBundleStore({ url: config.supabaseUrl, serviceKey: config.serviceKey });
    const sandbox = host ? { host, files } : null;
    sweeper = createAssetSweeper({ db, files, bundles: skillBundles, log, mode: process.env.ASSET_SWEEP === 'delete' ? 'delete' : 'report' });
    checkSlides = () => canDrawSlides().then((ok) => log(ok ? 'slides_ok' : 'slides_unavailable'));
    if (host) checkSandbox = () => host.check().then((state) => log(state.ok ? 'sandbox_ok' : 'sandbox_failed', { reason: state.reason }));
    const vault = createKeyVault(config.encryptionKeys);
    credentials = createCredentialStore({ db, vault });
    connectors = createConnectorService({ db, vault, log, config: { redirectUri: config.connectorRedirectUri, cimdUrl: config.connectorClientId, identity: { clientUri: config.appUrl, logoUri: `${config.appUrl}/logo.png`, tosUri: `${config.appUrl}/terms`, policyUri: `${config.appUrl}/privacy` }, clientStore: createDbClientStore(db) } });
    if (config.notion.configured) notion = createNotionOAuth({ db, vault, log, config: config.notion });
    runs = createRunManager({ store: createRunStore({ db, limits: LIMITS }), db, vault, sandbox, files, credentials, connectors, skills: createServerSkills({ db, bundles: skillBundles }), vision: { available: canDrawSlides, execute: executeVisionCheck, getKit: getFontKit }, limits: LIMITS, log });
  } catch (error) {
    log('config_error', { message: error.message });
    process.exit(1);
  }
}

const server = createServer(createApp({ config, log, runs, credentials, files, connectors, notion }));
// A long request (a reply that streams) is never cut by these; the replies themselves run apart from the request.
server.requestTimeout = 60_000;
server.headersTimeout = 30_000;
server.listen(config.port, () => {
  log('listening', { port: config.port, build: config.build, runs: Boolean(runs), sandbox: Boolean(config.sandboxUrl) });
  void checkRunsStore();
  void checkSandbox();
  void checkSlides();
  runs?.startSweeping();
  sweeper?.start();
});

const stop = async (signal) => {
  log('stopping', { signal });
  server.close();
  sweeper?.stop();
  // The replies that are running are put down where they are and handed over for the next process to take up.
  const handedOver = await runs?.shutdown().catch(() => 0);
  log('stopped', { handedOver: handedOver || 0 });
  process.exit(0);
};
process.on('SIGTERM', () => { void stop('SIGTERM'); });
process.on('SIGINT', () => { void stop('SIGINT'); });
