// The services a reply is made with (part of submit-input-council-lifecycle.js): the web search a tool-calling model uses, the server
// that makes replies while the page may be closed, and the retry button of a visual check.

import { createBrowserServerReply } from '../server-reply/server-reply-runtime.js';
import { createWebResearchTools } from '../../legacy-runtime/features/web-research-tools.js';
import { normalizePageReads, normalizeTinyfishSearch } from '../../legacy-runtime/features/model-request-formatting.js';
import { getErrorMessage, readErrorBody } from './legacy-core-utilities.js';
import { modelSupportsToolCalling } from './model-registry.js';

export function createSubmitInputReplyServices({
  document, getLiveConfig, getApiKeyForProvider, getModelApiId, getDefaultGenConfig, streamApiCall, saveAppData, showNotification, getUiLanguage,
  getActiveConversation, getCouncilSelectedModels, getCouncilTranslatorModel, getSingleDocumentTranslatorModel, modelUsesTavilySearch,
  modelSupportsVision, updateSubmitButtonState, getAbortController, vc, logger
}) {
  // What a tool-calling model searches the web with (web-research-reply.js).
  const researchTools = createWebResearchTools({ getConfig: getLiveConfig, getApiKeyForProvider, getErrorMessage, readErrorBody, normalizePageReads, normalizeTinyfishSearch });
  const webResearch = {
    canUse: (model) => Boolean(modelUsesTavilySearch(model) && modelSupportsToolCalling(model) && researchTools.hasKey()),
    searchWeb: researchTools.searchWeb,
    openPage: researchTools.fetchPageContents
  };

  // Replies the server makes while the page may be closed.
  const serverReply = createBrowserServerReply({
    getConfig: getLiveConfig, getApiKeyForProvider,
    getModelApiId,
    getDefaultGenConfig,
    // stream-api-call.js builds the system instruction for `describeOnly`.
    describeRequest: (parts, options) => streamApiCall(parts, null, undefined, false, { ...options, describeOnly: true }),
    saveAppData,
    showNotification,
    getUiLanguage,
    getActiveConversation,
    getCouncilSelectedModels,
    getCouncilTranslatorModel,
    getSingleDocumentTranslatorModel,
    onVisionLock: () => updateSubmitButtonState(false)
  });

  // The 重試 button of the note of a visual check that failed or was stopped (vision-retry.js, loaded on the first press).
  document.addEventListener?.('click', (event) => {
    const button = event.target?.closest?.('[data-vision-retry]');
    if (button && !button.disabled) void import('../features/vision-retry.js').then(({ retryVisionCheck }) => retryVisionCheck({ button, conversation: getActiveConversation(), getConfig: getLiveConfig, scheduler: vc, serverReply, supportsToolCalling: modelSupportsToolCalling, modelSupportsVision, isReplying: () => Boolean(getAbortController()), showNotification, language: getUiLanguage() })).catch((error) => logger.error?.(error));
  });
  return { researchTools, webResearch, serverReply };
}
