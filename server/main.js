// Starts the server: `node server/main.js`. The settings come from the environment (see server/README.md).

import { createServer } from 'node:http';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createAssetSweeper } from './asset-sweeper.js';
import { createAvatarFileStore } from './avatar-files.js';
import { createCredentialStore } from './cli-credentials.js';
import { createConnectorService, createDbClientStore } from './mcp/connections.js';
import { createMailer } from './mailer.js';
import { createKeyVault } from './key-vault.js';
import { createLogger } from './log.js';
import { LIMITS } from './protocol.js';
import { createRunManager } from './runs.js';
import { createRunStore } from './run-store.js';
import { createFileStore } from './file-store.js';
import { createSandboxHost } from './sandbox-client.js';
import { createServerSkills } from './skills.js';
import { createMemoryRecords } from './memory-records.js';
import { createHistorySearch } from './memory-history.js';
import { createRebuildJobs } from './memory-rebuild.js';
import { createSkillBundleStore } from './skill-bundles.js';
import { createDerivedPdfStore } from './derived-pdf-store.js';
import { createOfficePdfConverter, setOfficePdfConverter } from './office-pdf.js';
import { createServiceClient } from './supabase-rest.js';
import { createShares } from './shares.js';
import { createShareStore } from './share-store.js';
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
let memoryRebuild = null;
let shares = null;
let files = null;
let sweeper = null;
let checkRunsStore = async () => {};
let checkSandbox = async () => {};
const SANDBOX_CHECK_MS = 10 * 60 * 1000;
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
    // Word and PowerPoint files are turned into PDFs for the models that read those better (in the sandbox, kept as a cache that is cleared with the original).
    const derived = createDerivedPdfStore({ url: config.supabaseUrl, serviceKey: config.serviceKey });
    if (host) setOfficePdfConverter(createOfficePdfConverter({ host, derived, log }));
    sweeper = createAssetSweeper({ db, files, bundles: skillBundles, derived, avatars: createAvatarFileStore({ url: config.supabaseUrl, serviceKey: config.serviceKey }), log, mode: process.env.ASSET_SWEEP === 'delete' ? 'delete' : 'report' });
    checkSlides = () => canDrawSlides().then((ok) => log(ok ? 'slides_ok' : 'slides_unavailable'));
    // Asked at the start and every 10 minutes after (through `ready`, so /healthz shows what was found): a host that stops working, or whose image a
    // clean-up deleted, shows in the log without waiting for a reply with Python to find it.
    // (Said once at the start, then only when it changes.)
    let said = null;
    if (host) checkSandbox = () => host.ready().then((state) => {
      const event = state.ok ? 'sandbox_ok' : 'sandbox_failed';
      if (event !== said) log(event, { reason: state.reason });
      said = event;
    });
    const vault = createKeyVault(config.encryptionKeys);
    credentials = createCredentialStore({ db, vault });
    connectors = createConnectorService({ db, vault, log, config: { allowed: config.connectorAllowed, mailer: createMailer({ apiKey: config.mailKey, from: config.mailFrom }), waitlistTo: config.waitlistTo, preregistered: config.connectorPreregistered, redirectUri: config.connectorRedirectUri, cimdUrl: config.connectorClientId, identity: { clientUri: config.siteUrl, logoUri: `${config.siteUrl}/logo.png`, tosUri: `${config.siteUrl}/terms`, policyUri: `${config.siteUrl}/privacy` }, clientStore: createDbClientStore(db, vault) } });
    runs = createRunManager({ store: createRunStore({ db, limits: LIMITS }), db, vault, sandbox, files, credentials, connectors, skills: createServerSkills({ db, bundles: skillBundles }), memory: Object.assign(createMemoryRecords({ db }), { history: createHistorySearch({ db }) }), vision: { available: canDrawSlides, execute: executeVisionCheck, getKit: getFontKit }, limits: LIMITS, log });
    // The rebuild of the memory from the past conversations, which goes on when the page is closed (server/memory-rebuild.js).
    memoryRebuild = createRebuildJobs({ memory: createMemoryRecords({ db }), db, log });
    shares = createShares({ db, store: createShareStore({ url: config.supabaseUrl, serviceKey: config.serviceKey }), log });
  } catch (error) {
    log('config_error', { message: error.message });
    process.exit(1);
  }
}

const server = createServer(createApp({ config, log, runs, credentials, files, connectors, memoryRebuild, shares }));
// A long request (a reply that streams) is never cut by these; the replies themselves run apart from the request.
server.requestTimeout = 60_000;
server.headersTimeout = 30_000;
server.listen(config.port, () => {
  log('listening', { port: config.port, build: config.build, runs: Boolean(runs), sandbox: Boolean(config.sandboxUrl) });
  void checkRunsStore();
  void checkSandbox();
  setInterval(() => { void checkSandbox(); }, SANDBOX_CHECK_MS).unref();
  void checkSlides();
  runs?.startSweeping();
  sweeper?.start();
  shares?.start();
});

const stop = async (signal) => {
  log('stopping', { signal });
  server.close();
  sweeper?.stop();
  shares?.stop();
  // The replies that are running are put down where they are and handed over for the next process to take up.
  const handedOver = await runs?.shutdown().catch(() => 0);
  log('stopped', { handedOver: handedOver || 0 });
  process.exit(0);
};
process.on('SIGTERM', () => { void stop('SIGTERM'); });
process.on('SIGINT', () => { void stop('SIGINT'); });
