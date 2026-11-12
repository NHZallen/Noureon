// Tells the server a change that protects the account happened, so it can mail the owner (server/security-notices.js, docs/superpowers/specs/2026-11-12-vault-recovery-design.md, §16.5).
// It never holds anything up: the change is done whether or not the mail goes (a person offline, a server without mail).

import { serverRequest } from '../cli/cli-server-bridge.js';

/** Returns notify(event) -> void. The events are the words of server/security-notices.js. */
export function createSecurityNotifier({ request = serverRequest } = {}) {
  return (event) => {
    try {
      Promise.resolve(request('POST', '/v1/security-notice', { body: JSON.stringify({ event }) })).catch(() => {});
    } catch { /* nothing to do: the change itself is done */ }
  };
}
