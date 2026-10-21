import { createCouncilControlsLifecycle } from '../council/council-controls-lifecycle.js';
import { createModelSwitcherLifecycle } from '../features/model-switcher-lifecycle.js';
import { createResponseProgressRenderers } from '../reply/response-progress-renderers.js';
import { createSingleModelResponseLifecycle } from '../reply/single-model-response-lifecycle.js';
import { createSubmitInputPreparationLifecycle } from '../features/submit-input-preparation-lifecycle.js';
import { finalizeAssistantResponse, persistAssistantResponseError } from '../reply/assistant-response-finalization.js';
import { runCouncilResponseRenderLifecycle } from '../council/council-response-render-lifecycle.js';
import { runSubmitFinalCleanupLifecycle } from '../reply/submit-final-cleanup-lifecycle.js';
import { applyModelMessagePostResponseActions } from '../reply/model-message-post-response-actions.js';
import { appendRendererTextGradually } from '../reply/renderer-gradual-append-controller.js';
import { replaceHistorySourceMessage } from '../reply/history-source-message-refresh.js';
import { getOpenCouncilDetailKeys, restoreOpenCouncilDetails } from '../council/streaming-council-details.js';
import { createImageModeControls } from '../images/image-mode-controls.js';
import { createSubmitInputComposer } from './submit-input-composer.js';
import { createSubmitInputPlayback } from './submit-input-playback.js';
import { revealGeneratedImage } from './submit-input-image-reveal.js';
import { createSubmitInputReplyServices } from './submit-input-reply-services.js';
import { collectHistorySourceConversationIds } from '../memory/history-source-references.js';
import { canCaptureConversationMessage } from '../features/temporary-chat-state.js';
import { createDeckDesignControl } from '../features/deck-design-control.js';
import { createVisionCheckScheduler } from '../features/vision-check-scheduler.js';
import { getSearchProvider } from '../kernel/search-provider.js';
import { stopReplyAndWait } from '../features/reply-stop.js';
import { createServerReplyReattach } from '../server-reply/reattach.js';
import { createResearchMode } from '../research/research-mode.js';
import { setVisionLocked } from '../features/vision-check-lock.js';
import { visionText } from '../../ui/files/vision/vision-texts.js';
import { createProgressTicker } from '../features/progress-ticker.js';
import {
  getModelReasoningConfig,
  getReasoningEffortLabel,
  modelSupportsToolCalling,
  normalizeReasoningEffort
} from './model-registry.js';

const REQUIRED_DEPENDENCIES = [
  'document',
  'elements',
  'uploads',
  'reply',
  'models',
  'i18n',
  'getActiveConversation',
  'normalizeConversationModel',
  'saveAppData',
  'saveConfig',
  'renderHistorySidebar',
  'addMessageToUI',
  'showNotification',
  'showCustomDialog'
];

export function createSubmitInputCouncilLifecycle(dependencies = {}) {
  for (const key of REQUIRED_DEPENDENCIES) {
    if (dependencies[key] == null) {
      throw new Error(`createSubmitInputCouncilLifecycle missing dependency: ${key}`);
    }
  }

  const {
    window,
    document,
    elements: ALL_ELEMENTS,
    // Functions made after this lifecycle by shell.js, called once the page runs.
    updateSubmitButtonState,
    updateInputState,
    generateTitleAndSummary,
    adjustTextareaHeight,
    renderFilePreviews,
    // The files waiting to be sent and the reply being made (shell/shell-state.js), and the Nouras of the workspace.
    uploads,
    reply,
    getAstras = () => [],
    models: MODELS,
    openRouterVisionModels = [],
    i18n,
    councilMinModels = 2,
    councilMaxModels = 4,
    councilResponseCharLimit = 1800,
    councilRetryDelayMs = 600,
    closeAllPopovers = () => {},
    escapeHTML = (value = '') => String(value ?? ''),
    formatCouncilModelSummary = () => '',
    formatFullTimestamp = () => '',
    getActiveConversation,
    getConfig = () => ({}),
    runtimeConfigAccess = { getUiLanguage: () => getLiveConfig().uiLanguage },
    getCouncilRuntimeTexts = () => ({}),
    getCouncilSelectedModels = () => ({ participants: [], synthesizer: null, council: {} }),
    getCouncilTranslatorModel = () => null,
    getCouncilTexts = () => ({}),
    getCouncilValidation = () => ({ ok: true, message: '' }),
    getModelApiId = (model) => model?.id || '',
    getModelFamilyKey = (model) => model?.id || '',
    getModelFamilyName = (model) => model?.name || '',
    getModelPriceLabel = () => '',
    getModelRetirementLabel = () => '',
    getModelTiers = () => [],
    getModelsByIds = () => [],
    getApiKeyForProvider = () => '',
    requestDecisions,
    getOutputMode = () => 'typewriter',
    getProviderLabel = (provider) => provider || '',
    getSingleDocumentTranslatorModel = () => null,
    getVisibleCouncilModels = () => [],
    hasCouncilWebSearchAccess = () => false,
    hasSingleDocumentAccess = () => false,
    hasSingleWebSearchAccess = () => false,
    isCouncilEnabled = () => false,
    modelSupportsDocumentUpload = () => false,
    modelSupportsVision = () => false,
    modelSupportsWebSearch = () => false,
    modelUsesTavilySearch = () => false,
    modelGeneratesImages = () => false,
    imageGenerationResponseLifecycle = null,
    normalizeCouncilConfig = (value) => value,
    cloneCouncilConfig = (value) => ({ ...(value || {}) }),
    normalizeConversationModel,
    renderChat = () => {},
    renderHistorySidebar,
    renderSidebar = renderHistorySidebar,
    renderMarkdown = (value) => String(value ?? ''),
    renderMarkdownWithFormulas = renderMarkdown,
    renderUserText = (value) => String(value ?? ''),
    addMessageToUI,
    refreshMessageHistorySources = () => null,
    buildSingleModelTranslatedRequestParts,
    streamApiCall,
    getDefaultGenConfig = () => ({ temperature: 0.7, topP: 0.95, maxTokens: null }),
    runModelCouncil,
    extractPersonalMemory,
    requestAnimationFrame = (callback) => callback(),
    AbortController = globalThis.AbortController,
    crypto = globalThis.crypto,
    setTimeout: scheduleTimeout = (callback) => callback(),
    clearTimeout: clearScheduledTimeout = () => {},
    saveAppData,
    saveConfig,
    showNotification,
    updateApiKeyWarningBadge = () => {},
    getFileInputContainer = () => ALL_ELEMENTS.fileInputContainer,
    getActiveAstrasId = () => getActiveConversation()?.astrasId || null,
    deactivateAstras = () => {},
    onRegularSubmit = () => {},
    getComposerEditSubmission = () => null,
    getQuoteReference = () => null,
    buildQuotedUserParts = ({ question }) => question ? [{ text: question }] : [],
    clearQuoteReference = () => {},
    beginFirstSubmit = () => false,
    onConversationStarted = () => {},
    showCustomDialog,
    logger = console
  } = dependencies;

  const getLiveConfig = () => getConfig() || {};
  const getUiLanguage = () => runtimeConfigAccess.getUiLanguage?.()
    || getLiveConfig().uiLanguage
    || 'zh-TW';
  const getLocalizedText = (key, fallback) => i18n[getUiLanguage()]?.[key] || fallback;
  const getUploadedFiles = () => uploads.getUploadedFiles() || [];
  const setUploadedFiles = (files) => { uploads.setUploadedFiles(files); };
  const getAbortController = () => reply.getAbortController() || null;
  const setAbortController = (value) => { reply.setAbortController(value); };
  const getIsCouncilRunning = () => Boolean(reply.isCouncilRunning());
  const setIsCouncilRunning = (value) => { reply.setCouncilRunning(value); };
  const vc = createVisionCheckScheduler({ getConfig: getLiveConfig, getActiveConversation, normalizeConversationModel, isCouncilEnabled, getCouncilSelectedModels, modelSupportsVision, streamApiCall, document, window, notificationContainer: ALL_ELEMENTS.notificationContainer, addMessageToUI, saveAppData, showNotification, crypto, logger, AbortController,
    // The composer follows the checks: a chat with one running cannot send.
    onChange: (conversationIds) => {
      setVisionLocked('page', conversationIds);
      updateSubmitButtonState(false);
    } });
  const isImageConversation = (conversation = getActiveConversation()) => modelGeneratesImages(
    normalizeConversationModel(conversation)
  );
  let renderCouncilControls = () => {};
  let openModelPicker = async () => false;
  let noteConversationModels = async () => {};
  let renderModelSwitcher = () => {};
  const imageModeControls = createImageModeControls({
    document,
    getActiveConversation,
    getActiveModel: () => normalizeConversationModel(getActiveConversation()),
    modelGeneratesImages,
    saveAppData,
    onChange: (...args) => renderInputIndicators(...args),
    getText: getLocalizedText
  });

  const deckDesignControl = createDeckDesignControl({
    document,
    getActiveConversation,
    saveAppData,
    getUiLanguage,
    closeAllPopovers,
    isImageChat: isImageConversation,
    getConfig: getLiveConfig,
    normalizeConversationModel,
    isCouncilEnabled
  });

  let researchMode = null;
  const {
    openCouncilPopoverFromAttachmentMenu,
    ensureCouncilMenuButton,
    updateFunctionButtonsState,
    toggleLearningMode,
    renderInputIndicators,
    updateFileInputUI,
    seedCouncilParticipants,
    persistCouncilConfig,
    getCouncilModeLabel,
    getCouncilModelList
  } = createSubmitInputComposer({
    document, elements: ALL_ELEMENTS, updateInputState, getAstras, models: MODELS, i18n, openRouterVisionModels, councilMinModels, councilMaxModels,
    getLiveConfig, getLocalizedText, getUploadedFiles, getActiveConversation, normalizeConversationModel, isImageConversation,
    getCouncilSelectedModels, getCouncilTexts, getCouncilValidation, getVisibleCouncilModels, isCouncilEnabled, normalizeCouncilConfig, cloneCouncilConfig,
    modelSupportsVision, hasSingleDocumentAccess, hasCouncilWebSearchAccess, hasSingleWebSearchAccess,
    imageModeControls, deckDesignControl, closeAllPopovers, escapeHTML, getActiveAstrasId, deactivateAstras,
    saveAppData, saveConfig, showNotification, updateApiKeyWarningBadge,
    late: {
      openModelPicker: (...args) => openModelPicker(...args),
      renderCouncilControls: (...args) => renderCouncilControls(...args),
      renderModelSwitcher: (...args) => renderModelSwitcher(...args),
      researchMode: () => researchMode
    }
  });

  ({ renderCouncilControls, openModelPicker, noteConversationModels } = createCouncilControlsLifecycle({
    closeAllPopovers,
    councilMaxModels,
    document,
    escapeHTML,
    getActiveConversation,
    getComposerAnchor: () => ALL_ELEMENTS.voiceInputBtnMessage,
    getConfig: getLiveConfig,
    getCouncilModelList,
    getCouncilRuntimeTexts,
    getCouncilTexts,
    getCouncilValidation: (conversation, files) => isImageConversation(conversation)
      ? { ok: true, message: '' }
      : getCouncilValidation(conversation, files),
    getI18n: () => i18n,
    getFileInputContainer,
    getIsCouncilRunning,
    getModelApiId,
    getModelReasoningConfig,
    getModelRetirementLabel,
    getModelTiers,
    getModelsByIds,
    getProviderLabel,
    getReasoningEffortLabel,
    getSingleDocumentTranslatorModel,
    hasCouncilWebSearchAccess,
    isImageConversation,
    modelSupportsDocumentUpload,
    modelSupportsVision,
    modelSupportsWebSearch,
    models: MODELS,
    normalizeConversationModel,
    normalizeCouncilConfig,
    normalizeReasoningEffort,
    persistCouncilConfig,
    renderInputIndicators,
    renderSidebar,
    requestFrame: requestAnimationFrame,
    saveAppData,
    saveConfig,
    seedCouncilParticipants,
    showCustomDialog,
    showNotification
  }));

  const {
    renderCouncilProgress,
    renderSingleModelError,
    renderSingleModelProgress
  } = createResponseProgressRenderers({
    escapeHTML,
    getUiLanguage: () => getLiveConfig().uiLanguage,
    getCouncilRuntimeTexts
  });

  ({ renderModelSwitcher } = createModelSwitcherLifecycle({
    getModelSwitcherContainer: () => ALL_ELEMENTS.modelSwitcherContainer,
    renderCouncilControls
  }));

  const {
    typewriterStream,
    renderIncrementalResponse,
    playbackTypewriterResponse,
    playbackStreamingMarkdownResponse,
    createStreamingMarkdownRenderer,
    streamMarkdownResponse
  } = createSubmitInputPlayback({
    document, elements: ALL_ELEMENTS, renderMarkdown, renderMarkdownWithFormulas, getUiLanguage, getLocalizedText,
    requestAnimationFrame, scheduleTimeout, logger
  });

  const { startProgressTicker, stopProgressTicker } = createProgressTicker(scheduleTimeout, clearScheduledTimeout);

  const { researchTools, webResearch, serverReply } = createSubmitInputReplyServices({
    document, getLiveConfig, getApiKeyForProvider, getModelApiId, getDefaultGenConfig, streamApiCall: (...args) => streamApiCall(...args), saveAppData,
    showNotification, getUiLanguage, getActiveConversation, getCouncilSelectedModels, getCouncilTranslatorModel, getSingleDocumentTranslatorModel,
    modelUsesTavilySearch, modelSupportsVision, updateSubmitButtonState, getAbortController, vc, logger
  });

  const singleModelResponseLifecycle = createSingleModelResponseLifecycle({
    now: () => Date.now(),
    getOutputMode,
    renderSingleModelProgress,
    startProgressTicker,
    stopProgressTicker,
    buildSingleModelTranslatedRequestParts: (...args) => buildSingleModelTranslatedRequestParts(...args),
    streamApiCall: (...args) => streamApiCall(...args),
    streamMarkdownResponse,
    playbackStreamingMarkdownResponse,
    renderIncrementalResponse,
    getOpenCouncilDetailKeys,
    restoreOpenCouncilDetails,
    getConfig: getLiveConfig,
    supportsToolCalling: modelSupportsToolCalling,
    supportsVision: modelSupportsVision,
    webResearch,
    serverReply
  });

  const submitInputPreparationLifecycle = createSubmitInputPreparationLifecycle({
    elements: {
      messageInput: ALL_ELEMENTS.messageInput
    },
    getAbortController,
    setAbortController,
    createAbortController: () => new AbortController(),
    getUploadedFiles,
    setUploadedFiles,
    getActiveConversation,
    updateSubmitButtonState: (...args) => updateSubmitButtonState(...args),
    getCouncilValidation,
    showNotification,
    renderCouncilControls,
    isCouncilEnabled,
    getCouncilRuntimeTexts,
    addMessageToUI: (...args) => addMessageToUI(...args),
    renderHistorySidebar,
    getAutoNaming: () => getLiveConfig().autoNaming,
    generateTitleAndSummary: (...args) => generateTitleAndSummary(...args),
    saveAppData,
    getAutoWebSearchEnabled: () => getLiveConfig().enableAutoWebSearch,
    requestDecisions,
    canAutoEnableWebSearch: (conversation) => {
      const modelInfo = normalizeConversationModel(conversation);
      if (isCouncilEnabled(conversation)) {
        const { synthesizer } = getCouncilSelectedModels(conversation);
        if (!hasCouncilWebSearchAccess(synthesizer || modelInfo)) return false;
        if (modelUsesTavilySearch(synthesizer || modelInfo) && !getApiKeyForProvider(getSearchProvider(getLiveConfig()))) return false;
        return true;
      }
      if (!hasSingleWebSearchAccess(modelInfo)) return false;
      if (modelUsesTavilySearch(modelInfo) && !getApiKeyForProvider(getSearchProvider(getLiveConfig()))) return false;
      return true;
    },
    canModelDecideWebSearch: (conversation) => !isCouncilEnabled(conversation) && webResearch.canUse(normalizeConversationModel(conversation)),
    getAutoSearchNotice: () => i18n[getLiveConfig().uiLanguage].autoSearchNotice || '自動啟用網路搜尋。',
    renderInputIndicators,
    adjustTextareaHeight: (...args) => adjustTextareaHeight(...args),
    renderFilePreviews: (...args) => renderFilePreviews(...args),
    requestFrame: (callback) => requestAnimationFrame(callback),
    isImageConversation,
    getQuoteReference,
    buildQuotedUserParts,
    clearQuoteReference,
    beginFirstSubmit,
    onConversationStarted
  });

  const prepareDefaultSubmit = async () => {
    const preparedSubmit = await submitInputPreparationLifecycle.prepareSubmitResponse();
    return preparedSubmit;
  };
  researchMode = createResearchMode({
    document, getActiveConversation, normalizeConversationModel, modelSupportsToolCalling, isImageConversation, isCouncilEnabled, serverReply, researchTools,
    addMessageToUI, saveAppData, showNotification, getUiLanguage, logger, closeAllPopovers, setAbortController, updateSubmitButtonState,
    messageInput: ALL_ELEMENTS.messageInput, prepare: prepareDefaultSubmit, getConfig: getLiveConfig, saveConfig,
    refresh: () => { renderInputIndicators(); updateFunctionButtonsState(); }
  });
  const handleFormSubmit = async (event, submitOptions = {}) => {
    event?.preventDefault?.();
    let effectiveSubmitOptions = submitOptions;
    if (!effectiveSubmitOptions.preserveComposer) effectiveSubmitOptions = getComposerEditSubmission() || effectiveSubmitOptions;
    const isEdit = Boolean(effectiveSubmitOptions.preserveComposer);
    const activeId = getActiveConversation()?.id;
    if (isEdit) {
      // An edit cuts the conversation at the edited message: a reply being written or a visual check would add itself back, so both stop first.
      vc.cancel(activeId);
      await stopReplyAndWait({ getAbortController, wait: (ms) => new Promise((resolve) => scheduleTimeout(resolve, ms)) });
      await effectiveSubmitOptions.prepare?.();
    } else if (vc.isRunning(activeId)) {
      // The visual check is still on the last message: nothing is sent until it is done or stopped.
      showNotification(visionText(getUiLanguage(), 'sendLockedNotice'), 'warning');
      return;
    } else {
      onRegularSubmit();
    }
    if (researchMode.takes(effectiveSubmitOptions)) return researchMode.submit();
    const preparedSubmit = Object.keys(effectiveSubmitOptions).length > 0
      ? await submitInputPreparationLifecycle.prepareSubmitResponse(effectiveSubmitOptions)
      : await prepareDefaultSubmit();
    if (!preparedSubmit.shouldContinue) return;
    await completePreparedReply(preparedSubmit);
  };

  // After the preparation: the reply is made, shown and kept.
  const completePreparedReply = async (preparedSubmit, { resumeRun = null } = {}) => {
    const {
      abortController: submitAbortController,
      contentDiv,
      conversation: conv,
      loadingMessageDiv,
      responseUsesCouncil,
      webSearchEnabled,
      userMessage,
      userMessageObject,
      userParts
    } = preparedSubmit;

    // The reply's message id comes first: the server writes under it.
    const assistantMessageId = resumeRun?.assistantMessageId || crypto.randomUUID();
    try {
      let fullResponse = '';
      const finalAiMessage = { id: assistantMessageId, role: 'model', parts: [{ text: '' }], createdAt: new Date().toISOString() };
      let councilMetadata = null;
      let responseRenderedInRealtime = false;
      let generatedImageParts = null;
      let extraParts = [];
      const historySourceConversationIds = new Set();
      const collectHistorySources = (memoryContext) => {
        collectHistorySourceConversationIds(memoryContext).forEach((id) => historySourceConversationIds.add(id));
      };

      if (responseUsesCouncil) {
        const councilResult = await runCouncilResponseRenderLifecycle({
          contentDiv,
          userParts,
          signal: submitAbortController.signal,
          getOutputMode,
          runModelCouncil: (...args) => serverReply.council({
            args, local: runModelCouncil, webSearchEnabled, conversation: conv, onMemoryContextResolved: collectHistorySources,
            getHistorySourceIds: () => [...historySourceConversationIds], assistantMessageId, sequence: conv.messages.length, resumeRun
          }),
          renderCouncilProgress,
          createStreamingMarkdownRenderer,
          appendRendererTextGradually,
          startProgressTicker,
          stopProgressTicker,
          setCouncilRunning: setIsCouncilRunning,
          renderCouncilControls,
          renderInputIndicators,
          requestFrame: (callback) => requestAnimationFrame(callback),
          confirmExit: ({ modelName }) => import('../council/council-exit-dialog.js').then((module) => module.confirmCouncilExit({ showCustomDialog, language: getLiveConfig().uiLanguage, modelName })),
          // The synthesis is a reply of the synthesizer (its steps, files and questions), in this message.
          continueWithReply: (options) => singleModelResponseLifecycle.run({ conversation: conv, modelInfo: getCouncilSelectedModels(conv).synthesizer, uiLanguage: getLiveConfig().uiLanguage, assistantMessageId, ...options })
        });
        fullResponse = councilResult.fullResponse;
        extraParts = councilResult.extraParts || [];
        responseRenderedInRealtime = councilResult.responseRenderedInRealtime;
        councilMetadata = councilResult.metadata;
      } else {
        const modelInfo = normalizeConversationModel(conv);
        if (modelGeneratesImages(modelInfo)) {
          if (!imageGenerationResponseLifecycle) throw new Error(getLocalizedText('imageFeatureNotReady'));
          const imageResult = await imageGenerationResponseLifecycle.run({
            targetElement: contentDiv, userParts, modelInfo, conversation: conv, webSearchEnabled, signal: submitAbortController.signal,
            uiLanguage: getLiveConfig().uiLanguage, serverReply, assistantMessageId, resumeRun,
            requestImageDecisions: requestDecisions?.image
          });
          generatedImageParts = imageResult.parts;
        } else {
          const singleResult = await singleModelResponseLifecycle.run({
            targetElement: contentDiv,
            userParts,
            modelInfo,
            conversation: conv,
            webSearchEnabled,
            onMemoryContextResolved: collectHistorySources,
            signal: submitAbortController.signal,
            uiLanguage: getLiveConfig().uiLanguage,
            // The message the reply becomes: the server writes it under this id.
            assistantMessageId,
            sequence: conv.messages.length,
            getHistorySourceIds: () => [...historySourceConversationIds],
            resumeRun
          });
          fullResponse = singleResult.fullResponse;
          responseRenderedInRealtime = singleResult.responseRenderedInRealtime;
          extraParts = singleResult.extraParts || [];
        }
      }

      await finalizeAssistantResponse({
        fullResponse,
        finalParts: generatedImageParts,
        extraParts,
        finalAiMessage,
        councilMetadata,
        includeCouncilMetadata: responseUsesCouncil,
        conversation: conv,
        userMessageObject,
        userMessageText: userMessage,
        signal: submitAbortController.signal,
        responseUsesCouncil,
        responseRenderedInRealtime,
        targetElement: contentDiv,
        uiLanguage: getLiveConfig().uiLanguage,
        memoryEnabled: canCaptureConversationMessage(conv, userMessageObject)
          && (getLiveConfig().memorySystemVersion === 2 || getLiveConfig().memoryEnabled1),
        // v2 Memory Summary is always refreshed in the background. The retired legacy toggle no
        // longer suppresses capture for an existing user configuration.
        autoMemoryEnabled: canCaptureConversationMessage(conv, userMessageObject)
          && (getLiveConfig().memorySystemVersion === 2 || getLiveConfig().enableAutoMemory),
        historySourceConversationIds: [...historySourceConversationIds],
        persistAppData: saveAppData,
        completeSingleModelView: (options) => singleModelResponseLifecycle.completeView(options),
        scheduleVisionCheck: serverReply.visionSchedule(vc.schedule),
        restoreRealtimeCouncilDetails: ({ targetElement }) => restoreOpenCouncilDetails(targetElement, getOpenCouncilDetailKeys(targetElement)),
        renderRealtimeCouncilFinal: ({ targetElement, fullResponse }) => renderIncrementalResponse(targetElement, fullResponse, { final: true, preserveCouncilDetails: true }),
        playbackCouncilResponse: ({ targetElement, fullResponse, signal }) => playbackStreamingMarkdownResponse(targetElement, fullResponse, signal, true),
        extractPersonalMemory: (userMessageText, fullResponse) => extractPersonalMemory(userMessageText, fullResponse),
        completeImageView: generatedImageParts
          ? () => revealGeneratedImage({ finalAiMessage, conversation: conv, loadingMessageDiv, addMessageToUI, requestAnimationFrame })
          : null
      });
      if (historySourceConversationIds.size > 0) {
        replaceHistorySourceMessage({ finalAiMessage, loadingMessageDiv, refreshMessageHistorySources });
      }
    } catch (error) {
      await persistAssistantResponseError({
        error,
        signal: submitAbortController?.signal,
        conversation: conv,
        targetElement: contentDiv,
        errorPrefix: i18n[getLiveConfig().uiLanguage].errorPrefix,
        fallbackModelName: normalizeConversationModel(conv)?.name || conv.model,
        getLatestProgress: () => (!responseUsesCouncil && singleModelResponseLifecycle.getLatestProgress()),
        stopSingleModelLifecycle: () => singleModelResponseLifecycle.stop(),
        renderError: renderSingleModelError,
        persistAppData: saveAppData,
        // An error the server reported is saved under its message id.
        messageId: error?.serverRun ? assistantMessageId : null
      });
    } finally {
      if (conv.__astraPendingResponse?.loadingMessageDiv === loadingMessageDiv) {
        delete conv.__astraPendingResponse;
      }
      const nothingSent = submitAbortController.signal.aborted && conv.messages.at(-1)?.role === 'user';
      if (nothingSent) {
        loadingMessageDiv?.remove();
      } else {
        // The models this message went to are offered first next time.
        noteConversationModels(conv).catch(() => {});
      }
      const lastMessageElement = runSubmitFinalCleanupLifecycle(
        () => singleModelResponseLifecycle.stop(),
        () => { setIsCouncilRunning(false); setAbortController(null); },
        (...args) => updateSubmitButtonState(...args),
        (...args) => updateInputState(...args),
        renderCouncilControls,
        renderInputIndicators,
        () => getActiveConversation()?.id === conv.id ? ALL_ELEMENTS.messageList.lastElementChild : null
      );
      applyModelMessagePostResponseActions({
        lastMessageElement,
        conversation: conv,
        i18n,
        uiLanguage: getLiveConfig().uiLanguage,
        formatTimestamp: formatFullTimestamp
      });
    }
  };

  // A reply the server is still making is shown when the page opens (reattach.js).
  const { reattachServerReply } = createServerReplyReattach({
    getActiveConversation,
    getAbortController,
    setAbortController,
    serverReply,
    messageList: () => ALL_ELEMENTS.messageList,
    setSubmitBusy: updateSubmitButtonState,
    addMessageToUI,
    completeReply: completePreparedReply,
    followResearch: (args) => researchMode.followRun(args),
    document,
    window,
    scheduleTimeout,
    logger,
    AbortController
  });

  return {
    reattachServerReply,
    openCouncilPopoverFromAttachmentMenu,
    ensureCouncilMenuButton,
    updateFunctionButtonsState,
    toggleLearningMode,
    renderInputIndicators,
    updateFileInputUI,
    seedCouncilParticipants,
    persistCouncilConfig,
    getCouncilModeLabel,
    getCouncilModelList,
    renderCouncilControls,
    renderModelSwitcher,
    renderCouncilProgress,
    renderSingleModelError,
    renderSingleModelProgress,
    typewriterStream,
    renderIncrementalResponse,
    playbackTypewriterResponse,
    playbackStreamingMarkdownResponse,
    startProgressTicker,
    stopProgressTicker,
    handleFormSubmit,
    submitEditedMessage: (options) => handleFormSubmit(null, { ...options, preserveComposer: true })
  };
}
