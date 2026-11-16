// The browser agent of the main server, put together once at start (docs/superpowers/specs/2026-11-16-browser-agent-design.md; Linear NOU-205): the signed client to browser-host,
// the store of the sealed login states, the browsers this server has open, and who may use them. Null when it is switched off or not set up: then no reply is offered a browser.

import { createBrowserHostClient } from './browser-host-client.js';
import { browserAdmin, createBrowserAccess, createEmailLookup } from './browser-config.js';
import { createBrowserProfileStore } from './browser-profile-store.js';
import { createBrowserSessions } from './browser-sessions.js';
import { createBrowserLogins } from './browser-logins.js';
import { createBrowserInvites } from './browser-invites.js';

export function createBrowserService({ config, db, vault, url, serviceKey, log = () => {}, fetchImpl = fetch }) {
  if (!config?.enabled) return null;
  const host = createBrowserHostClient({ url: config.hosts[0], secret: config.secret, fetchImpl });
  const profiles = createBrowserProfileStore({ db, vault, url, serviceKey, fetchImpl, log });
  const sessions = createBrowserSessions({ host, profiles, log });
  const logins = createBrowserLogins({ db, vault });
  const invites = createBrowserInvites({ db });
  const emailOf = createEmailLookup({ url, serviceKey, fetchImpl });
  const mayUse = createBrowserAccess({ config, emailOf, invites });
  const isAdmin = async (userId) => (browserAdmin(config, { userId }) || (config.admins.size > 0 && browserAdmin(config, { userId, email: await emailOf(userId) })));
  return {
    sessions,
    logins,
    invites,
    profiles,
    mayUse,
    isAdmin,
    maxActions: config.maxActions,
    /** Said once at the start, so a host that cannot be reached shows in the log at once and not as replies that cannot open a browser. */
    check: () => host.health().then((state) => log('browser_host_ok', { running: state?.sessions, max: state?.maxSessions })).catch((error) => log('browser_host_failed', { code: error?.code || '', status: error?.status || 0 })),
    start: () => sessions.start(),
    /** On shutdown: every browser this server opened is closed and its login state kept. */
    async stop() {
      sessions.stop();
      await sessions.closeAll();
    }
  };
}
