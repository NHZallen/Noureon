// How the server talks to the model of a reply: the page's own request code (createStreamApiCall), given the model, the keys and the
// language from the RunSpec instead of what the page knows. A reply and the visual check that follows it use the same.

import { createStreamApiCall } from '../src/app/legacy-runtime/features/stream-api-call.js';
import { getModelReasoningConfig, modelSupportsUploadedFile, modelSupportsVision, normalizeReasoningEffort } from '../src/app/runtime/legacy-core/model-registry.js';
import { createUpstreamFetch } from './upstream-fetch.js';

export const DEFAULT_GENERATION = Object.freeze({ temperature: 0.7, topP: 0.95, maxTokens: null });

/** Resolves { streamApiCall, upstreamFetch, modelInfo, conversation, keyFor, config, language }. */
export function createModelAccess({ spec, secrets, fetchImpl = fetch, grounding = false }) {
  const language = spec.request.language;
  const modelInfo = spec.model.info;
  const upstreamFetch = createUpstreamFetch({ fetchImpl });
  const conversation = { messages: [], astrasId: null, isWebSearchEnabled: grounding, genConfig: null, reasoningEffort: spec.request.reasoningEffort ?? null };
  const keyFor = (name) => {
    if (name === modelInfo.provider) return secrets.providerKey || '';
    if (name === spec.tools.searchProvider) return secrets.searchKey || '';
    return '';
  };
  const config = { searchProvider: spec.tools.searchProvider, tavilySearchDepth: 'basic', aiDefaultLanguage: language, uiLanguage: language, memorySystemVersion: 1, memoryEnabled1: false, isLearningMode: false };
  const streamApiCall = createStreamApiCall({
    getActiveConversation: () => conversation,
    normalizeConversationModel: () => modelInfo,
    getModelApiId: () => spec.model.id,
    getApiKeyForProvider: keyFor,
    getDefaultGenConfig: () => ({ ...DEFAULT_GENERATION }),
    getConfig: () => config,
    getAstras: () => [],
    getPersonalMemories: () => [],
    getMemoryContext: () => null,
    modelSupportsUploadedFile,
    modelSupportsVision,
    getModelReasoningConfig,
    normalizeReasoningEffort,
    fetchImpl: upstreamFetch,
    warn: () => {}
  });
  return { streamApiCall, upstreamFetch, modelInfo, conversation, keyFor, config, language };
}
