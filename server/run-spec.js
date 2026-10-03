// The request that starts a reply on the server (see docs/superpowers/specs/2026-10-03-server-runtime-design.md, §4). The browser puts
// together everything the reply needs; this checks its shape and size before anything is done with it. Errors name a place in the
// request and say what is wrong, and never repeat a value: a key must not end up in an error message or a log.

import { LANGUAGES, LIMITS, PROTOCOL_VERSION } from './protocol.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLES = ['user', 'model', 'system'];
// 'research': the model calls search tools itself; 'grounding': the provider's own search (Gemini); 'off': no search.
const WEB_SEARCH = ['off', 'research', 'grounding'];
const SEARCH_PROVIDERS = ['tavily', 'tinyfish'];
const TOP_LEVEL = ['protocol', 'clientVersion', 'conversationId', 'assistantMessageId', 'sequence', 'model', 'request', 'tools', 'secrets'];

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max;

/**
 * Checks a request body. Returns { ok: true, spec } (the checked copy, with only the known fields) or { ok: false, errors: [{ path, message }] }.
 * A request of another protocol version is told apart (`unsupportedProtocol`) so it can be answered with 426.
 */
export function validateRunSpec(input) {
  const errors = [];
  const fail = (path, message) => errors.push({ path, message });
  if (!isObject(input)) return { ok: false, errors: [{ path: '', message: 'must be an object' }] };
  if (input.protocol !== PROTOCOL_VERSION) return { ok: false, unsupportedProtocol: true, errors: [{ path: 'protocol', message: `this server speaks protocol ${PROTOCOL_VERSION}` }] };
  for (const name of Object.keys(input)) if (!TOP_LEVEL.includes(name)) fail(name, 'is not a known field');

  if (!text(input.clientVersion, 40)) fail('clientVersion', 'must be a short text');
  if (!UUID.test(String(input.conversationId || ''))) fail('conversationId', 'must be an id');
  if (!UUID.test(String(input.assistantMessageId || ''))) fail('assistantMessageId', 'must be an id');
  if (!Number.isInteger(input.sequence) || input.sequence < 0) fail('sequence', 'must be a whole number from 0');

  const model = input.model;
  if (!isObject(model)) fail('model', 'must be an object');
  else {
    if (!text(model.provider, 60)) fail('model.provider', 'must be a short text');
    if (!text(model.id, 200)) fail('model.id', 'must be a short text');
    if (!isObject(model.info)) fail('model.info', 'must be an object');
  }

  const request = input.request;
  if (!isObject(request)) fail('request', 'must be an object');
  else {
    if (!Array.isArray(request.history)) fail('request.history', 'must be a list');
    else {
      if (request.history.length > LIMITS.maxHistoryMessages) fail('request.history', `has more than ${LIMITS.maxHistoryMessages} messages`);
      request.history.slice(0, LIMITS.maxHistoryMessages).forEach((message, index) => {
        if (!isObject(message) || !ROLES.includes(message.role) || !Array.isArray(message.parts)) fail(`request.history[${index}]`, 'must have a role and parts');
      });
    }
    if (!isObject(request.currentMessage) || !Array.isArray(request.currentMessage.parts) || request.currentMessage.parts.length === 0) fail('request.currentMessage', 'must have parts');
    if (typeof request.systemInstruction !== 'string' || request.systemInstruction.length > LIMITS.maxSystemInstructionChars) fail('request.systemInstruction', `must be a text of at most ${LIMITS.maxSystemInstructionChars} characters`);
    if (request.generation !== undefined && !isObject(request.generation)) fail('request.generation', 'must be an object');
    if (request.reasoningEffort !== undefined && request.reasoningEffort !== null && !text(request.reasoningEffort, 40)) fail('request.reasoningEffort', 'must be a short text');
    if (request.messageMetadata !== undefined && (!isObject(request.messageMetadata) || JSON.stringify(request.messageMetadata).length > 8192)) fail('request.messageMetadata', 'must be an object of at most 8 KB');
    if (!LANGUAGES.includes(request.language)) fail('request.language', `must be one of ${LANGUAGES.join(', ')}`);
  }

  const tools = input.tools;
  if (!isObject(tools)) fail('tools', 'must be an object');
  else {
    if (!WEB_SEARCH.includes(tools.webSearch)) fail('tools.webSearch', `must be one of ${WEB_SEARCH.join(', ')}`);
    if (tools.searchProvider !== undefined && !SEARCH_PROVIDERS.includes(tools.searchProvider)) fail('tools.searchProvider', `must be one of ${SEARCH_PROVIDERS.join(', ')}`);
    if (typeof tools.advanced !== 'boolean') fail('tools.advanced', 'must be true or false');
  }

  const secrets = input.secrets;
  if (!isObject(secrets)) fail('secrets', 'must be an object');
  else {
    if (!text(secrets.providerKey, 600)) fail('secrets.providerKey', 'is needed');
    if (secrets.searchKey !== undefined && !text(secrets.searchKey, 600)) fail('secrets.searchKey', 'must be a key or left out');
    for (const name of Object.keys(secrets)) if (!['providerKey', 'searchKey'].includes(name)) fail(`secrets.${name}`, 'is not a known field');
  }

  if (errors.length) return { ok: false, errors: errors.slice(0, 20) };
  return {
    ok: true,
    spec: {
      protocol: input.protocol,
      clientVersion: input.clientVersion,
      conversationId: input.conversationId,
      assistantMessageId: input.assistantMessageId,
      sequence: input.sequence,
      model: { provider: model.provider, id: model.id, info: model.info },
      request: {
        history: request.history,
        currentMessage: request.currentMessage,
        systemInstruction: request.systemInstruction,
        ...(request.generation ? { generation: request.generation } : {}),
        ...(request.reasoningEffort ? { reasoningEffort: request.reasoningEffort } : {}),
        ...(request.messageMetadata ? { messageMetadata: request.messageMetadata } : {}),
        language: request.language
      },
      tools: { webSearch: tools.webSearch, searchProvider: tools.searchProvider || 'tavily', advanced: tools.advanced },
      secrets: { providerKey: secrets.providerKey, ...(secrets.searchKey ? { searchKey: secrets.searchKey } : {}) }
    }
  };
}
