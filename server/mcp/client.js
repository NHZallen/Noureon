// A client of an MCP server over Streamable HTTP (docs/superpowers/specs/2026-10-10-mcp-connectors-design.md, §5.4): it introduces itself (`initialize`), lists the tools and calls one. The
// requests are plain POSTs of JSON-RPC; the answer is JSON or a stream of server-sent events, and either is read until the answer to the request is there.
// The token goes only in the Authorization header, to the service's own address. What comes back is the service's word: it is never trusted (see
// server/mcp/tool-loader.js), and its size is kept in bounds here.

export const PROTOCOL_VERSION = '2025-06-18';
const CLIENT_INFO = Object.freeze({ name: 'Noureon', version: '1' });
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
export const MAX_LISTED_TOOLS = 200;
const MAX_PAGES = 10;
export const DEFAULT_TIMEOUT_MS = 60_000;

export class McpError extends Error {
  /** `code`: 'unauthorized' (the token is not good), 'unreachable', 'timeout', 'protocol', 'rpc' (the service answered with an error; `rpcCode` is its number), 'too_large'. */
  constructor(code, message, { status = 0, rpcCode = 0 } = {}) {
    super(message);
    this.name = 'McpError';
    this.code = code;
    this.status = status;
    this.rpcCode = rpcCode;
  }
}

async function readBody(response, signal) {
  const reader = response.body?.getReader?.();
  if (!reader) {
    const text = await response.text();
    if (text.length > MAX_RESPONSE_BYTES) throw new McpError('too_large', 'The service answered with too much.');
    return text;
  }
  const chunks = [];
  let size = 0;
  for (;;) {
    if (signal?.aborted) {
      await reader.cancel().catch(() => {});
      throw new McpError('timeout', 'The service took too long.');
    }
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_RESPONSE_BYTES) {
      await reader.cancel().catch(() => {});
      throw new McpError('too_large', 'The service answered with too much.');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** The messages of a server-sent events body: each event's data lines joined, parsed as JSON (an event that is not JSON is skipped). */
export function parseEventStream(text) {
  const messages = [];
  for (const block of String(text).split(/\r?\n\r?\n/)) {
    const data = block.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).replace(/^ /, '')).join('\n');
    if (!data.trim()) continue;
    try {
      messages.push(JSON.parse(data));
    } catch {
      // Not a message of ours.
    }
  }
  return messages;
}

/**
 * `endpoint`: the service's address; `getToken()` gives the access token (async); `onUnauthorized()` is called once when the service says 401, and may give
 * a new token (async) or null; `fetchImpl` is the network. The session of the service (if it gives one) is kept for the next calls and begun again once if
 * the service has dropped it.
 */
export function createMcpClient({ endpoint, getToken, onUnauthorized = async () => null, fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  let sessionId = '';
  let protocolVersion = PROTOCOL_VERSION;
  let initialized = false;
  let nextId = 1;

  async function post(message, { token, signal, expect = true } = {}) {
    const headers = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      authorization: `Bearer ${token}`,
      ...(sessionId ? { 'mcp-session-id': sessionId } : {}),
      ...(initialized ? { 'mcp-protocol-version': protocolVersion } : {})
    };
    const timer = AbortSignal.timeout(timeoutMs);
    const combined = signal ? AbortSignal.any([signal, timer]) : timer;
    let response;
    try {
      response = await fetchImpl(endpoint, { method: 'POST', headers, body: JSON.stringify(message), redirect: 'error', signal: combined });
    } catch (error) {
      if (signal?.aborted) throw new McpError('timeout', 'Stopped.');
      throw new McpError(error?.name === 'TimeoutError' ? 'timeout' : 'unreachable', 'The service could not be reached.');
    }
    if (response.status === 401 || response.status === 403) {
      await response.body?.cancel?.().catch(() => {});
      throw new McpError('unauthorized', 'The service did not accept the login.', { status: response.status });
    }
    const newSession = response.headers.get('mcp-session-id');
    if (newSession && /^[\x21-\x7e]{1,256}$/.test(newSession)) sessionId = newSession;
    if (!expect) {
      await response.body?.cancel?.().catch(() => {});
      if (!response.ok) throw new McpError('protocol', `The service answered ${response.status}.`, { status: response.status });
      return null;
    }
    if (response.status === 404 && sessionId) {
      await response.body?.cancel?.().catch(() => {});
      throw new McpError('session_lost', 'The service dropped the session.', { status: 404 });
    }
    if (!response.ok) {
      await response.body?.cancel?.().catch(() => {});
      throw new McpError('protocol', `The service answered ${response.status}.`, { status: response.status });
    }
    const text = await readBody(response, combined);
    const type = String(response.headers.get('content-type') || '').toLowerCase();
    let messages;
    if (type.includes('text/event-stream')) messages = parseEventStream(text);
    else {
      try {
        const parsed = JSON.parse(text);
        messages = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        throw new McpError('protocol', 'The service did not answer in JSON.');
      }
    }
    const answer = messages.find((item) => item && item.id === message.id && ('result' in item || 'error' in item));
    if (!answer) throw new McpError('protocol', 'The service gave no answer to the request.');
    if (answer.error) throw new McpError('rpc', String(answer.error.message || 'The service refused the request.').slice(0, 300), { rpcCode: Number(answer.error.code) || 0 });
    return answer.result;
  }

  async function authorized(action) {
    let token = await getToken();
    try {
      return await action(token);
    } catch (error) {
      if (!(error instanceof McpError) || error.code !== 'unauthorized') throw error;
      token = await onUnauthorized();
      if (!token) throw error;
      sessionId = '';
      initialized = false;
      return action(token);
    }
  }

  async function ensureInitialized(token, signal) {
    if (initialized) return;
    const result = await post({ jsonrpc: '2.0', id: nextId++, method: 'initialize', params: { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: CLIENT_INFO } }, { token, signal });
    if (typeof result?.protocolVersion === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(result.protocolVersion)) protocolVersion = result.protocolVersion;
    initialized = true;
    await post({ jsonrpc: '2.0', method: 'notifications/initialized' }, { token, signal, expect: false }).catch(() => {});
  }

  async function request(method, params, { signal } = {}) {
    return authorized(async (token) => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          await ensureInitialized(token, signal);
          return await post({ jsonrpc: '2.0', id: nextId++, method, params }, { token, signal });
        } catch (error) {
          if (error instanceof McpError && error.code === 'session_lost' && attempt === 0) {
            sessionId = '';
            initialized = false;
            continue;
          }
          throw error;
        }
      }
      throw new McpError('protocol', 'The session could not be kept.');
    });
  }

  return {
    /** All the tools the service offers: [{ name, description, inputSchema }] (a bounded number, a page at a time). */
    async listTools({ signal } = {}) {
      const tools = [];
      let cursor;
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const result = await request('tools/list', cursor ? { cursor } : {}, { signal });
        for (const tool of Array.isArray(result?.tools) ? result.tools : []) {
          if (typeof tool?.name !== 'string' || !/^[A-Za-z0-9_.:-]{1,64}$/.test(tool.name)) continue;
          tools.push({ name: tool.name, description: typeof tool.description === 'string' ? tool.description : '', inputSchema: tool.inputSchema && typeof tool.inputSchema === 'object' ? tool.inputSchema : { type: 'object' } });
          if (tools.length >= MAX_LISTED_TOOLS) return tools;
        }
        cursor = typeof result?.nextCursor === 'string' && result.nextCursor ? result.nextCursor : '';
        if (!cursor) break;
      }
      return tools;
    },
    /** Calls one tool: { text, isError, images } (the answer of the service as text; pictures are not carried, only counted). */
    async callTool(name, args, { signal } = {}) {
      const result = await request('tools/call', { name, arguments: args && typeof args === 'object' ? args : {} }, { signal });
      return toolResultText(result);
    },
    /** Ends the session politely (the service may ignore it). */
    async close() {
      if (!sessionId) return;
      try {
        const token = await getToken();
        await fetchImpl(endpoint, { method: 'DELETE', headers: { authorization: `Bearer ${token}`, 'mcp-session-id': sessionId }, redirect: 'error', signal: AbortSignal.timeout(5000) });
      } catch {
        // Not needed.
      }
      sessionId = '';
      initialized = false;
    }
  };
}

/** The result of a tool call as text. */
export function toolResultText(result) {
  const parts = [];
  let images = 0;
  for (const item of Array.isArray(result?.content) ? result.content : []) {
    if (item?.type === 'text' && typeof item.text === 'string') parts.push(item.text);
    else if (item?.type === 'image' || item?.type === 'audio') images += 1;
    else if (item?.type === 'resource' && typeof item.resource?.text === 'string') parts.push(item.resource.text);
    else if (item?.type === 'resource_link' && typeof item.uri === 'string') parts.push(`[${String(item.name || 'link')}] ${item.uri}`);
  }
  let text = parts.join('\n');
  if (!text.trim() && result?.structuredContent !== undefined) {
    try {
      text = JSON.stringify(result.structuredContent);
    } catch {
      text = '';
    }
  }
  return { text, isError: result?.isError === true, images };
}
