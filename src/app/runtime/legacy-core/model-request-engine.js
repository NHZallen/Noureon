// How the page asks a model, loaded when it is first needed (model-request-runtime.js): the streamed call with the person's memory and
// Noura, the provider support around it (search packets, linked pages, translated attachments), the council, the calls that must
// answer in a JSON shape, and naming a conversation from its first messages.

import {
    buildTavilySearchQuery,
    formatTavilySearchPacket,
    getSearchCurrentDate,
    normalizePageReads,
    normalizeTinyfishSearch,
    withSearchContext
} from '../../legacy-runtime/features/model-request-formatting.js';
import { createStreamApiCall } from '../../legacy-runtime/features/stream-api-call.js';
import { createCurrentMemoryContextProvider } from '../memory/current-memory-context-provider.js';
import { createCouncilResponseLifecycle } from '../../legacy-runtime/features/council-response-lifecycle.js';
import { createProviderRequestSupport } from '../../legacy-runtime/features/provider-request-support.js';
import { createSettingsProviderStructuredHelpers } from './settings-provider-structured-helpers.js';
import { createSettingsTitleSummaryHelpers } from './settings-title-summary-helpers.js';
import { createMemoryModelRunner } from './memory-model-runner.js';
import { getModelReasoningConfig, modelSupportsToolCalling, normalizeReasoningEffort } from './model-registry.js';
import { opencodeModelReadsOfficeViaPdf } from './opencode-models.js';
import { createPageCouncilMembers } from '../../legacy-runtime/features/council-members-page.js';

export function createModelRequestEngine({
    fetch, console, elements: ALL_ELEMENTS, state, getMemory = () => null, models: MODELS, i18n, config, astras, personalMemories,
    cheapModelId: CHEAP_MODEL_ID, councilResponseCharLimit: COUNCIL_RESPONSE_CHAR_LIMIT, councilRetryDelayMs: COUNCIL_RETRY_DELAY_MS,
    councilMaxModels: COUNCIL_MAX_MODELS, getActiveConversation, normalizeConversationModel, getModelApiId, getApiKeyForProvider,
    getDefaultGenConfig, modelSupportsUploadedFile, modelSupportsVision, modelSupportsDocumentUpload, modelUsesTavilySearch,
    modelUsesNativeWebSearch, getErrorMessage, readErrorBody, getSingleDocumentTranslatorModel, getCouncilSelectedModels, getCouncilTexts,
    getCouncilRuntimeTexts, getCouncilAttachmentTranslationNeed, getCouncilTranslatorModel, renderHistorySidebar, conversationStateAccess,
    saveAppData, showNotification
}) {
    const getMemoryContext = createCurrentMemoryContextProvider({
        getMemoryState: () => state.memoryState,
        retrieveHistory: async options => {
            const retrieve = getMemory()?.retrieveHistory;
            return typeof retrieve === 'function' ? retrieve(options) : [];
        }
    });

    const streamApiCall = createStreamApiCall({
        getActiveConversation,
        normalizeConversationModel,
        getModelApiId,
        getApiKeyForProvider,
        getDefaultGenConfig,
        getConfig: () => config,
        getAstras: () => astras,
        getPersonalMemories: () => personalMemories,
        getMemoryContext,
        modelSupportsUploadedFile,
        modelSupportsVision,
        getModelReasoningConfig,
        normalizeReasoningEffort,
        getText: (key) => i18n[config.uiLanguage]?.[key] || ''
    });
    const runMemoryModel = createMemoryModelRunner({ streamApiCall, models: MODELS });
    const providerRequestSupport = createProviderRequestSupport({
        buildTavilySearchQuery,
        formatTavilySearchPacket,
        normalizeTinyfishSearch,
        normalizePageReads,
        withSearchContext,
        getErrorMessage,
        readErrorBody,
        getApiKeyForProvider,
        getConfig: () => config,
        streamApiCall,
        getSingleDocumentTranslatorModel,
        modelReadsOfficeViaPdf: opencodeModelReadsOfficeViaPdf,
        modelUsesTavilySearch,
        modelSupportsUploadedFile,
        modelSupportsVision,
        councilResponseCharLimit: COUNCIL_RESPONSE_CHAR_LIMIT,
        councilRetryDelayMs: COUNCIL_RETRY_DELAY_MS
    });
    const {
        buildSingleModelTranslatedRequestParts,
        extractTextFromParts,
        fetchTavilySearchPacket,
        filterPartsForModelCapability,
        readLinkedPages,
        readsLinkedPages,
        streamCouncilApiCallWithRetry,
        truncateCouncilText
    } = providerRequestSupport;
    const councilResponseLifecycle = createCouncilResponseLifecycle({
        getSearchCurrentDate,
        getConfig: () => config,
        getActiveConversation,
        getCouncilSelectedModels,
        getCouncilTexts,
        getCouncilRuntimeTexts,
        getCouncilAttachmentTranslationNeed,
        getCouncilTranslatorModel,
        models: MODELS,
        councilMaxModels: COUNCIL_MAX_MODELS,
        extractTextFromParts,
        truncateCouncilText,
        filterPartsForModelCapability,
        readLinkedPages,
        readsLinkedPages,
        streamCouncilApiCallWithRetry,
        createMembers: createPageCouncilMembers({ streamApiCall, support: providerRequestSupport, getConfig: () => config, modelSupportsToolCalling, modelUsesNativeWebSearch, retryDelayMs: COUNCIL_RETRY_DELAY_MS }),
        modelSupportsVision,
        modelSupportsDocumentUpload
    });
    const runModelCouncil = (...args) => councilResponseLifecycle.runModelCouncil(...args);
    const structuredHelpers = createSettingsProviderStructuredHelpers({
        fetchImpl: fetch,
        getApiKeyForProvider,
        readErrorBody,
        cheapModelId: CHEAP_MODEL_ID,
        logger: console
    });
    const {
        callApiWithSchema
    } = structuredHelpers;
    const titleSummaryHelpers = createSettingsTitleSummaryHelpers({
        callApiWithSchema
    });
    const {
        requestTitleSummary
    } = titleSummaryHelpers;
    const generateTitleAndSummary = async (conv) => {
        const data = await requestTitleSummary(conv, undefined, {
            language: config.aiDefaultLanguage || config.uiLanguage
        });
        if (data && data.title) {
            conv.title = data.title;
            delete conv.summary;
            conv.isNaming = false;
            await saveAppData();
            renderHistorySidebar();
            if (conv.id === conversationStateAccess.getCurrentConversationId()) { ALL_ELEMENTS.headerTitle.textContent = conv.title; }
            showNotification(i18n[config.uiLanguage].autoNamed || '對話已自動命名', 'success');
        } else {
            conv.isNaming = false;
            await saveAppData();
            renderHistorySidebar();
            console.error("Auto-naming failed: No valid JSON found in the response.");
        }
    };
    return {
        streamApiCall,
        runMemoryModel,
        buildSingleModelTranslatedRequestParts,
        fetchTavilySearchPacket,
        streamCouncilApiCallWithRetry,
        runModelCouncil,
        callApiWithSchema,
        generateTitleAndSummary
    };
}
