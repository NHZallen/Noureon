// The request to OpenCode Go (docs/superpowers/specs/2026-10-13-opencode-provider-design.md, §3, §6): the same conversation in the form of API
// the model speaks (chat, responses or messages), sent to our own function `/api/opencode-chat` (the service does not answer a browser's
// cross-site request; on the server the same path goes straight to the service, see server/upstream-fetch.js), which puts the headers the
// service wants on it.
//
// What is left out on purpose: temperature and top_p. The service refuses a field it does not know (a 400), so what is sent is only what the probe
// of 2026-10-13 found each model takes (§14): the depth of thinking in the way that is the model's own (opencode-models.js, `opencodeThinkingFields`),
// and nothing at all for a model with no choice or when no depth is asked for.
//
// Shared by the page and the server: no window, no document, no browser storage.

import { opencodeMaxOutputTokens, opencodeSummaryFields, opencodeThinkingFields } from '../shell/opencode-models.js';
import { buildAnthropicMessages } from './anthropic-messages-format.js';

export const OPENCODE_CHAT_PATH = '/api/opencode-chat';
// Messages has no default for the length of the answer: it must be given. For a model whose limit is not known: 32768, twice what it was (the owner, 2026-10-23); a model
// whose limit is known gets it (opencode-models.js). The other forms are sent none unless the person set one.
export const OPENCODE_DEFAULT_MAX_TOKENS = 32768;

// OpenCode now refuses a request with no `x-opencode-session`. A conversation gives its own id; a request with none (a background task, a test) gets one
// id for the whole page, so the cache and the routing still work for it.
let pageSessionId = '';
const fallbackSessionId = () => {
  if (!pageSessionId) pageSessionId = `noureon-${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36)}`;
  return pageSessionId;
};

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
  reasoningEffort = null,
  systemInstruction,
  modelSupportsVision,
  buildChatMessages,
  buildResponsesInput,
  buildGeminiPayload
}) {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    // One id for a whole conversation: OpenCode uses it to route and to reuse the cache of the prompt.
    'x-opencode-session': /^[A-Za-z0-9._-]{1,100}$/.test(String(sessionId || '')) ? String(sessionId) : fallbackSessionId()
  };
  const maxTokens = generationConfig?.maxTokens ?? null;
  const conversation = [...historyForApi, currentMessageForApi];
  let payload;
  if (format === 'gemini') {
    // Google's form: the model is named in the path, not in the body, and the stream is asked for by the path (no `stream` field).
    const geminiPayload = buildGeminiPayload();
    const thinking = reasoningEffort ? opencodeThinkingFields(modelInfo, reasoningEffort).generationConfig?.thinkingConfig : null;
    if (thinking) geminiPayload.generationConfig = { ...geminiPayload.generationConfig, thinkingConfig: { ...geminiPayload.generationConfig?.thinkingConfig, ...thinking } };
    return { url: `${OPENCODE_CHAT_PATH}?format=gemini&model=${encodeURIComponent(modelId)}`, payload: geminiPayload, headers };
  }
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
    // A number the person set is kept, but never above the limit of the model (the service refuses it with a 400).
    const limit = opencodeMaxOutputTokens(modelInfo);
    const asked = maxTokens ?? limit ?? OPENCODE_DEFAULT_MAX_TOKENS;
    payload = {
      model: modelId,
      max_tokens: limit ? Math.min(asked, limit) : asked,
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
  // The depth of thinking, if the person (or the default of the model) asks for one.
  // (A depth that is none, or that the model does not take, gives no field: the summary is still asked for the models that give it only then.)
  const depth = reasoningEffort ? opencodeThinkingFields(modelInfo, reasoningEffort) : {};
  Object.assign(payload, Object.keys(depth).length || reasoningEffort === 'none' ? depth : opencodeSummaryFields(modelInfo));
  return { url: `${OPENCODE_CHAT_PATH}?format=${format === 'responses' || format === 'messages' ? format : 'chat'}`, payload, headers };
}
