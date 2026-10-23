// Connects the diagnostics to the page's own parts (loaded when `noureonDiagnose()` is first called).

import { PRODUCT_VERSION } from '../../../data/version.js';
import { DEFAULT_SERVER_API_URL } from '../server-reply/server-reply.js';
import { MODELS, getCanonicalModelId } from '../shell/model-registry.js';
import { installReplyDiagnostics } from './reply-diagnostics.js';

export function diagnoseReplies({ serverReply, webResearch, getLiveConfig, getApiKeyForProvider, getActiveConversation }) {
  const diagnose = installReplyDiagnostics({
    serverReply,
    baseUrl: DEFAULT_SERVER_API_URL,
    version: PRODUCT_VERSION,
    getConfig: getLiveConfig,
    getConversation: getActiveConversation,
    resolveModel: (conversation) => MODELS.find((model) => model.id === getCanonicalModelId(conversation?.model)) || null,
    hasKey: (provider) => Boolean(getApiKeyForProvider(provider)),
    canResearch: (model) => webResearch.canUse(model)
  });
  return diagnose();
}
