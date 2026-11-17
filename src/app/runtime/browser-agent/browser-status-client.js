// Where the person's own browser stands (server/browser-account-routes.js, GET /v1/browser/status), for the countdown on the tag of a finished reply (ui/browser-agent/browser-idle-watch.js).
import { serverRequest } from '../cli/cli-server-bridge.js';

/** { open, conversationId?, state?, idleMsLeft?, taskMsLeft?, closedReason? } or null when the server did not answer. */
export async function getBrowserStatus() {
  const result = await serverRequest('GET', '/v1/browser/status').catch(() => null);
  return result?.ok && result.data && typeof result.data === 'object' ? result.data : null;
}
