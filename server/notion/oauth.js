// Notion's own OAuth login (a "public connection" made in Notion's developer portal), next to the hosted MCP connector (server/mcp/): the page that asks the person to
// allow access shows the name and the logo of OUR connection (Noureon), which Notion's hosted MCP page does not for a client it only knows by an address. The person logs
// in at Notion, Notion sends them back to /oauth/notion/callback with a code, and this server trades the code for an access token with the client secret.
// docs/superpowers/specs/2026-10-11-notion-public-oauth-design.md.
//
// What is kept, and where: one row of the table user_mcp_connections for the person, with the connector id `notion-public` (a row of the hosted connector has the id `notion`, so
// the two cannot meet). The access token is sealed with the master key (AES-256-GCM) bound to the person and to this purpose, so it cannot be moved to another row or person; the
// browser, the model and the logs never see it. The client secret is only in the server's environment: it goes to Notion in the Authorization header of the exchange and nowhere else.
// Every call is for the person the server signed in (never an id from the request), so one person cannot reach another's token.

import { hashState, randomState } from '../mcp/oauth.js';

export const NOTION_CONNECTOR_ID = 'notion-public';
export const NOTION_VERSION = '2022-06-28';
const AUTHORIZE_URL = 'https://api.notion.com/v1/oauth/authorize';
const TOKEN_URL = 'https://api.notion.com/v1/oauth/token';
const REVOKE_URL = 'https://api.notion.com/v1/oauth/revoke';
const API = 'https://api.notion.com/v1';
const TABLE = 'user_mcp_connections';
const PENDING_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 15_000;
const MAX_BODY_CHARS = 256 * 1024;

export class NotionError extends Error {
  /** `code`: 'not_connected', 'unauthorized' (Notion no longer accepts the token), 'failed'. */
  constructor(code, message) {
    super(message);
    this.name = 'NotionError';
    this.code = code;
  }
}

const aad = { messageId: 'notion-oauth' };
const asText = (value, limit) => (typeof value === 'string' ? value.slice(0, limit) : '');

export function createNotionOAuth({ db, vault, fetchImpl = fetch, now = Date.now, config, log = () => {} }) {
  const { clientId, clientSecret, redirectUri } = config;
  const basic = () => `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
  const getRow = async (userId) => {
    const rows = await db.select(TABLE, { filters: { user_id: `eq.${userId}`, connector_id: `eq.${NOTION_CONNECTOR_ID}` }, limit: 1 });
    return Array.isArray(rows) ? rows[0] || null : null;
  };
  const saveRow = (userId, values) => db.upsert(TABLE, { user_id: userId, connector_id: NOTION_CONNECTOR_ID, ...values, updated_at: new Date(now()).toISOString() }, { onConflict: 'user_id,connector_id' });
  const open = (row, userId) => vault.open(row.envelope, row.key_version, { userId, ...aad });

  async function post(url, body) {
    let response;
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        redirect: 'error',
        headers: { authorization: basic(), 'content-type': 'application/json', accept: 'application/json', 'notion-version': NOTION_VERSION },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
    } catch {
      throw new NotionError('failed', 'Notion could not be reached.');
    }
    let text = '';
    try {
      text = (await response.text()).slice(0, MAX_BODY_CHARS);
    } catch {
      text = '';
    }
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    return { ok: response.ok, status: response.status, data };
  }

  return {
    /** Begins a login: the address of Notion's page that asks for the access. `returnTo`: where the person is sent when it is over ('connectors', the Extensions page, or 'test', the test page). */
    async startLogin(userId, { returnTo = 'test' } = {}) {
      const state = randomState();
      const pending = vault.seal({ purpose: 'notion-oauth', returnTo: returnTo === 'connectors' ? 'connectors' : 'test' }, { userId, ...aad });
      await saveRow(userId, { state_hash: hashState(state), pending_envelope: pending.envelope, pending_key_version: pending.keyVersion, pending_at: new Date(now()).toISOString() });
      const url = new URL(AUTHORIZE_URL);
      url.searchParams.set('client_id', clientId);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('owner', 'user');
      url.searchParams.set('redirect_uri', redirectUri);
      url.searchParams.set('state', state);
      return { url: url.toString() };
    },

    /**
     * Notion sent the person back: `state` and `code` (or `error`) as they came. Returns { ok, error?, returnTo? } ('bad_state', 'expired', 'denied', 'failed'; `returnTo` once the state is known to be ours). The person the login
     * belongs to is the one whose row holds the state (found by its hash), whatever else the request says.
     */
    async completeLogin({ state, code, error: serviceError }) {
      const stateText = typeof state === 'string' ? state : '';
      if (!/^[A-Za-z0-9_-]{20,200}$/.test(stateText)) return { ok: false, error: 'bad_state' };
      const rows = await db.select(TABLE, { filters: { state_hash: `eq.${hashState(stateText)}` }, limit: 1 });
      const row = Array.isArray(rows) ? rows[0] : null;
      // A state of the hosted MCP connector is not ours (and ours is not theirs).
      if (!row || row.connector_id !== NOTION_CONNECTOR_ID || !row.pending_envelope) return { ok: false, error: 'bad_state' };
      const userId = row.user_id;
      // A state is used once, whatever comes next.
      const clearPending = () => saveRow(userId, { state_hash: null, pending_envelope: null, pending_key_version: null, pending_at: null });
      let pending = null;
      try {
        pending = vault.open(row.pending_envelope, row.pending_key_version, { userId, ...aad });
      } catch {
        pending = null;
      }
      if (!pending || pending.purpose !== 'notion-oauth') {
        await clearPending();
        return { ok: false, error: 'bad_state' };
      }
      const returnTo = pending.returnTo === 'connectors' ? 'connectors' : 'test';
      if (now() - Date.parse(row.pending_at || 0) > PENDING_MS) {
        await clearPending();
        return { ok: false, error: 'expired', returnTo };
      }
      if (serviceError || typeof code !== 'string' || !code || code.length > 4096) {
        await clearPending();
        return { ok: false, error: serviceError === 'access_denied' ? 'denied' : 'failed', returnTo };
      }
      const exchanged = await post(TOKEN_URL, { grant_type: 'authorization_code', code, redirect_uri: redirectUri }).catch(() => null);
      const data = exchanged?.data;
      if (!exchanged?.ok || typeof data?.access_token !== 'string' || !data.access_token) {
        await clearPending();
        log('notion_login_failed', { status: exchanged?.status || 0, error: asText(data?.error, 40) });
        return { ok: false, error: 'failed', returnTo };
      }
      const sealed = vault.seal({
        accessToken: data.access_token,
        botId: asText(data.bot_id, 100),
        workspaceId: asText(data.workspace_id, 100),
        workspaceName: asText(data.workspace_name, 200),
        workspaceIcon: asText(data.workspace_icon, 500)
      }, { userId, ...aad });
      await saveRow(userId, { envelope: sealed.envelope, key_version: sealed.keyVersion, status: 'connected', mode: 'readwrite', scope: null, state_hash: null, pending_envelope: null, pending_key_version: null, pending_at: null, last_error: null, tools: [], changed: [], permissions: {} });
      return { ok: true, returnTo };
    },

    /** Notion no longer accepts the person's token: the connection needs a new login. */
    async markExpired(userId) {
      await saveRow(userId, { status: 'needs_login', last_error: 'expired' });
    },

    /** What the person may see of their connection: never the token. */
    async status(userId) {
      const row = await getRow(userId);
      if (!row || !row.envelope || row.status === 'pending') return { connected: false };
      try {
        const held = open(row, userId);
        return { connected: row.status === 'connected', needsLogin: row.status === 'needs_login', workspaceName: held.workspaceName || '', workspaceIcon: held.workspaceIcon || '', connectedAt: row.updated_at || '' };
      } catch {
        return { connected: false, needsLogin: true };
      }
    },

    /** The access token of the person's connection (for the calls to Notion made for them on the server). Throws a NotionError when there is none. */
    async accessToken(userId) {
      const row = await getRow(userId);
      if (!row || row.status !== 'connected' || !row.envelope) throw new NotionError('not_connected', 'Notion is not connected.');
      try {
        return open(row, userId).accessToken;
      } catch {
        throw new NotionError('not_connected', 'Notion is not connected.');
      }
    },

    /** Asks Notion who the token is (a test that it works, and for which workspace): { ok, botName, workspaceName } or { ok: false, reason }. */
    async whoami(userId) {
      const token = await this.accessToken(userId);
      let response;
      try {
        response = await fetchImpl(`${API}/users/me`, { redirect: 'error', headers: { authorization: `Bearer ${token}`, 'notion-version': NOTION_VERSION, accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      } catch {
        return { ok: false, reason: 'unreachable' };
      }
      if (response.status === 401) {
        await saveRow(userId, { status: 'needs_login', last_error: 'expired' });
        return { ok: false, reason: 'unauthorized' };
      }
      if (!response.ok) return { ok: false, reason: 'failed' };
      const data = await response.json().catch(() => null);
      return { ok: true, botName: asText(data?.name, 200), workspaceName: asText(data?.bot?.workspace_name, 200) };
    },

    /** Cuts the connection: the token is revoked at Notion when Notion lets it be, and everything kept is deleted. Resolves { revoked }. */
    async disconnect(userId) {
      const row = await getRow(userId);
      let revoked = false;
      if (row?.envelope) {
        try {
          const result = await post(REVOKE_URL, { token: open(row, userId).accessToken });
          revoked = result.ok;
        } catch {
          // Notion could not be told; what is kept here is deleted all the same.
        }
      }
      await db.remove(TABLE, { user_id: `eq.${userId}`, connector_id: `eq.${NOTION_CONNECTOR_ID}` });
      return { revoked };
    }
  };
}
