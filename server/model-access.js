// How the server talks to the model of a reply: the page's own request code (createStreamApiCall), given the model, the keys and the
// language from the RunSpec instead of what the page knows. A reply and the visual check that follows it use the same.

import { createStreamApiCall } from '../src/app/runtime/reply/stream-api-call.js';
import { createServerOfficeReader } from './office-deps.js';
import { getModelReasoningConfig, modelSupportsUploadedFile, modelSupportsVision, normalizeReasoningEffort } from '../src/app/runtime/shell/model-registry.js';
import { createUpstreamFetch } from './upstream-fetch.js';

const SEARCH_SOURCES = ['tavily', 'tinyfish'];

export const DEFAULT_GENERATION = Object.freeze({ temperature: 0.7, topP: 0.95, maxTokens: null });

/** Resolves { streamApiCall, upstreamFetch, modelInfo, conversation, keyFor, config, language }. */
export function createModelAccess({ spec, secrets, fetchImpl = fetch, grounding = false, userId = '', signal }) {
  const language = spec.request.language;
  const modelInfo = spec.model.info;
  const upstreamFetch = createUpstreamFetch({ fetchImpl });
  const conversation = { id: spec.conversationId, messages: [], astrasId: null, isWebSearchEnabled: grounding, genConfig: null, reasoningEffort: spec.request.reasoningEffort ?? null };
  const keyFor = (name) => {
    if (name === modelInfo.provider) return secrets.providerKey || '';
    // The translator of documents, when it is of another provider than the reply's (spec.documents.translator).
    if (secrets.translatorKey && name === spec.documents?.translator?.provider) return secrets.translatorKey;
    if (name === spec.tools.searchProvider) return secrets.searchKey || '';
    // The other search source (the page falls back to it when the chosen one finds nothing).
    if (SEARCH_SOURCES.includes(name)) return secrets.searchKeyAlt || '';
    return '';
  };
  const config = { searchProvider: spec.tools.searchProvider, tavilySearchDepth: spec.tools.searchDepth === 'advanced' ? 'advanced' : 'basic', aiDefaultLanguage: language, uiLanguage: language, memorySystemVersion: 1, memoryEnabled1: false, isLearningMode: false };
  const streamApiCall = createStreamApiCall({
    getActiveConversation: () => conversation,
    normalizeConversationModel: () => modelInfo,
    // The reply's model is the one of the spec; a call made for another model (the translator of documents) names its own.
    getModelApiId: (model) => (model && model !== modelInfo ? model.apiId || model.id : spec.model.id),
    getApiKeyForProvider: keyFor,
    getDefaultGenConfig: () => ({ ...DEFAULT_GENERATION }),
    getConfig: () => config,
    getAstras: () => [],
    getPersonalMemories: () => [],
    getMemoryContext: () => null,
    modelSupportsUploadedFile,
    modelSupportsVision,
    officeReader: createServerOfficeReader({ userId, signal }),
    getModelReasoningConfig,
    normalizeReasoningEffort,
    fetchImpl: upstreamFetch,
    warn: () => {}
  });
  return { streamApiCall, upstreamFetch, modelInfo, conversation, keyFor, config, language };
}
