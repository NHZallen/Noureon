import assert from 'node:assert/strict';
import test from 'node:test';

import { McpError, PROTOCOL_VERSION, createMcpClient, parseEventStream, toolResultText } from '../../server/mcp/client.js';

const ENDPOINT = 'https://mcp.example.com/mcp';
const rpc = (id, result) => ({ jsonrpc: '2.0', id, result });
const jsonResponse = (body, { status = 200, headers = {} } = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const sseResponse = (messages, headers = {}) => new Response(messages.map((message) => `event: message\ndata: ${JSON.stringify(message)}\n\n`).join(''), { status: 200, headers: { 'content-type': 'text/event-stream', ...headers } });

/** A server: `handle({ method, params, headers, id })` gives the Response to a request; notifications get 202. Records every request. */
function fakeServer(handle) {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : null;
    requests.push({ url: String(url), method: options.method, headers: options.headers, body });
    if (options.method === 'DELETE') return new Response('', { status: 204 });
    if (body && body.id === undefined) return new Response('', { status: 202 });
    return handle({ method: body.method, params: body.params, headers: options.headers, id: body.id });
  };
  return { fetchImpl, requests };
}

const client = (server, extra = {}) => createMcpClient({ endpoint: ENDPOINT, getToken: async () => 'TOKEN-1', fetchImpl: server.fetchImpl, ...extra });

test('it introduces itself, tells the service it is ready, and lists the tools across pages, keeping only tools with a plain name', async () => {
  const server = fakeServer(({ method, params, id }) => {
    if (method === 'initialize') return jsonResponse(rpc(id, { protocolVersion: '2025-03-26', capabilities: {}, serverInfo: { name: 'x' } }), { headers: { 'mcp-session-id': 'sess-1' } });
    if (method === 'tools/list') {
      if (!params.cursor) return jsonResponse(rpc(id, { tools: [{ name: 'list_issues', description: 'Lists', inputSchema: { type: 'object', properties: { team: { type: 'string' } } } }, { name: 'bad name!', description: 'x' }], nextCursor: 'page2' }));
      return sseResponse([{ jsonrpc: '2.0', method: 'notifications/progress', params: {} }, rpc(id, { tools: [{ name: 'create_issue', inputSchema: { type: 'object' } }] })]);
    }
    return jsonResponse({ jsonrpc: '2.0', id, error: { code: -32601, message: 'no' } });
  });
  const tools = await client(server).listTools();
  assert.deepEqual(tools.map((tool) => tool.name), ['list_issues', 'create_issue']);
  assert.equal(tools[0].inputSchema.properties.team.type, 'string');
  const [init, ready, list1, list2] = server.requests;
  assert.equal(init.body.method, 'initialize');
  assert.equal(init.body.params.protocolVersion, PROTOCOL_VERSION);
  assert.equal(init.headers.authorization, 'Bearer TOKEN-1');
  assert.match(init.headers.accept, /text\/event-stream/);
  assert.equal(ready.body.method, 'notifications/initialized');
  // The session and the version the service chose go with what follows.
  assert.equal(list1.headers['mcp-session-id'], 'sess-1');
  assert.equal(list1.headers['mcp-protocol-version'], '2025-03-26');
  assert.equal(list2.body.params.cursor, 'page2');
  assert.equal(server.requests.filter((request) => request.body?.method === 'initialize').length, 1, 'one introduction for the calls that follow');
});

test('a call returns the text of the answer, whether the service answers in JSON or in a stream; an error of the tool is told, not thrown', async () => {
  const server = fakeServer(({ method, params, id }) => {
    if (method === 'initialize') return jsonResponse(rpc(id, { protocolVersion: PROTOCOL_VERSION }));
    if (params.name === 'a') return jsonResponse(rpc(id, { content: [{ type: 'text', text: 'one' }, { type: 'text', text: 'two' }, { type: 'image', data: 'x', mimeType: 'image/png' }] }));
    if (params.name === 'b') return sseResponse([rpc(id, { content: [{ type: 'text', text: 'streamed' }], isError: true })]);
    return jsonResponse(rpc(id, { content: [], structuredContent: { ok: true } }));
  });
  const mcp = client(server);
  assert.deepEqual(await mcp.callTool('a', { x: 1 }), { text: 'one\ntwo', isError: false, images: 1 });
  assert.deepEqual(await mcp.callTool('b', {}), { text: 'streamed', isError: true, images: 0 });
  assert.equal((await mcp.callTool('c', {})).text, '{"ok":true}');
  assert.deepEqual(server.requests.find((request) => request.body?.method === 'tools/call').body.params, { name: 'a', arguments: { x: 1 } });
});

test('a service that says 401 is given a new token once; with none, or a second 401, the call fails as unauthorized', async () => {
  let seen = [];
  const server = fakeServer(({ method, id, headers }) => {
    seen.push(headers.authorization);
    if (headers.authorization !== 'Bearer TOKEN-2') return new Response('no', { status: 401 });
    if (method === 'initialize') return jsonResponse(rpc(id, { protocolVersion: PROTOCOL_VERSION }));
    return jsonResponse(rpc(id, { tools: [] }));
  });
  let renewed = 0;
  const renewing = client(server, { onUnauthorized: async () => { renewed += 1; return 'TOKEN-2'; } });
  assert.deepEqual(await renewing.listTools(), []);
  assert.equal(renewed, 1);
  assert.deepEqual(seen.slice(0, 2), ['Bearer TOKEN-1', 'Bearer TOKEN-2']);
  seen = [];
  await assert.rejects(client(server).listTools(), (error) => error instanceof McpError && error.code === 'unauthorized');
  await assert.rejects(client(server, { onUnauthorized: async () => 'TOKEN-3' }).listTools(), (error) => error.code === 'unauthorized');
});

test('a session the service dropped (404) is begun again once', async () => {
  let initializes = 0;
  let dropped = false;
  const server = fakeServer(({ method, id }) => {
    if (method === 'initialize') {
      initializes += 1;
      return jsonResponse(rpc(id, { protocolVersion: PROTOCOL_VERSION }), { headers: { 'mcp-session-id': `s${initializes}` } });
    }
    if (!dropped) {
      dropped = true;
      return new Response('gone', { status: 404 });
    }
    return jsonResponse(rpc(id, { content: [{ type: 'text', text: 'fine' }] }));
  });
  assert.equal((await client(server).callTool('t', {})).text, 'fine');
  assert.equal(initializes, 2);
});

test('failures are told by kind: an error of the service, an answer that is not one, a network that fails, an answer that is too large', async () => {
  const withInit = (answer) => fakeServer(({ method, id }) => (method === 'initialize' ? jsonResponse(rpc(id, { protocolVersion: PROTOCOL_VERSION })) : answer(id)));
  await assert.rejects(client(withInit((id) => jsonResponse({ jsonrpc: '2.0', id, error: { code: -32602, message: 'bad arguments' } }))).callTool('t', {}), (error) => error.code === 'rpc' && error.rpcCode === -32602 && error.message === 'bad arguments');
  await assert.rejects(client(withInit(() => new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } }))).callTool('t', {}), (error) => error.code === 'protocol');
  await assert.rejects(client(withInit((id) => jsonResponse(rpc(id + 99, {})))).callTool('t', {}), (error) => error.code === 'protocol', 'an answer to another request is not an answer');
  await assert.rejects(client(withInit(() => new Response('x', { status: 500 }))).callTool('t', {}), (error) => error.code === 'protocol' && error.status === 500);
  await assert.rejects(createMcpClient({ endpoint: ENDPOINT, getToken: async () => 'T', fetchImpl: async () => { throw new Error('down'); } }).callTool('t', {}), (error) => error.code === 'unreachable');
  const big = 'x'.repeat(5 * 1024 * 1024);
  await assert.rejects(client(withInit((id) => jsonResponse(rpc(id, { content: [{ type: 'text', text: big }] })))).callTool('t', {}), (error) => error.code === 'too_large');
});

test('the parts of an answer are read as text', () => {
  assert.deepEqual(parseEventStream('data: {"a":1}\n\nevent: x\ndata: not json\n\ndata: {"b":2}\n\n'), [{ a: 1 }, { b: 2 }]);
  assert.equal(toolResultText({ content: [{ type: 'resource', resource: { text: 'inside' } }, { type: 'resource_link', uri: 'https://x.example/a', name: 'doc' }] }).text, 'inside\n[doc] https://x.example/a');
  assert.deepEqual(toolResultText(undefined), { text: '', isError: false, images: 0 });
});
