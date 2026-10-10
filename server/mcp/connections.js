// The connections of a person to the connectors (docs/superpowers/specs/2026-10-10-mcp-connectors-design.md, §5.3, §5.5): the login (begin it, finish it when the service sends the person back), the tokens
// (kept sealed with the master key, bound to the person and the connector, never given to the browser, the model or the logs), keeping them fresh (one refresh at a
// time for a connection: a service that rotates refresh tokens would otherwise lose the login), the list of tools with the fingerprint of each (a tool that
// is new or changed is switched off until the person has seen it) and what the person lets each tool do. One row of the table user_mcp_connections for each
// person and connector; only this server (the service key) can read it.

import { createHash } from 'node:crypto';
import { CONNECTORS, TOOL_STATES, defaultToolState, getConnector, loginScopes, toolKind } from '../../src/data/connector-catalog.js';
import { OAuthError, buildAuthorizationUrl, discover, exchangeCode, hashState, pkcePair, randomState, refreshTokens, resolveClient, revokeToken } from './oauth.js';
import { McpError, createMcpClient } from './client.js';

const TABLE = 'user_mcp_connections';
const PENDING_MS = 10 * 60 * 1000;
const METADATA_KEEP_MS = 60 * 60 * 1000;
const TOOLS_KEEP_MS = 60 * 60 * 1000;
const REFRESH_AHEAD_MS = 60 * 1000;
const MAX_DESCRIPTION_CHARS = 2000;
const MAX_SCHEMA_CHARS = 20_000;

export class ConnectorError extends Error {
  /** `code`: 'unknown_connector', 'not_connected', 'login_needed' (the person must log in again), 'bad_state', 'denied', 'failed', 'bad_request'. */
  constructor(code, message, detail = '') {
    super(message);
    this.name = 'ConnectorError';
    this.code = code;
    // Why, in a few words that hold no secret (an error code of the login and the status the service answered): the page shows it, so that a service that refuses us can be told from one that is down.
    this.detail = detail;
  }
}

const aadOf = (connectorId) => ({ messageId: `mcp:${connectorId}` });
const toolHash = (tool) => createHash('sha256').update(JSON.stringify([tool.name, tool.description, tool.inputSchema])).digest('hex').slice(0, 32);
const asArray = (value) => (Array.isArray(value) ? value : []);
const asObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

/** The tools as they are kept: the service's text cut to a size, a hash of what it said, and whether the tool reads or writes (by the catalog, never by what the service says). */
export function keptTools(connector, tools) {
  return tools.map((tool) => {
    const description = String(tool.description || '').slice(0, MAX_DESCRIPTION_CHARS);
    let inputSchema = tool.inputSchema;
    try {
      if (JSON.stringify(inputSchema).length > MAX_SCHEMA_CHARS) inputSchema = { type: 'object' };
    } catch {
      inputSchema = { type: 'object' };
    }
    return { name: tool.name, description, inputSchema, kind: toolKind(connector, tool.name), hash: toolHash({ name: tool.name, description, inputSchema }) };
  });
}

/** What a tool may do now: 'allow', 'ask' or 'deny'. A tool that is new or changed since the person saw the list is 'deny' until they say otherwise. */
export function effectiveState(connector, row, toolName) {
  if (asArray(row.changed).includes(toolName)) return 'deny';
  const set = asObject(row.permissions)[toolName];
  return TOOL_STATES.includes(set) ? set : defaultToolState(connector, toolName);
}

export function createConnectorService({ db, vault, fetchImpl = fetch, now = Date.now, config, log = () => {} }) {
  const locks = new Map();
  const metadataKept = new Map();

  // One at a time for a key (a refresh of a connection's tokens).
  async function exclusively(key, task) {
    const before = locks.get(key) || Promise.resolve();
    let release;
    const mine = new Promise((resolve) => { release = resolve; });
    const chain = before.then(() => mine);
    locks.set(key, chain);
    await before;
    try {
      return await task();
    } finally {
      release();
      if (locks.get(key) === chain) locks.delete(key);
    }
  }

  const connectorOf = (id) => {
    const connector = getConnector(id);
    if (!connector) throw new ConnectorError('unknown_connector', 'There is no such connector.');
    return connector;
  };
  const getRow = async (userId, connectorId) => {
    const rows = await db.select(TABLE, { filters: { user_id: `eq.${userId}`, connector_id: `eq.${connectorId}` }, limit: 1 });
    return Array.isArray(rows) ? rows[0] || null : null;
  };
  const saveRow = (userId, connectorId, values) => db.upsert(TABLE, { user_id: userId, connector_id: connectorId, ...values, updated_at: new Date(now()).toISOString() }, { onConflict: 'user_id,connector_id' });
  const openTokens = (row, userId) => vault.open(row.envelope, row.key_version, { userId, ...aadOf(row.connector_id) });
  const sealTokens = (tokens, userId, connectorId) => {
    const { envelope, keyVersion } = vault.seal(tokens, { userId, ...aadOf(connectorId) });
    return { envelope, key_version: keyVersion };
  };

  async function metadataOf(connector) {
    const kept = metadataKept.get(connector.id);
    if (kept && now() - kept.at < METADATA_KEEP_MS) return kept.metadata;
    const metadata = await discover(connector.endpoint, { fetchImpl });
    metadataKept.set(connector.id, { at: now(), metadata });
    return metadata;
  }
  const clientOf = (connector, metadata) => resolveClient({
    connectorId: connector.id,
    metadata,
    redirectUri: config.redirectUri,
    cimdUrl: config.cimdUrl,
    preregistered: config.preregistered || {},
    identity: config.identity || {},
    prefer: connector.registration || '',
    clientStore: config.clientStore || null,
    fetchImpl
  });

  /** Begins a login: the address to send the person to. `mode`: 'readonly' or 'readwrite'. */
  async function startLogin(userId, connectorId, mode) {
    const connector = connectorOf(connectorId);
    const kind = mode === 'readonly' && connector.scopes.readonly ? 'readonly' : 'readwrite';
    let metadata;
    let client;
    try {
      metadata = await metadataOf(connector);
      client = await clientOf(connector, metadata);
    } catch (error) {
      if (error instanceof OAuthError) {
        log('connector_login_unavailable', { connector: connectorId, code: error.code });
        throw new ConnectorError('failed', 'This service cannot be logged in to right now.', `${error.code}${error.status ? ` ${error.status}` : ''}`);
      }
      throw error;
    }
    const { verifier, challenge } = pkcePair();
    const state = randomState();
    const pending = vault.seal({ verifier, clientId: client.clientId, clientSecret: client.clientSecret || '', mode: kind, how: client.how }, { userId, ...aadOf(connectorId) });
    await saveRow(userId, connectorId, { state_hash: hashState(state), pending_envelope: pending.envelope, pending_key_version: pending.keyVersion, pending_at: new Date(now()).toISOString() });
    return { url: buildAuthorizationUrl({ metadata, clientId: client.clientId, redirectUri: config.redirectUri, scopes: loginScopes(connector, kind), state, challenge }) };
  }

  /**
   * The service sent the person back: `state` and `code` (or `error`) as they came. Returns { ok, connectorId, error? }; it says only what kind of failure it was.
   * Nothing is trusted but the state, which is found in what we kept when the login began.
   */
  async function completeLogin({ state, code, error: serviceError, iss }) {
    const stateText = typeof state === 'string' ? state : '';
    if (!/^[A-Za-z0-9_-]{20,200}$/.test(stateText)) return { ok: false, error: 'bad_state' };
    const rows = await db.select(TABLE, { filters: { state_hash: `eq.${hashState(stateText)}` }, limit: 1 });
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row || !row.pending_envelope) return { ok: false, error: 'bad_state' };
    const { user_id: userId, connector_id: connectorId } = row;
    const connector = getConnector(connectorId);
    // The state is used once, whatever comes next.
    const clearPending = () => saveRow(userId, connectorId, { state_hash: null, pending_envelope: null, pending_key_version: null, pending_at: null });
    if (!connector || now() - Date.parse(row.pending_at || 0) > PENDING_MS) {
      await clearPending();
      return { ok: false, connectorId, error: 'expired' };
    }
    if (serviceError || typeof code !== 'string' || !code || code.length > 4096) {
      await clearPending();
      return { ok: false, connectorId, error: serviceError === 'access_denied' ? 'denied' : 'failed' };
    }
    let pending;
    try {
      pending = vault.open(row.pending_envelope, row.pending_key_version, { userId, ...aadOf(connectorId) });
    } catch {
      await clearPending();
      return { ok: false, connectorId, error: 'failed' };
    }
    try {
      const metadata = await metadataOf(connector);
      // RFC 9207: a service that says it sends its issuer back must send ours (a login sent by another server is not accepted).
      if (metadata.issuerInResponse && String(iss || '').replace(/\/+$/, '') !== metadata.issuer) throw new OAuthError('bad_metadata', 'The login came from another server.');
      const client = { clientId: pending.clientId, ...(pending.clientSecret ? { clientSecret: pending.clientSecret } : {}) };
      const tokens = await exchangeCode({ metadata, client, redirectUri: config.redirectUri, code, verifier: pending.verifier, fetchImpl });
      const sealed = sealTokens({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, expiresAt: tokens.expiresInSeconds ? now() + tokens.expiresInSeconds * 1000 : 0, clientId: client.clientId, clientSecret: client.clientSecret || '' }, userId, connectorId);
      await saveRow(userId, connectorId, {
        ...sealed,
        status: 'connected',
        mode: pending.mode,
        scope: tokens.scope,
        state_hash: null,
        pending_envelope: null,
        pending_key_version: null,
        pending_at: null,
        last_error: null,
        // A new login starts from the tools the service has now, seen by the person.
        tools: [],
        changed: [],
        tools_checked_at: null,
        created_at: row.created_at || new Date(now()).toISOString()
      });
    } catch (error) {
      await clearPending();
      log('connector_login_failed', { connector: connectorId, code: error?.code || error?.name || 'error' });
      return { ok: false, connectorId, error: 'failed' };
    }
    try {
      await refreshTools(userId, connectorId, { first: true });
    } catch (error) {
      // Connected, but the list of tools could not be had now: the page can ask again.
      log('connector_tools_failed', { connector: connectorId, code: error?.code || error?.name || 'error' });
    }
    return { ok: true, connectorId };
  }

  /** The access token of a connection, refreshed when it is about to end (one refresh at a time). `force`: the service said it is no good. */
  async function accessToken(userId, connectorId, { force = false } = {}) {
    const connector = connectorOf(connectorId);
    const load = async () => {
      const row = await getRow(userId, connectorId);
      if (!row || row.status !== 'connected' || !row.envelope) throw new ConnectorError('not_connected', 'This connector is not connected.');
      let tokens;
      try {
        tokens = openTokens(row, userId);
      } catch {
        throw new ConnectorError('login_needed', 'The login cannot be opened: log in again.');
      }
      return { row, tokens };
    };
    const first = await load();
    const ending = first.tokens.expiresAt && first.tokens.expiresAt - now() < REFRESH_AHEAD_MS;
    if (!force && !ending) return first.tokens.accessToken;
    return exclusively(`${userId}|${connectorId}`, async () => {
      // Another reply may have refreshed while this one waited: if what is kept is not what was seen, it is used.
      const { row, tokens } = await load();
      if (tokens.accessToken !== first.tokens.accessToken || (!force && tokens.expiresAt && tokens.expiresAt - now() >= REFRESH_AHEAD_MS)) return tokens.accessToken;
      if (!tokens.refreshToken) {
        await saveRow(userId, connectorId, { status: 'needs_login', last_error: 'expired' });
        throw new ConnectorError('login_needed', 'The login has ended: log in again.');
      }
      try {
        const metadata = await metadataOf(connector);
        const next = await refreshTokens({ metadata, client: { clientId: tokens.clientId, ...(tokens.clientSecret ? { clientSecret: tokens.clientSecret } : {}) }, refreshToken: tokens.refreshToken, fetchImpl });
        const sealed = sealTokens({ ...tokens, accessToken: next.accessToken, refreshToken: next.refreshToken || tokens.refreshToken, expiresAt: next.expiresInSeconds ? now() + next.expiresInSeconds * 1000 : 0 }, userId, connectorId);
        await saveRow(userId, connectorId, { ...sealed, ...(next.scope ? { scope: next.scope } : {}), last_error: null });
        return next.accessToken;
      } catch (error) {
        if (error instanceof OAuthError && (error.code === 'invalid_grant' || error.code === 'invalid_client' || error.code === 'unauthorized_client')) {
          await saveRow(userId, connectorId, { status: 'needs_login', last_error: 'expired' });
          throw new ConnectorError('login_needed', 'The login has ended: log in again.');
        }
        throw new ConnectorError('failed', 'The login could not be renewed now.');
      }
    });
  }

  /** A client of the service for one person (the token is fetched and renewed as it is needed). */
  function clientFor(userId, connectorId) {
    const connector = connectorOf(connectorId);
    return createMcpClient({
      endpoint: connector.endpoint,
      fetchImpl,
      getToken: () => accessToken(userId, connectorId),
      onUnauthorized: () => accessToken(userId, connectorId, { force: true }).catch(() => null)
    });
  }

  /**
   * Asks the service for its tools and keeps the list. A tool that was not there, or whose text or inputs are not what the person last saw, is put in `changed`
   * (off until they confirm); `first` says this is the list the person is about to see for the first time.
   */
  async function refreshTools(userId, connectorId, { first = false } = {}) {
    const connector = connectorOf(connectorId);
    const row = await getRow(userId, connectorId);
    if (!row || row.status !== 'connected') throw new ConnectorError('not_connected', 'This connector is not connected.');
    const client = clientFor(userId, connectorId);
    let listed;
    try {
      listed = await client.listTools();
    } catch (error) {
      if (error instanceof ConnectorError) throw error;
      if (error instanceof McpError && error.code === 'unauthorized') {
        await saveRow(userId, connectorId, { status: 'needs_login', last_error: 'expired' });
        throw new ConnectorError('login_needed', 'The login has ended: log in again.');
      }
      throw new ConnectorError('failed', 'The tools could not be listed now.');
    } finally {
      void client.close();
    }
    const fresh = keptTools(connector, listed);
    const before = asArray(row.tools);
    const known = new Map(before.map((tool) => [tool.name, tool]));
    const changed = new Set(asArray(row.changed).filter((name) => fresh.some((tool) => tool.name === name)));
    if (!first && before.length) {
      for (const tool of fresh) {
        const was = known.get(tool.name);
        if (!was || was.hash !== tool.hash) changed.add(tool.name);
      }
    }
    const permissions = Object.fromEntries(Object.entries(asObject(row.permissions)).filter(([name]) => fresh.some((tool) => tool.name === name)));
    await saveRow(userId, connectorId, { tools: fresh, changed: [...changed], permissions, tools_checked_at: new Date(now()).toISOString(), last_error: null });
    return { tools: fresh, changed: [...changed] };
  }

  /** What a person sees of a connection (never a token). */
  function summarize(connector, row) {
    const tools = asArray(row?.tools).map((tool) => ({
      name: tool.name,
      description: String(tool.description || '').slice(0, 300),
      kind: tool.kind === 'read' ? 'read' : 'write',
      state: effectiveState(connector, row, tool.name),
      changed: asArray(row.changed).includes(tool.name)
    }));
    return { id: connector.id, status: row?.status === 'connected' || row?.status === 'needs_login' ? row.status : 'none', mode: row?.mode === 'readonly' ? 'readonly' : 'readwrite', tools, error: row?.last_error || '', connectedAt: row?.created_at || '' };
  }

  const service = {
    startLogin,
    completeLogin,
    accessToken,
    refreshTools,
    clientFor,
    /** The person's connections: one entry for every connector of the catalog (status 'none' when not connected). */
    async list(userId) {
      const rows = asArray(await db.select(TABLE, { filters: { user_id: `eq.${userId}` }, limit: CONNECTORS.length + 5 }));
      return CONNECTORS.map((connector) => summarize(connector, rows.find((row) => row.connector_id === connector.id) || null));
    },
    /** One connection of the person's, as it is kept (for a reply: the tools with their states), or null when it is not connected. */
    async connection(userId, connectorId) {
      const connector = connectorOf(connectorId);
      const row = await getRow(userId, connectorId);
      return row?.status === 'connected' ? { connector, row } : null;
    },
    /**
     * What a reply is given: the person's connected connectors with their tools and the states the person set, [{ id, name, tools: [{ name, description, inputSchema, kind,
     * state }] }]. A connector with no tool is left out. Never throws (a connector that cannot be read now is left out and the reply goes on without it).
     */
    async forRun(userId) {
      // One read for the person: the many replies of people who have connected nothing cost one query each, and no more.
      let connected;
      try {
        connected = new Set(asArray(await db.select(TABLE, { filters: { user_id: `eq.${userId}`, status: 'eq.connected' }, select: 'connector_id', limit: CONNECTORS.length + 5 })).map((row) => row.connector_id));
      } catch (error) {
        log('connector_for_run_failed', { code: error?.code || error?.name || 'error' });
        return [];
      }
      const found = await Promise.all(CONNECTORS.filter((connector) => connected.has(connector.id)).map(async (connector) => {
        try {
          const connection = await service.freshConnection(userId, connector.id);
          if (!connection) return null;
          const tools = asArray(connection.row.tools).map((tool) => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema, kind: tool.kind === 'read' ? 'read' : 'write', state: effectiveState(connector, connection.row, tool.name) }));
          return tools.length ? { id: connector.id, name: connector.name, tools } : null;
        } catch (error) {
          log('connector_for_run_failed', { connector: connector.id, code: error?.code || error?.name || 'error' });
          return null;
        }
      }));
      return found.filter(Boolean);
    },
    /** The tools list is asked for again when it is an hour old (or never asked). */
    async freshConnection(userId, connectorId) {
      const found = await service.connection(userId, connectorId);
      if (!found) return null;
      const checked = Date.parse(found.row.tools_checked_at || 0);
      if (found.row.tools_checked_at && now() - checked < TOOLS_KEEP_MS) return found;
      try {
        await refreshTools(userId, connectorId);
      } catch (error) {
        log('connector_tools_failed', { connector: connectorId, code: error?.code || error?.name || 'error' });
      }
      return service.connection(userId, connectorId);
    },
    /** Cuts the connection: the token is revoked at the service when it can be, and everything kept is deleted. */
    async disconnect(userId, connectorId) {
      const connector = connectorOf(connectorId);
      const row = await getRow(userId, connectorId);
      let revoked = false;
      if (row?.envelope) {
        try {
          const tokens = openTokens(row, userId);
          const metadata = await metadataOf(connector);
          const client = { clientId: tokens.clientId, ...(tokens.clientSecret ? { clientSecret: tokens.clientSecret } : {}) };
          revoked = tokens.refreshToken
            ? await revokeToken({ metadata, client, token: tokens.refreshToken, fetchImpl })
            : await revokeToken({ metadata, client, token: tokens.accessToken, hint: 'access_token', fetchImpl });
        } catch {
          // The service could not be told; what we keep is deleted all the same.
        }
      }
      await db.remove(TABLE, { user_id: `eq.${userId}`, connector_id: `eq.${connectorId}` });
      return { revoked };
    },
    /** `states`: { toolName: 'allow' | 'ask' | 'deny' }. A tool the person sets is one they have seen, so it is no longer "changed". */
    async setPermissions(userId, connectorId, states) {
      const connector = connectorOf(connectorId);
      const row = await getRow(userId, connectorId);
      if (!row || row.status !== 'connected') throw new ConnectorError('not_connected', 'This connector is not connected.');
      const names = new Set(asArray(row.tools).map((tool) => tool.name));
      const permissions = { ...asObject(row.permissions) };
      const changed = new Set(asArray(row.changed));
      for (const [name, state] of Object.entries(asObject(states))) {
        if (!names.has(name) || !TOOL_STATES.includes(state)) throw new ConnectorError('bad_request', 'That is not a tool or a state.');
        // A state equal to the default is not kept, so a change in the catalog's default reaches the person who never changed it.
        if (state === defaultToolState(connector, name)) delete permissions[name];
        else permissions[name] = state;
        changed.delete(name);
      }
      await saveRow(userId, connectorId, { permissions, changed: [...changed] });
    }
  };
  return service;
}

/** Keeps the clients that dynamic registration gave (the table mcp_oauth_clients), for server/mcp/oauth.js `resolveClient`. */
export function createDbClientStore(db) {
  return {
    async get(key) {
      const rows = await db.select('mcp_oauth_clients', { filters: { key: `eq.${key}` }, limit: 1 });
      const row = Array.isArray(rows) ? rows[0] : null;
      return row ? { clientId: row.client_id } : null;
    },
    async set(key, value) {
      await db.upsert('mcp_oauth_clients', { key, client_id: value.clientId }, { onConflict: 'key' });
    }
  };
}
