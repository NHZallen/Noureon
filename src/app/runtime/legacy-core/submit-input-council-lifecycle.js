import { createCouncilControlsLifecycle } from '../../legacy-runtime/features/council-controls-lifecycle.js';
import { followTop, setScrollTopQuietly } from '../../ui/motion/reader-scroll-guard.js';
import { createModelSwitcherLifecycle } from '../../legacy-runtime/features/model-switcher-lifecycle.js';
import { createResponseProgressRenderers } from '../../legacy-runtime/features/response-progress-renderers.js';
import { createSingleModelResponseLifecycle } from '../../legacy-runtime/features/single-model-response-lifecycle.js';
import { createSubmitInputPreparationLifecycle } from '../../legacy-runtime/features/submit-input-preparation-lifecycle.js';
import { createStreamingMarkdownFeature } from '../../legacy-runtime/features/streaming-markdown-renderer.js';
import { createStreamingTextFrameQueue } from '../../legacy-runtime/features/streaming-text-frame-queue.js';
import { createTypewriterPlaybackController } from '../../legacy-runtime/features/typewriter-playback-controller.js';
import { finalizeAssistantResponse, persistAssistantResponseError } from '../../legacy-runtime/features/assistant-response-finalization.js';
import { runCouncilResponseRenderLifecycle } from '../../legacy-runtime/features/council-response-render-lifecycle.js';
import { runSubmitFinalCleanupLifecycle } from '../../legacy-runtime/features/submit-final-cleanup-lifecycle.js';
import { applyModelMessagePostResponseActions } from '../../legacy-runtime/features/model-message-post-response-actions.js';
import { appendRendererTextGradually } from '../../legacy-runtime/features/renderer-gradual-append-controller.js';
import { replaceHistorySourceMessage } from '../../legacy-runtime/features/history-source-message-refresh.js';
import { getOpenCouncilDetailKeys, restoreOpenCouncilDetails } from '../../legacy-runtime/features/streaming-council-details.js';
import { createImageModeControls } from '../../legacy-runtime/features/image-mode-controls.js';
import { getRuntimeText } from '../i18n/runtime-texts.js';
import { collectHistorySourceConversationIds } from '../memory/history-source-references.js';
import { renderModelCouncilMenuItem } from '../features/composer-menu-item.js';
import { renderComposerToolIcon } from '../../composer-tool-icons.js';
import { canCaptureConversationMessage } from '../features/temporary-chat-state.js';
import { createDeckDesignControl } from '../features/deck-design-control.js';
import { createVisionCheckScheduler } from '../features/vision-check-scheduler.js';
import { getSearchProvider } from '../kernel/search-provider.js';
import { stopReplyAndWait } from '../features/reply-stop.js';
import { createBrowserServerReply } from '../server-reply/server-reply-runtime.js';
import { createServerReplyReattach } from '../server-reply/reattach.js';
import { createResearchMode } from '../research/research-mode.js';
import { chipCloseButton } from '../features/composer-chip.js';
import { createWebResearchTools } from '../../legacy-runtime/features/web-research-tools.js';
import { normalizePageReads, normalizeTinyfishSearch } from '../../legacy-runtime/features/model-request-formatting.js';
import { getErrorMessage, readErrorBody } from './legacy-core-utilities.js';
import { setVisionLocked } from '../features/vision-check-lock.js';
import { visionText } from '../../ui/files/vision/vision-texts.js';
import { createChatScrollPosition } from '../features/chat-scroll-position.js';
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
  'legacyRuntimeContext',
  'state',
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

export function createLegacySubmitInputCouncilLifecycle(dependencies = {}) {
  for (const key of REQUIRED_DEPENDENCIES) {
    if (dependencies[key] == null) {
      throw new Error(`createLegacySubmitInputCouncilLifecycle missing dependency: ${key}`);
    }
  }

  const {
    window,
    document,
    elements: ALL_ELEMENTS,
    legacyRuntimeContext,
    state,
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
    getConfig = () => state.config,
    runtimeConfigAccess = { getUiLanguage: () => getLiveConfig().uiLanguage },
    getCouncilRuntimeTexts = () => ({}),
    getCouncilSelectedModels = () => ({ participants: [], synthesizer: null, council: {} }),
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

  const getLiveConfig = () => getConfig() || state.config || {};
  const getUiLanguage = () => runtimeConfigAccess.getUiLanguage?.()
    || getLiveConfig().uiLanguage
    || 'zh-TW';
  const getLocalizedText = (key, fallback) => i18n[getUiLanguage()]?.[key] || fallback;
  const getUploadedFiles = () => state.uploadedFiles || [];
  const setUploadedFiles = (files) => { state.uploadedFiles = files; };
  const updateSubmitButtonState = (...args) => legacyRuntimeContext.resolveBinding('submit.updateSubmitButtonState')(...args);
  const getAbortController = () => state.abortController || null;
  const setAbortController = (value) => { state.abortController = value; };
  const getIsCouncilRunning = () => Boolean(state.isCouncilRunning);
  const setIsCouncilRunning = (value) => { state.isCouncilRunning = value; };
  const vc = createVisionCheckScheduler({ getConfig: getLiveConfig, getActiveConversation, normalizeConversationModel, isCouncilEnabled, modelSupportsVision, streamApiCall, document, window, notificationContainer: ALL_ELEMENTS.notificationContainer, addMessageToUI, saveAppData, showNotification, crypto, logger, AbortController,
    // The composer follows the checks: a chat with one running cannot send (settings-update-input-state-helper.js).
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

  // Presentation design (AI adaptive or a template), chosen before asking.
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
  const getLocalizedAstraName = (ast) => {
    const officialId = ast?.officialId;
    if (!officialId) return ast?.name || '';
    const key = `astras_${officialId.replace(/-/g, '_')}_name`;
    return getLocalizedText(key, ast.name || '');
  };

  const openCouncilPopoverFromAttachmentMenu = async () => {
    const config = getLiveConfig();
    closeAllPopovers();
    const opened = await openModelPicker({ council: true });
    if (!opened) showNotification(getRuntimeText(config.uiLanguage, 'councilUnavailable'), 'warning');
  };

  const ensureCouncilMenuButton = () => {
    const popover = ALL_ELEMENTS.fileOptionsPopover;
    if (!popover) return null;
    let button = document.getElementById('model-council-menu-btn');
    if (!button) {
      button = document.createElement('button');
      button.id = 'model-council-menu-btn';
      button.type = 'button';
      button.className = 'w-full text-left px-4 py-2 text-sm hover:bg-[var(--hover-bg)] flex items-center gap-3';
      button.addEventListener('click', openCouncilPopoverFromAttachmentMenu);
      const learningButton = document.getElementById('learning-mode-btn');
      popover.insertBefore(button, learningButton || null);
    }
    renderModelCouncilMenuItem(button, {
      label: getCouncilTexts().title,
      description: i18n[getLiveConfig().uiLanguage]?.modelCouncilDescription || '讓多個模型共同分析'
    });
    return button;
  };

  const updateFunctionButtonsState = () => {
    const config = getLiveConfig();
    const { cameraBtn, uploadImageBtn, uploadFileBtn, webSearchPopoverBtn, learningModeBtn } = ALL_ELEMENTS;
    const conv = getActiveConversation();
    if (!conv) return;
    const modelInfo = normalizeConversationModel(conv);
    const { participants, synthesizer } = getCouncilSelectedModels(conv);
    const imageMode = isImageConversation(conv);
    const councilActive = !imageMode && isCouncilEnabled(conv);
    const provider = modelInfo?.provider;
    const supportsVision = councilActive
      ? participants.some(modelSupportsVision)
      : modelSupportsVision(modelInfo);
    const supportsDocumentUpload = imageMode ? false : (councilActive ? true : hasSingleDocumentAccess(modelInfo));
    const supportsWebSearch = councilActive
      ? hasCouncilWebSearchAccess(synthesizer || modelInfo)
      : hasSingleWebSearchAccess(modelInfo);

    [cameraBtn, uploadImageBtn, uploadFileBtn, webSearchPopoverBtn, learningModeBtn]
      .filter(Boolean)
      .forEach((btn) => { btn.style.display = 'flex'; });
    document.querySelectorAll('#file-options-popover .border-t').forEach((sep) => { sep.style.display = 'block'; });
    if (webSearchPopoverBtn) {
      webSearchPopoverBtn.style.display = supportsWebSearch ? 'flex' : 'none';
      webSearchPopoverBtn.classList.toggle('is-active', Boolean(conv.isWebSearchEnabled));
    }
    [cameraBtn, uploadImageBtn]
      .filter(Boolean)
      .forEach((btn) => { btn.style.display = supportsVision ? 'flex' : 'none'; });
    if (uploadFileBtn) {
      uploadFileBtn.style.display = supportsDocumentUpload ? 'flex' : 'none';
    }
    if (learningModeBtn) {
      learningModeBtn.style.display = (!imageMode && !councilActive) ? 'flex' : 'none';
      learningModeBtn.classList.toggle('is-active', Boolean(config.isLearningMode));
    }
    const councilMenuButton = ensureCouncilMenuButton();
    if (councilMenuButton) {
      councilMenuButton.style.display = (!imageMode && !(config.isLearningMode && !councilActive)) ? 'flex' : 'none';
      councilMenuButton.classList.toggle('is-active', councilActive);
    }
    researchMode?.syncMenu();
    imageModeControls.sync();
    deckDesignControl.render();
    if (!councilActive && provider === 'openrouter') {
      const openRouterSupportsVision = supportsVision || openRouterVisionModels.includes(modelInfo?.id);
      if (webSearchPopoverBtn) webSearchPopoverBtn.style.display = supportsWebSearch ? 'flex' : 'none';
      if (uploadFileBtn) uploadFileBtn.style.display = supportsDocumentUpload ? 'flex' : 'none';
      [cameraBtn, uploadImageBtn]
        .filter(Boolean)
        .forEach((btn) => { btn.style.display = openRouterSupportsVision ? 'flex' : 'none'; });
      const firstSeparator = document.querySelector('#file-options-popover .border-t');
      if (firstSeparator) {
        firstSeparator.style.display = openRouterSupportsVision ? 'block' : 'none';
      }
    }
  };

  const getCombinedRulesNotice = () => (i18n[getLiveConfig().uiLanguage] || {}).learningWithNouraNotice
    || '學習模式與 Noura 同時啟用：角色與語氣保留，衝突時以學習模式優先。';

  const toggleLearningMode = async () => {
    const config = getLiveConfig();
    const conv = getActiveConversation();
    if (!config.isLearningMode && isCouncilEnabled(conv)) {
      const message = getRuntimeText(config.uiLanguage, 'learningUnavailable');
      showNotification(message, 'warning');
      return;
    }
    config.isLearningMode = !config.isLearningMode;
    await saveConfig();
    renderInputIndicators();
    updateFunctionButtonsState();
    ALL_ELEMENTS.fileOptionsPopover?.classList.remove('visible');
    const text = i18n[config.uiLanguage] || {};
    // With a Noura active, explain how the two rule sets combine instead of the plain toast.
    showNotification(
      config.isLearningMode
        ? (getActiveAstrasId()
          ? getCombinedRulesNotice()
          : (text.learningEnabled || 'Learning mode enabled'))
        : (text.learningDisabled || 'Learning mode disabled'),
      'success'
    );
  };

  const renderInputIndicators = () => {
    const config = getLiveConfig();
    const container = ALL_ELEMENTS.inputIndicatorContainer;
    const conv = getActiveConversation();
    const wrapper = document.querySelector('.input-wrapper');
    if (!wrapper || !container) return;
    deckDesignControl.render();
    if (!conv) {
      if (container.children.length > 0) container.innerHTML = '';
      wrapper.classList.remove('has-indicators');
      return;
    }

    const activeIndicators = new Map();
    const astrasId = getActiveAstrasId();
    const activeAstra = astrasId ? (state.astras || []).find((item) => item.id === astrasId) : null;
    const learningActive = config.isLearningMode && !isImageConversation(conv);
    // Both rule sets are active at once: surface how they combine on both chips.
    const combinedRulesNotice = learningActive && activeAstra ? getCombinedRulesNotice() : '';
    const combinedRulesTitle = combinedRulesNotice ? ` title="${escapeHTML(combinedRulesNotice)}"` : '';
    if (learningActive) {
      activeIndicators.set('learning-mode-indicator', {
        id: 'learning-mode-indicator',
        html: `
                        <span class="input-indicator-content flex items-center gap-2"${combinedRulesTitle}>
                            <span class="input-indicator-leading">
                                ${renderComposerToolIcon('learning', 'input-indicator-mode-icon')}
                            </span>
                            <span>${i18n[config.uiLanguage].learningIndicator || 'Learning'}</span>
                        </span>
                        ${chipCloseButton('close-learning-mode-btn-input', i18n[config.uiLanguage].closeLearning || 'Close learning')}
                    `,
        eventListener: (el) => el.querySelector('#close-learning-mode-btn-input').addEventListener('click', toggleLearningMode)
      });
    }
    if (activeAstra) {
      const ast = activeAstra;
      const astraName = getLocalizedAstraName(ast);
      activeIndicators.set('astras-input-indicator', {
        id: 'astras-input-indicator',
        html: `
                            <span class="input-indicator-content flex items-center gap-2"${combinedRulesTitle}>
                                <span class="input-indicator-leading">
                                    <span class="astras-sidebar-avatar input-indicator-mode-icon" style="width: 18px; height: 18px; font-size: 0.7rem;">
                                    ${ast.avatarUrl ? `<img src="${ast.avatarUrl}" class="w-full h-full object-cover rounded-full">` : astraName.charAt(0)}
                                </span>
                                </span>
                                <span>${astraName} <span data-lang-key="astrasActive">${i18n[config.uiLanguage].astrasActive || 'active'}</span></span>
                            </span>
                            ${chipCloseButton('close-astras-btn-input', i18n[config.uiLanguage].closeAstras || 'Close Noura')}
                        `,
        eventListener: (el) => el.querySelector('#close-astras-btn-input').addEventListener('click', deactivateAstras)
      });
    }
    if (conv.isWebSearchEnabled) {
      activeIndicators.set('search-indicator', {
        id: 'search-indicator',
        html: `
                        <span class="input-indicator-content flex items-center gap-2">
                            <span class="input-indicator-leading">
                                ${renderComposerToolIcon('webSearch', 'input-indicator-mode-icon')}
                            </span>
                            <span>${i18n[config.uiLanguage].search || 'Search'}</span>
                        </span>
                        ${chipCloseButton('close-search-btn-input', i18n[config.uiLanguage].closeSearchMode || 'Close search')}
                    `,
        eventListener: (el) => el.querySelector('#close-search-btn-input').addEventListener('click', async () => {
          conv.isWebSearchEnabled = false;
          await saveAppData();
          renderInputIndicators();
        })
      });
    }
    if (isCouncilEnabled(conv) && !isImageConversation(conv)) {
      const { council } = getCouncilSelectedModels(conv);
      const texts = getCouncilTexts();
      const validation = getCouncilValidation(conv);
      const councilModeLabel = getCouncilModeLabel(council);
      activeIndicators.set('model-council-indicator', {
        id: 'model-council-indicator',
        html: `
                        <span class="input-indicator-content flex items-center gap-2">
                            <span class="input-indicator-leading">
                                ${renderComposerToolIcon('modelCouncil', 'input-indicator-mode-icon')}
                            </span>
                            <span>${escapeHTML(councilModeLabel)}</span>
                        </span>
                        ${chipCloseButton('close-model-council-btn-input', escapeHTML(validation.message || texts.title), 'type="button" ')}
                    `,
        eventListener: (el) => el.querySelector('#close-model-council-btn-input').addEventListener('click', async (event) => {
          event.preventDefault();
          event.stopPropagation();
          conv.council.enabled = false;
          el.remove();
          if (!container.querySelector('.input-indicator-item')) {
            wrapper.classList.remove('has-indicators');
          }
          const persistence = persistCouncilConfig(conv, false);
          legacyRuntimeContext.resolveBinding('input.updateInputState')();
          updateApiKeyWarningBadge();
          renderModelSwitcher();
          renderCouncilControls();
          renderInputIndicators();
          await persistence;
        })
      });
    }

    researchMode?.indicators(activeIndicators, chipCloseButton);

    Array.from(container.children).forEach((child) => {
      if (!activeIndicators.has(child.id)) {
        child.classList.remove('enter');
        child.classList.add('exit');
        child.addEventListener('animationend', () => {
          child.remove();
          if (container.children.length === 0) {
            wrapper.classList.remove('has-indicators');
          }
        }, { once: true });
      }
    });
    activeIndicators.forEach((indicatorData) => {
      let existingIndicator = document.getElementById(indicatorData.id);
      if (existingIndicator?.classList.contains('exit')) {
        existingIndicator.remove();
        existingIndicator = null;
      }
      if (!existingIndicator) {
        const indicator = document.createElement('div');
        indicator.id = indicatorData.id;
        indicator.className = 'input-indicator-item flex items-center justify-between text-sm font-medium px-2 py-1 rounded-full enter';
        indicator.innerHTML = indicatorData.html;
        indicator.dataset.indicatorHtml = indicatorData.html;
        container.appendChild(indicator);
        indicatorData.eventListener(indicator);
      } else if (existingIndicator.dataset.indicatorHtml !== indicatorData.html) {
        existingIndicator.innerHTML = indicatorData.html;
        existingIndicator.dataset.indicatorHtml = indicatorData.html;
        indicatorData.eventListener(existingIndicator);
      }
    });
    if (activeIndicators.size > 0) {
      wrapper.classList.add('has-indicators');
    } else if (container.children.length === 0) {
      wrapper.classList.remove('has-indicators');
    }
    ALL_ELEMENTS.messageInput?.syncInlineModeTokens?.();
  };

  const updateFileInputUI = () => {
    const { fileInputContainer } = ALL_ELEMENTS;
    fileInputContainer?.classList.remove('hidden');
    const conv = getActiveConversation();
    const modelInfo = MODELS.find((model) => model.id === conv?.model);
    if (modelInfo?.provider !== 'gemini' && getUploadedFiles().length > 0) {
      // Legacy no-op: the branch exists only to preserve the historical capability check.
    }
  };

  const seedCouncilParticipants = (conv) => {
    if (!conv) return;
    conv.council = normalizeCouncilConfig(conv.council);
    if (conv.council.participantModelIds.length > 0) return;
    const visibleModels = getVisibleCouncilModels();
    const seedIds = [];
    if (conv.model && MODELS.some((model) => model.id === conv.model)) {
      seedIds.push(conv.model);
    }
    visibleModels.forEach((model) => {
      if (seedIds.length < councilMinModels && !seedIds.includes(model.id)) {
        seedIds.push(model.id);
      }
    });
    conv.council.participantModelIds = seedIds.slice(0, councilMaxModels);
  };

  const persistCouncilConfig = async (conv, shouldRender = true) => {
    const config = getLiveConfig();
    if (!conv) return;
    conv.council = normalizeCouncilConfig(conv.council);
    if (conv.council.enabled && config.isLearningMode) {
      config.isLearningMode = false;
    }
    config.lastCouncilConfig = cloneCouncilConfig(conv.council);
    await saveAppData();
    await saveConfig();
    if (shouldRender) {
      renderModelSwitcher();
      renderCouncilControls();
      renderInputIndicators();
      legacyRuntimeContext.resolveBinding('input.updateInputState')();
      updateApiKeyWarningBadge();
    }
  };

  const getCouncilModeLabel = (council = {}) => {
    const texts = getCouncilTexts();
    // Just how it works (Consensus or Discussion): the icon beside it already says it is the council.
    return council.mode === 'deliberation' ? texts.deliberation : texts.consensus;
  };

  const getCouncilModelList = (conv) => {
    const visibleModels = getVisibleCouncilModels();
    const selectedIds = new Set([
      ...(conv?.council?.participantModelIds || []),
      conv?.council?.synthesizerModelId
    ].filter(Boolean));
    selectedIds.forEach((modelId) => {
      const model = MODELS.find((item) => item.id === modelId);
      if (model && !visibleModels.some((item) => item.id === model.id)) {
        visibleModels.push(model);
      }
    });
    return visibleModels;
  };

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

  const isCouncilDeferredSectionVisible = (text = '') => /<details\b|共識與差異整理|模型理事會紀錄|Model council record|Compte rendu du conseil/i.test(String(text || ''));

  ({ renderModelSwitcher } = createModelSwitcherLifecycle({
    getModelSwitcherContainer: () => ALL_ELEMENTS.modelSwitcherContainer,
    renderCouncilControls
  }));

  async function typewriterStream(targetElement, streamApiCallFn, signal) {
    let fullText = '';
    targetElement.innerHTML = '';
    targetElement.classList.add('typing-cursor');
    const typewriterFrameQueue = createStreamingTextFrameQueue({
      drainText: (chunkToRender) => {
        fullText += chunkToRender;
        const fragment = document.createDocumentFragment();
        for (const char of chunkToRender) {
          const span = document.createElement('span');
          span.className = 'fade-in-char';
          if (char === '\n') {
            fragment.appendChild(document.createElement('br'));
          } else {
            span.textContent = char;
            fragment.appendChild(span);
          }
        }
        targetElement.appendChild(fragment);
        const chatContainer = ALL_ELEMENTS.chatContainer;
        const isNearBottom = chatContainer.scrollHeight - chatContainer.scrollTop <= chatContainer.clientHeight + 50;
        if (isNearBottom) setScrollTopQuietly(chatContainer, followTop(chatContainer));
      },
      scheduleFrame: (callback) => requestAnimationFrame(callback),
      waitForFrame: () => new Promise((resolve) => scheduleTimeout(resolve, 16))
    });
    try {
      await streamApiCallFn((chunk) => typewriterFrameQueue.enqueue(chunk));
    } catch (error) {
      logger.error?.('Stream API call failed:', error);
      targetElement.innerHTML = renderMarkdown(`錯誤：串流 API 呼叫失敗：${error.message}`);
      throw error;
    } finally {
      await typewriterFrameQueue.flushUntilIdle();
      targetElement.classList.remove('typing-cursor');
      targetElement.innerHTML = renderMarkdownWithFormulas(fullText);
    }
    return fullText;
  }

  const renderIncrementalResponse = (targetElement, text, options = {}) => {
    const openKeys = options.preserveCouncilDetails ? getOpenCouncilDetailKeys(targetElement) : null;
    targetElement.innerHTML = renderMarkdownWithFormulas(`${text}${!options.final && options.cursor ? '|' : ''}`);
    restoreOpenCouncilDetails(targetElement, openKeys);
  };

  const playbackTypewriterResponse = (targetElement, fullResponse, signal, preserveCouncilDetails = false) => new Promise((resolve) => {
    targetElement.innerHTML = '';
    const playbackController = createTypewriterPlaybackController({
      text: fullResponse,
      signal,
      schedule: (callback, delay) => scheduleTimeout(callback, delay),
      onStep: ({ currentText }) => {
        renderIncrementalResponse(targetElement, currentText, { cursor: true, preserveCouncilDetails });
        const chatContainer = ALL_ELEMENTS.chatContainer;
        const isNearBottom = chatContainer.scrollHeight - chatContainer.scrollTop <= chatContainer.clientHeight + 50;
        const pauseCouncilAutoScroll = preserveCouncilDetails && isCouncilDeferredSectionVisible(currentText);
        if (!pauseCouncilAutoScroll && isNearBottom) {
          setScrollTopQuietly(chatContainer, followTop(chatContainer));
        }
      },
      onFinish: () => {
        renderIncrementalResponse(targetElement, fullResponse, { final: true, preserveCouncilDetails });
        resolve();
      }
    });
    playbackController.start();
  });

  const { isChatNearBottom, keepChatPositionAfterRender } = createChatScrollPosition(ALL_ELEMENTS);

  const {
    createStreamingMarkdownRenderer,
    streamMarkdownResponse
  } = createStreamingMarkdownFeature({
    document,
    renderMarkdown,
    renderMarkdownWithFormulas,
    isChatNearBottom,
    getChatScrollTop: () => ALL_ELEMENTS.chatContainer?.scrollTop || 0,
    keepChatPositionAfterRender,
    scheduleFrame: (callback) => requestAnimationFrame(callback),
    waitForFrame: () => new Promise((resolve) => scheduleTimeout(resolve, 16)),
    getStreamingText: (key, fallback) => getRuntimeText(getUiLanguage(), key) || fallback,
    getStreamErrorText: (error) => `串流回應失敗：${error.message}`,
    getUiLanguage,
    logError: (...args) => logger.error?.(...args)
  });

  const playbackStreamingMarkdownResponse = (targetElement, fullResponse, signal, preserveCouncilDetails = false) => new Promise((resolve) => {
    const renderer = createStreamingMarkdownRenderer(targetElement, { preserveCouncilDetails });
    const playbackController = createTypewriterPlaybackController({
      text: fullResponse,
      signal,
      schedule: (callback, delay) => scheduleTimeout(callback, delay),
      getStep: ({ source, currentIndex }) => source.includes('```', Math.max(0, currentIndex - 3)) ? 5 : 1,
      onStep: ({ chunk }) => {
        renderer.appendText(chunk);
      },
      onFinish: () => {
        renderer.finish({ renderFormulas: true });
        resolve();
      }
    });
    playbackController.start();
  });

  const { startProgressTicker, stopProgressTicker } = createProgressTicker(scheduleTimeout, clearScheduledTimeout);

  // What a model that calls tools searches the web with, by itself, in a reply (web-research-reply.js).
  const researchTools = createWebResearchTools({ getConfig: getLiveConfig, getApiKeyForProvider, getErrorMessage, readErrorBody, normalizePageReads, normalizeTinyfishSearch });
  const webResearch = {
    canUse: (model) => Boolean(modelUsesTavilySearch(model) && modelSupportsToolCalling(model) && researchTools.hasKey()),
    searchWeb: researchTools.searchWeb,
    openPage: researchTools.fetchPageContents
  };

  // Replies the server makes while the page may be closed (see runtime/server-reply/).
  const serverReply = createBrowserServerReply({
    getApiKeyForProvider,
    getModelApiId,
    getDefaultGenConfig,
    // stream-api-call.js puts the system instruction together (and asks no provider) for `describeOnly`.
    describeRequest: (parts, options) => streamApiCall(parts, null, undefined, false, { ...options, describeOnly: true }),
    saveAppData,
    showNotification,
    getUiLanguage,
    getActiveConversation,
    onVisionLock: () => updateSubmitButtonState(false)
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
    updateSubmitButtonState: (...args) => legacyRuntimeContext.resolveBinding('submit.updateSubmitButtonState')(...args),
    getCouncilValidation,
    showNotification,
    renderCouncilControls,
    isCouncilEnabled,
    getCouncilRuntimeTexts,
    addMessageToUI: (...args) => addMessageToUI(...args),
    renderHistorySidebar,
    getAutoNaming: () => getLiveConfig().autoNaming,
    generateTitleAndSummary: (...args) => legacyRuntimeContext.resolveBinding('submit.generateTitleAndSummary')(...args),
    saveAppData,
    getAutoWebSearchEnabled: () => getLiveConfig().enableAutoWebSearch,
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
    adjustTextareaHeight: (...args) => legacyRuntimeContext.resolveBinding('submit.adjustTextareaHeight')(...args),
    renderFilePreviews: (...args) => legacyRuntimeContext.resolveBinding('submit.renderFilePreviews')(...args),
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
      // An edit cuts the conversation at the edited message: a reply still being written, or a visual check looking at one,
      // would add itself back after the cut. Both are stopped first, then the conversation is cut.
      vc.cancel(activeId);
      await stopReplyAndWait({ getAbortController, wait: (ms) => new Promise((resolve) => scheduleTimeout(resolve, ms)) });
      await effectiveSubmitOptions.prepare?.();
    } else if (vc.isRunning(activeId)) {
      // The visual check is still looking at the last message: nothing is sent until it is done or stopped.
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

  // What follows the preparation of a reply: it is made (or, for a reply the server is still making, followed), shown, and kept.
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

    // The id of the reply's message is chosen first: the server writes under it, and an error it reports is saved under it.
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
          runModelCouncil: (...args) => runModelCouncil(...args, {
            webSearchEnabled,
            conversation: conv,
            onMemoryContextResolved: collectHistorySources
          }),
          renderCouncilProgress,
          createStreamingMarkdownRenderer,
          appendRendererTextGradually,
          startProgressTicker,
          stopProgressTicker,
          setCouncilRunning: setIsCouncilRunning,
          renderCouncilControls,
          renderInputIndicators,
          requestFrame: (callback) => requestAnimationFrame(callback)
        });
        fullResponse = councilResult.fullResponse;
        responseRenderedInRealtime = councilResult.responseRenderedInRealtime;
        councilMetadata = councilResult.metadata;
      } else {
        const modelInfo = normalizeConversationModel(conv);
        if (modelGeneratesImages(modelInfo)) {
          if (!imageGenerationResponseLifecycle) throw new Error('圖片生成功能尚未初始化');
          const imageResult = await imageGenerationResponseLifecycle.run({
            targetElement: contentDiv,
            userParts,
            modelInfo,
            conversation: conv,
            webSearchEnabled,
            signal: submitAbortController.signal,
            uiLanguage: getLiveConfig().uiLanguage
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
            // The message the reply becomes: the server writes it under this id, at the place the reply will take.
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
        completeImageView: generatedImageParts ? () => {
          const finalMessageElement = addMessageToUI(finalAiMessage, conv.messages.length - 1, false, false, { conversation: conv });
          finalMessageElement.classList.add('generated-image-result-enter');
          finalMessageElement.hidden = true;
          const revealFinalImage = () => {
            finalMessageElement.hidden = false;
            requestAnimationFrame(() => {
              finalMessageElement.classList.add('generated-image-result-visible');
            });
          };
          const replaceLoadingWithFinal = () => {
            if (loadingMessageDiv?.isConnected) {
              loadingMessageDiv.replaceWith(finalMessageElement);
            } else {
              loadingMessageDiv?.remove();
            }
            revealFinalImage();
          };
          const skeleton = loadingMessageDiv?.querySelector?.('.generated-image-skeleton');
          const finalCard = finalMessageElement.querySelector?.('.generated-image-card');
          const targetAspectRatio = finalCard?.style?.aspectRatio;
          const parseAspectRatio = (value) => {
            const parts = String(value || '').split('/').map(part => Number(part.trim()));
            return parts.length === 2 && parts[0] > 0 && parts[1] > 0 ? parts[0] / parts[1] : 0;
          };
          if (loadingMessageDiv?.isConnected && skeleton && targetAspectRatio) {
            const ratio = parseAspectRatio(targetAspectRatio);
            const currentRect = skeleton.getBoundingClientRect?.();
            loadingMessageDiv.classList.add('generated-image-stage-morphing');
            skeleton.classList.add('generated-image-skeleton-finalizing');
            if (ratio && currentRect?.width && currentRect?.height) {
              const viewportHeight = Number(globalThis.innerHeight) || currentRect.height;
              const maxTargetHeight = Math.max(180, viewportHeight * .72);
              let targetWidth = currentRect.width;
              let targetHeight = targetWidth / ratio;
              if (targetHeight > maxTargetHeight) {
                targetHeight = maxTargetHeight;
                targetWidth = targetHeight * ratio;
              }
              skeleton.style.width = `${currentRect.width}px`;
              skeleton.style.height = `${currentRect.height}px`;
              skeleton.style.minHeight = '0px';
              skeleton.style.maxHeight = 'none';
              skeleton.style.aspectRatio = targetAspectRatio;
              const animateToFinalFrame = () => {
                skeleton.style.width = `${targetWidth}px`;
                skeleton.style.height = `${targetHeight}px`;
                skeleton.style.aspectRatio = targetAspectRatio;
              };
              if (typeof globalThis.requestAnimationFrame === 'function') {
                globalThis.requestAnimationFrame(() => globalThis.requestAnimationFrame(animateToFinalFrame));
              } else {
                globalThis.setTimeout(animateToFinalFrame, 0);
              }
              globalThis.setTimeout(replaceLoadingWithFinal, 560);
            } else {
              skeleton.style.aspectRatio = targetAspectRatio;
              globalThis.setTimeout(replaceLoadingWithFinal, 460);
            }
          } else {
            replaceLoadingWithFinal();
          }
        } : null
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
        // An error the server reported is saved under the id of the message it wrote, so there is one message, not two.
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
        // The models this message went to are the ones offered first next time.
        noteConversationModels(conv).catch(() => {});
      }
      const lastMessageElement = runSubmitFinalCleanupLifecycle(
        () => singleModelResponseLifecycle.stop(),
        () => { setIsCouncilRunning(false); setAbortController(null); },
        (...args) => legacyRuntimeContext.resolveBinding('submit.updateSubmitButtonState')(...args),
        (...args) => legacyRuntimeContext.resolveBinding('input.updateInputState')(...args),
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

  // A reply the server is still making when the page is opened again (or returned to) is shown being written (server-reply/reattach.js).
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
