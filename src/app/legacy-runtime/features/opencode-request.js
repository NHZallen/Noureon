// The request to OpenCode Go (docs/superpowers/specs/2026-10-13-opencode-provider-design.md, §3, §6): the same conversation in the form of API
// the model speaks (chat, responses or messages), sent to our own function `/api/opencode-chat` (the service does not answer a browser's
// cross-site request; on the server the same path goes straight to the service, see server/upstream-fetch.js), which puts the headers the
// service wants on it.
//
// What is left out on purpose: the settings of thinking, temperature and top_p. The service refuses a field it does not know (a 400), each model
// wants its own thinking field, and a reply with the settings of the model itself always works (probe 2026-10-13, §14).
//
// Shared by the page and the server: no window, no document, no browser storage.

import { buildAnthropicMessages } from './anthropic-messages-format.js';

export const OPENCODE_CHAT_PATH = '/api/opencode-chat';
// Messages has no default for the length of the answer: it must be given. Long enough for a report; the probe took 16384 on a small question.
export const OPENCODE_DEFAULT_MAX_TOKENS = 16384;

const systemText = (systemInstruction) => (systemInstruction?.parts || []).map((part) => part.text).filter(Boolean).join('\n');

/**
 * { url, payload, headers } for a model of OpenCode Go. `buildChatMessages()` and `buildResponsesInput(messages)` are the page's own builders of the
 * two forms it already has (passed in, so this file does not import the big one).
 */
export function buildOpencodeRequest({
  format,
  modelId,
  apiKey,
  sessionId = '',
  modelInfo,
  historyForApi,
  currentMessageForApi,
  generationConfig,
  systemInstruction,
  modelSupportsVision,
  buildChatMessages,
  buildResponsesInput
}) {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    // One id for a whole conversation: OpenCode uses it to route and to reuse the cache of the prompt.
    ...(sessionId ? { 'x-opencode-session': String(sessionId) } : {})
  };
  const maxTokens = generationConfig?.maxTokens ?? null;
  const conversation = [...historyForApi, currentMessageForApi];
  let payload;
  if (format === 'responses') {
    const instructions = systemText(systemInstruction);
    payload = {
      model: modelId,
      input: buildResponsesInput(conversation),
      stream: true,
      ...(instructions ? { instructions } : {}),
      ...(maxTokens !== null ? { max_output_tokens: maxTokens } : {})
    };
  } else if (format === 'messages') {
    const system = systemText(systemInstruction);
    payload = {
      model: modelId,
      max_tokens: maxTokens ?? OPENCODE_DEFAULT_MAX_TOKENS,
      messages: buildAnthropicMessages(conversation, { modelInfo, modelSupportsVision }),
      stream: true,
      ...(system ? { system } : {})
    };
  } else {
    payload = {
      model: modelId,
      messages: buildChatMessages(),
      stream: true,
      // The numbers of tokens come with the last chunk (the probe: every model of the chat form takes it).
      stream_options: { include_usage: true },
      ...(maxTokens !== null ? { max_tokens: maxTokens } : {})
    };
  }
  return { url: `${OPENCODE_CHAT_PATH}?format=${format === 'responses' || format === 'messages' ? format : 'chat'}`, payload, headers };
}
