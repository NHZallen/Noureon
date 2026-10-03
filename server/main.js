// Starts the server: `node server/main.js`. The settings come from the environment (see server/README.md).

import { createServer } from 'node:http';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createLogger } from './log.js';

const log = createLogger();
let config;
try {
  config = loadConfig();
} catch (error) {
  log('config_error', { message: error.message });
  process.exit(1);
}

const server = createServer(createApp({ config, log }));
// A long request (a reply that streams) is never cut by these; the replies themselves run apart from the request.
server.requestTimeout = 60_000;
server.headersTimeout = 30_000;
server.listen(config.port, () => log('listening', { port: config.port, build: config.build }));

const stop = (signal) => {
  log('stopping', { signal });
  // No new requests; what is in progress gets a moment (later: runs write their checkpoint) before the process ends.
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 10_000).unref();
};
process.on('SIGTERM', () => stop('SIGTERM'));
process.on('SIGINT', () => stop('SIGINT'));
