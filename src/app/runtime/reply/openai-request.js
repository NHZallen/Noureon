// The request to OpenAI's own API (docs/superpowers/specs/2026-10-29-openai-provider-design.md): the conversation as Responses API input, sent straight to
// `https://api.openai.com/v1/responses` with the person's key (the service answers a browser: the probe of 2026-10-29), nothing kept on its side (`store: false`).
//
// Left out on purpose: temperature and top_p (the models think, and a model that thinks may refuse them) and the summary of the thinking (the probe: no summary
// events come, so there is no thinking text to show). The depth of thinking is sent as chosen. `safety_identifier` is a hash made from the account number (never a
// name or an email), sent unless the person turned it off in the settings.
//
// Shared by the page and the server: no window, no document, no browser storage.

import { OPENAI_BASE_URL } from '../shell/openai-models.js';

let currentUserId = '';
let readConfig = () => null;

/** The page says where its settings are (model-request-engine.js), so the parts that make a request without a config of their own can read the choice about the identifier. */
export const setOpenAiConfigReader = (reader) => { readConfig = typeof reader === 'function' ? reader : () => null; };

/** Whether the setting lets the anonymous identifier go to OpenAI (it does unless the person turned it off). */
export const openAiSafetyIdentifierEnabled = (config = readConfig()) => config?.openaiSafetyIdentifier !== false;

/** The page says who is signed in (features/user-ready.js); the server gives the id of the account of the reply itself. */
export const setOpenAiUserId = (id) => { currentUserId = String(id || '').trim(); };

const toHex = (buffer) => [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');

/** 32 characters of hex made from the id of an account; the same account always gives the same text and the text cannot be turned back into the account. */
export async function openAiSafetyIdentifier(userId) {
  const id = String(userId || '').trim();
  if (!id || !globalThis.crypto?.subtle) return '';
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(`noureon-user:${id}`));
  return toHex(digest).slice(0, 32);
}

/** The identifier to send, or '' (the setting is off, or nobody is known). */
export async function getOpenAiSafetyIdentifier(config = readConfig(), userId = currentUserId) {
  if (!openAiSafetyIdentifierEnabled(config)) return '';
  return openAiSafetyIdentifier(userId);
}

export function buildOpenAiRequest({
  modelId,
  apiKey,
  historyForApi,
  currentMessageForApi,
  generationConfig,
  reasoningEffort,
  reasoningConfig,
  systemInstruction,
  buildResponsesInput,
  safetyIdentifier = '',
  webSearch = false
}) {
  const instructions = systemInstruction?.parts?.map((part) => part.text).filter(Boolean).join('\n');
  const payload = {
    model: modelId,
    input: buildResponsesInput([...historyForApi, currentMessageForApi]),
    stream: true,
    // Nothing is kept on the other side; the thinking comes back encrypted and goes back with the results of the tools.
    store: false,
    include: ['reasoning.encrypted_content'],
    ...(instructions ? { instructions } : {}),
    ...(generationConfig?.maxTokens !== null && generationConfig?.maxTokens !== undefined ? { max_output_tokens: generationConfig.maxTokens } : {}),
    ...(safetyIdentifier ? { safety_identifier: safetyIdentifier } : {}),
    ...(webSearch ? { tools: [{ type: 'web_search' }] } : {})
  };
  if (reasoningConfig?.providerParameter === 'openaiReasoningEffort' && reasoningEffort) payload.reasoning = { effort: reasoningEffort };
  return {
    url: `${OPENAI_BASE_URL}/responses`,
    payload,
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
  };
}
