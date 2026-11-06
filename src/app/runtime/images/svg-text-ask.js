// The request that asks a text model of any provider for one answer in words (an SVG, svg-writer.js), through the app's own request code for that provider (`streamApiCall`: the same
// that makes a reply, so Gemini, NVIDIA, OpenCode Go and the others work as they do in a chat). The page and the server each give their own streamApiCall. No window, no document.

import { NOURAS_REQUEST_PURPOSE } from '../nouras/nouras-policy.js';

// A drawing is long; a provider with a lower limit of its own cuts it down (opencode-models.js).
export const SVG_MAX_TOKENS = 32768;

export function createSvgTextAsker({ streamApiCall }) {
  if (typeof streamApiCall !== 'function') throw new TypeError('The SVG asker requires streamApiCall.');
  return async function askText({ modelInfo, parts, signal }) {
    const genConfig = { temperature: 0.7, topP: null, maxTokens: SVG_MAX_TOKENS };
    let text = '';
    await streamApiCall(parts, (chunk) => { text += chunk; }, signal, false, {
      modelInfo,
      conversation: { messages: [], astrasId: null, isWebSearchEnabled: false, genConfig },
      historyForApi: [],
      currentMessageForApi: { role: 'user', parts },
      genConfig,
      ignoreConversationWebSearch: true,
      skipMemoryContext: true,
      skipConversationSystemContext: true,
      requestPurpose: NOURAS_REQUEST_PURPOSE.BACKGROUND_SVG
    });
    return text;
  };
}
