// Follows a deep research that the server is running: what the live channel tells goes to the store (research-store.js), where the cards and the
// reader draw it from; when the server says it is over the finished message is read and kept in the conversation. The research may last an hour or
// a day: any page of the account may follow it, from the start or from the middle (the channel gives the state so far first).

import { adoptMessage, updateResearch } from './research-store.js';

const FINAL_READS = 8;
const FINAL_READ_WAIT_MS = 1200;

export function createResearchFollow({
  serverReply,
  getSync = () => globalThis.__astraCloudSyncV2,
  saveAppData = async () => {},
  onSettled = () => {},
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  warn = () => {}
}) {
  const following = new Set();

  const eventToPatch = (event) => {
    if (event.r) {
      return {
        patch: {
          ...(event.r.rs ? { plan: event.r.rs } : {}),
          ...(Array.isArray(event.r.ra) ? { activityAll: event.r.ra } : {}),
          ...(Array.isArray(event.r.sources) && event.r.sources.length ? { sources: event.r.sources } : {})
        },
        serverClock: Number.isFinite(event.r.serverNow) ? event.r.serverNow : null
      };
    }
    if (event.rs) return { patch: { plan: event.rs }, serverClock: Number.isFinite(event.rs.clock) ? event.rs.clock : null };
    if (event.ra) return { patch: { activityMore: event.ra }, serverClock: null };
    if (Array.isArray(event.src)) return { patch: { sources: event.src }, serverClock: null };
    if (event.rw) return { patch: { writing: event.rw }, serverClock: null };
    return null;
  };

  // The message the server wrote when it was over: kept in the conversation (and so synced), and its report given to the cards.
  const settle = async ({ messageId, getConversation }) => {
    let row = null;
    for (let attempt = 0; attempt < FINAL_READS; attempt += 1) {
      try {
        row = await serverReply.readMessage(messageId);
      } catch (error) {
        warn('Reading the finished research failed; trying again.', error);
      }
      if (row && (row.status === 'complete' || row.status === 'error')) break;
      await wait(FINAL_READ_WAIT_MS);
    }
    if (!row || !Array.isArray(row.parts)) return null;
    const conversation = getConversation?.();
    const message = conversation?.messages?.find((entry) => entry.id === messageId);
    if (message) {
      message.parts = row.parts;
      if (row.metadata && typeof row.metadata === 'object') message.metadata = { ...(message.metadata || {}), ...row.metadata };
      conversation.lastUpdatedAt = new Date().toISOString();
    }
    // What the finished message holds is the last word on the card (and tells whoever draws it).
    adoptMessage({ id: messageId, parts: row.parts });
    updateResearch(messageId, {});
    try {
      await saveAppData();
      await getSync()?.flush?.();
    } catch (error) {
      warn('Saving the finished research failed.', error);
    }
    onSettled({ messageId, message, row });
    return row;
  };

  /** Follows the research `runId` whose message is `messageId` until the server says it is over. */
  const attach = async ({ runId, messageId, getConversation }) => {
    if (!runId || following.has(runId)) return;
    following.add(runId);
    updateResearch(messageId, { runId, live: true });
    let over = false;
    try {
      over = await serverReply.watchRun(runId, {
        onEvent: (event) => {
          const change = eventToPatch(event);
          if (change) updateResearch(messageId, change.patch, { serverClock: change.serverClock });
          return event.done ? 'done' : null;
        }
      });
    } catch (error) {
      warn('Following the deep research failed.', error);
    } finally {
      following.delete(runId);
      updateResearch(messageId, { live: false });
    }
    if (over) await settle({ messageId, getConversation });
  };

  /** An action of the person on a research that runs: start, hold, release, plan, pause, resume, stop. Resolves { ok, code }. */
  const control = async (runId, action, payload = {}) => {
    const result = await serverReply.request('POST', `/v1/runs/${runId}/${action}`, { body: JSON.stringify(payload) });
    return { ok: Boolean(result.ok), code: result.code || (result.ok ? null : `http-${result.status}`) };
  };

  return { attach, control, settle, isFollowing: (runId) => following.has(runId) };
}
