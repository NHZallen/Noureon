import { createCouncilControlsLifecycle } from '../../legacy-runtime/features/council-controls-lifecycle.js';
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
import { getOpenCouncilDetailKeys, restoreOpenCouncilDetails } from '../../legacy-runtime/features/streaming-council-details.js';
import { createImageModeControls } from '../../legacy-runtime/features/image-mode-controls.js';
import { getRuntimeText } from '../i18n/runtime-texts.js';
import {
  getDefaultReasoningLabel,
  getModelReasoningConfig,
  getReasoningEffortLabel,
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
  'renderAll',
  'renderHistorySidebar',
  'addMessageToUI',
  'showNotification'
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
    renderAll,
    renderHistorySidebar,
    renderMarkdown = (value) => String(value ?? ''),
    renderMarkdownWithFormulas = renderMarkdown,
    renderUserText = (value) => String(value ?? ''),
    addMessageToUI,
    buildSingleModelTranslatedRequestParts,
    streamApiCall,
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
  const getAbortController = () => state.abortController || null;
  const setAbortController = (value) => { state.abortController = value; };
  const getIsCouncilRunning = () => Boolean(state.isCouncilRunning);
  const setIsCouncilRunning = (value) => { state.isCouncilRunning = value; };
  const getIsAutoScrolling = () => Boolean(state.isAutoScrolling);
  const isImageConversation = (conversation = getActiveConversation()) => modelGeneratesImages(
    normalizeConversationModel(conversation)
  );

  let renderCouncilControls = () => {};
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

  const getReasoningTitle = () => {
    const uiLanguage = runtimeConfigAccess.getUiLanguage();
    return getRuntimeText(uiLanguage, 'reasoning');
  };

  const getLocalizedAstraName = (ast) => {
    const officialId = ast?.officialId;
    if (!officialId) return ast?.name || '';
    const key = `astras_${officialId.replace(/-/g, '_')}_name`;
    return getLocalizedText(key, ast.name || '');
  };

  const ensureReasoningDepthControl = () => {
    let control = document.getElementById('reasoning-depth-control');
    if (!control) {
      const row = ALL_ELEMENTS.voiceInputBtnMessage?.parentElement || ALL_ELEMENTS.chatForm?.parentElement;
      if (!row) return null;
      control = document.createElement('div');
      control.id = 'reasoning-depth-control';
      control.className = 'relative';
      control.innerHTML = `
        <button type="button" id="reasoning-depth-btn" class="reasoning-depth-btn" aria-haspopup="true" aria-expanded="false" title="思考深度">
          <span id="reasoning-depth-label">預設</span>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 15 12 9 18 15"></polyline></svg>
        </button>
        <div id="reasoning-depth-popover" class="popover reasoning-depth-popover absolute bottom-full right-0 mb-2 z-30"></div>
      `;
      row.insertBefore(control, ALL_ELEMENTS.voiceInputBtnMessage || ALL_ELEMENTS.submitButton || null);
    }
    const button = control.querySelector('#reasoning-depth-btn');
    const popover = control.querySelector('#reasoning-depth-popover');
    const label = control.querySelector('#reasoning-depth-label');
    if (!button || !popover || !label) return null;
    if (!button.dataset.reasoningDepthBound) {
      button.dataset.reasoningDepthBound = 'true';
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (button.disabled) return;
        const wasVisible = popover.classList.contains('visible');
        closeAllPopovers();
        popover.classList.toggle('visible', !wasVisible);
        button.setAttribute('aria-expanded', String(!wasVisible));
      });
    }
    return { control, button, popover, label };
  };

  const renderReasoningDepthControl = () => {
    const elements = ensureReasoningDepthControl();
    if (!elements) return;
    const { control, button, popover, label } = elements;
    const conv = getActiveConversation();
    const modelInfo = normalizeConversationModel(conv);
    const config = getModelReasoningConfig(modelInfo);
    const uiLanguage = runtimeConfigAccess.getUiLanguage();
    const title = getReasoningTitle();
    const disabled = !conv || conv.archived || isCouncilEnabled(conv) || !config;
    const effort = config ? normalizeReasoningEffort(modelInfo, conv?.reasoningEffort) : null;
    label.textContent = disabled
      ? getDefaultReasoningLabel(uiLanguage)
      : getReasoningEffortLabel(effort, uiLanguage);
    button.title = title;
    button.disabled = disabled;
    button.classList.toggle('is-disabled', disabled);
    button.classList.toggle('is-adjustable', !disabled);
    control.classList.toggle('is-disabled', disabled);
    if (disabled) {
      popover.classList.remove('visible');
      button.setAttribute('aria-expanded', 'false');
      return;
    }
    const duplicateLabels = new Set();
    const seenLabels = new Set();
    config.options.forEach((option) => {
      const optionLabel = getReasoningEffortLabel(option, uiLanguage);
      if (seenLabels.has(optionLabel)) duplicateLabels.add(optionLabel);
      seenLabels.add(optionLabel);
    });
    popover.innerHTML = config.options.map((option) => {
      const optionLabel = getReasoningEffortLabel(option, uiLanguage);
      const selected = option === effort;
      const detail = duplicateLabels.has(optionLabel) ? `<small>${escapeHTML(option)}</small>` : '';
      return `
        <button type="button" class="reasoning-depth-option ${selected ? 'active' : ''}" data-reasoning-effort="${escapeHTML(option)}" aria-pressed="${selected}">
          <span>${escapeHTML(optionLabel)}</span>${detail}
        </button>
      `;
    }).join('');
    button.setAttribute('aria-expanded', String(popover.classList.contains('visible')));
    popover.querySelectorAll('[data-reasoning-effort]').forEach((optionButton) => {
      optionButton.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const selectedEffort = optionButton.dataset.reasoningEffort;
        const normalizedEffort = normalizeReasoningEffort(modelInfo, selectedEffort);
        if (!normalizedEffort) return;
        conv.reasoningEffort = normalizedEffort;
        await saveAppData();
        popover.classList.remove('visible');
        button.setAttribute('aria-expanded', 'false');
        renderReasoningDepthControl();
      });
    });
  };

  const openCouncilPopoverFromAttachmentMenu = () => {
    const config = getLiveConfig();
    renderCouncilControls();
    const toggleButton = document.getElementById('model-council-toggle-btn');
    if (!toggleButton) {
      showNotification(getRuntimeText(config.uiLanguage, 'councilUnavailable'), 'warning');
      return;
    }
    closeAllPopovers();
    toggleButton.click();
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
      button.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-8 0v2"></path><circle cx="12" cy="11" r="4"></circle><path d="M5 8a3 3 0 1 0-2 5.24"></path><path d="M19 8a3 3 0 1 1 2 5.24"></path></svg>
                    <span></span>
                `;
      button.addEventListener('click', openCouncilPopoverFromAttachmentMenu);
      const learningButton = document.getElementById('learning-mode-btn');
      popover.insertBefore(button, learningButton || null);
    }
    button.querySelector('span').textContent = getCouncilTexts().title;
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
    imageModeControls.sync();
    renderReasoningDepthControl();
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
    showNotification(
      config.isLearningMode
        ? (text.learningEnabled || 'Learning mode enabled')
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
    if (!conv) {
      if (container.children.length > 0) container.innerHTML = '';
      wrapper.classList.remove('has-indicators');
      renderReasoningDepthControl();
      return;
    }
    renderReasoningDepthControl();

    const activeIndicators = new Map();
    const astrasId = getActiveAstrasId();
    if (config.isLearningMode && !isImageConversation(conv)) {
      activeIndicators.set('learning-mode-indicator', {
        id: 'learning-mode-indicator',
        html: `
                        <span class="input-indicator-content flex items-center gap-2">
                            <span class="input-indicator-leading">
                                <svg class="input-indicator-mode-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V5H6.5A2.5 2.5 0 0 0 4 7.5v12z"/></svg>
                            </span>
                            <span>${i18n[config.uiLanguage].learningIndicator || 'Learning'}</span>
                        </span>
                        <button id="close-learning-mode-btn-input" class="ml-2 p-1 rounded-full hover:bg-black/10" title="${i18n[config.uiLanguage].closeLearning || 'Close learning'}">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    `,
        eventListener: (el) => el.querySelector('#close-learning-mode-btn-input').addEventListener('click', toggleLearningMode)
      });
    }
    if (astrasId) {
      const ast = (state.astras || []).find((item) => item.id === astrasId);
      if (ast) {
        const astraName = getLocalizedAstraName(ast);
        activeIndicators.set('astras-input-indicator', {
          id: 'astras-input-indicator',
          html: `
                            <span class="input-indicator-content flex items-center gap-2">
                                <span class="input-indicator-leading">
                                    <span class="astras-sidebar-avatar input-indicator-mode-icon" style="width: 18px; height: 18px; font-size: 0.7rem;">
                                    ${ast.avatarUrl ? `<img src="${ast.avatarUrl}" class="w-full h-full object-cover rounded-full">` : astraName.charAt(0)}
                                </span>
                                </span>
                                <span>${astraName} <span data-lang-key="astrasActive">${i18n[config.uiLanguage].astrasActive || 'active'}</span></span>
                            </span>
                            <button id="close-astras-btn-input" class="ml-2 p-1 rounded-full hover:bg-black/10" title="${i18n[config.uiLanguage].closeAstras || 'Close Noura'}">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        `,
          eventListener: (el) => el.querySelector('#close-astras-btn-input').addEventListener('click', deactivateAstras)
        });
      }
    }
    if (conv.isWebSearchEnabled) {
      activeIndicators.set('search-indicator', {
        id: 'search-indicator',
        html: `
                        <span class="input-indicator-content flex items-center gap-2">
                            <span class="input-indicator-leading">
                                <svg class="input-indicator-mode-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
                            </span>
                            <span>${i18n[config.uiLanguage].search || 'Search'}</span>
                        </span>
                        <button id="close-search-btn-input" class="ml-2 p-1 rounded-full hover:bg-black/10" title="${i18n[config.uiLanguage].closeSearchMode || 'Close search'}">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
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
                                <svg class="input-indicator-mode-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-8 0v2"></path><circle cx="12" cy="11" r="4"></circle><path d="M5 8a3 3 0 1 0-2 5.24"></path><path d="M19 8a3 3 0 1 1 2 5.24"></path></svg>
                            </span>
                            <span>${escapeHTML(councilModeLabel)}</span>
                        </span>
                        <button id="close-model-council-btn-input" class="ml-2 p-1 rounded-full hover:bg-black/10" title="${escapeHTML(validation.message || texts.title)}">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    `,
        eventListener: (el) => el.querySelector('#close-model-council-btn-input').addEventListener('click', async (event) => {
          event.preventDefault();
          event.stopPropagation();
          conv.council.enabled = false;
          await persistCouncilConfig(conv);
          renderInputIndicators();
        })
      });
    }

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
      const existingIndicator = document.getElementById(indicatorData.id);
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
    const modeLabel = council.mode === 'deliberation' ? texts.deliberation : texts.consensus;
    return `${texts.title}: ${modeLabel}`;
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

  ({ renderCouncilControls } = createCouncilControlsLifecycle({
    closeAllPopovers,
    councilMaxModels,
    document,
    escapeHTML,
    formatCouncilModelSummary,
    getActiveConversation,
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
    getModelFamilyKey,
    getModelFamilyName,
    getModelPriceLabel,
    getModelsByIds,
    getProviderLabel,
    hasCouncilWebSearchAccess,
    modelSupportsDocumentUpload,
    modelSupportsVision,
    modelSupportsWebSearch,
    models: MODELS,
    normalizeConversationModel,
    normalizeCouncilConfig,
    persistCouncilConfig,
    renderInputIndicators,
    requestFrame: requestAnimationFrame,
    saveAppData,
    seedCouncilParticipants,
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
    closeAllPopovers,
    document,
    escapeHTML,
    getActiveConversation,
    getConfig: getLiveConfig,
    getCouncilModeLabel,
    getCouncilSelectedModels,
    getCouncilTexts,
    getI18n: () => i18n,
    getModelApiId,
    getModelSwitcherContainer: () => ALL_ELEMENTS.modelSwitcherContainer,
    getModelRetirementLabel,
    getModelReasoningConfig,
    getModelTiers,
    getSingleDocumentTranslatorModel,
    isCouncilEnabled: conversation => !isImageConversation(conversation) && isCouncilEnabled(conversation),
    modelSupportsDocumentUpload,
    modelSupportsVision,
    modelSupportsWebSearch,
    normalizeReasoningEffort,
    models: MODELS,
    renderAll,
    renderCouncilControls,
    requestFrame: requestAnimationFrame,
    saveAppData,
    saveConfig,
    window
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
        if (isNearBottom) {
          chatContainer.scrollTo({ top: chatContainer.scrollHeight, behavior: 'auto' });
        }
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
    targetElement.innerHTML = options.final
      ? renderMarkdownWithFormulas(text)
      : renderMarkdown(`${text}${options.cursor ? '|' : ''}`);
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
          chatContainer.scrollTo({ top: chatContainer.scrollHeight, behavior: 'auto' });
        }
      },
      onFinish: () => {
        renderIncrementalResponse(targetElement, fullResponse, { final: true, preserveCouncilDetails });
        resolve();
      }
    });
    playbackController.start();
  });

  const isChatNearBottom = (threshold = 16) => {
    const chatContainer = ALL_ELEMENTS.chatContainer;
    if (!chatContainer) return false;
    return chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight <= threshold;
  };

  const keepChatPositionAfterRender = (shouldStick, previousTop) => {
    const chatContainer = ALL_ELEMENTS.chatContainer;
    if (!chatContainer) return;
    if (shouldStick) {
      chatContainer.scrollTo({ top: chatContainer.scrollHeight, behavior: 'auto' });
    } else {
      chatContainer.scrollTop = previousTop;
    }
  };

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
    getStreamErrorText: (error) => `串流回應失敗：${error.message}`,
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

  const startProgressTicker = (tick, intervalMs = 250) => {
    let stopped = false;
    let timerId = null;
    const run = () => {
      if (stopped) return;
      tick();
      timerId = scheduleTimeout(run, intervalMs);
    };
    timerId = scheduleTimeout(run, intervalMs);
    return () => {
      stopped = true;
      if (timerId) clearScheduledTimeout(timerId);
    };
  };

  const stopProgressTicker = (ticker) => {
    if (typeof ticker === 'function') {
      ticker();
    } else if (ticker) {
      clearScheduledTimeout(ticker);
    }
  };

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
    restoreOpenCouncilDetails
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
    shouldPerformWebSearch: (...args) => legacyRuntimeContext.resolveBinding('submit.shouldPerformWebSearch')(...args),
    canAutoEnableWebSearch: (conversation) => {
      const modelInfo = normalizeConversationModel(conversation);
      if (!hasSingleWebSearchAccess(modelInfo)) return false;
      if (modelUsesTavilySearch(modelInfo) && !getApiKeyForProvider('tavily')) return false;
      return true;
    },
    getAutoSearchNotice: () => i18n[getLiveConfig().uiLanguage].autoSearchNotice || '自動啟用網路搜尋。',
    renderInputIndicators,
    adjustTextareaHeight: (...args) => legacyRuntimeContext.resolveBinding('submit.adjustTextareaHeight')(...args),
    renderFilePreviews: (...args) => legacyRuntimeContext.resolveBinding('submit.renderFilePreviews')(...args),
    requestFrame: (callback) => requestAnimationFrame(callback),
    isImageConversation,
    getQuoteReference,
    buildQuotedUserParts,
    clearQuoteReference
  });

  const prepareDefaultSubmit = async () => {
    const preparedSubmit = await submitInputPreparationLifecycle.prepareSubmitResponse();
    return preparedSubmit;
  };
  const handleFormSubmit = async (event, submitOptions = {}) => {
    event?.preventDefault?.();
    let effectiveSubmitOptions = submitOptions;
    if (!effectiveSubmitOptions.preserveComposer) {
      effectiveSubmitOptions = getComposerEditSubmission() || effectiveSubmitOptions;
      if (!effectiveSubmitOptions.preserveComposer) onRegularSubmit();
    }
    const preparedSubmit = Object.keys(effectiveSubmitOptions).length > 0
      ? await submitInputPreparationLifecycle.prepareSubmitResponse(effectiveSubmitOptions)
      : await prepareDefaultSubmit();
    if (!preparedSubmit.shouldContinue) return;
    const {
      abortController: submitAbortController,
      contentDiv,
      conversation: conv,
      loadingMessageDiv,
      responseUsesCouncil,
      userMessage,
      userMessageObject,
      userParts
    } = preparedSubmit;

    try {
      let fullResponse = '';
      const finalAiMessage = { id: crypto.randomUUID(), role: 'model', parts: [{ text: '' }], createdAt: new Date().toISOString() };
      let councilMetadata = null;
      let responseRenderedInRealtime = false;
      let generatedImageParts = null;

      if (responseUsesCouncil) {
        const councilResult = await runCouncilResponseRenderLifecycle({
          contentDiv,
          userParts,
          signal: submitAbortController.signal,
          getOutputMode,
          runModelCouncil: (...args) => runModelCouncil(...args),
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
            signal: submitAbortController.signal,
            uiLanguage: getLiveConfig().uiLanguage
          });
          fullResponse = singleResult.fullResponse;
          responseRenderedInRealtime = singleResult.responseRenderedInRealtime;
        }
      }

      await finalizeAssistantResponse({
        fullResponse,
        finalParts: generatedImageParts,
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
        memoryEnabled: getLiveConfig().memorySystemVersion === 2 || getLiveConfig().memoryEnabled1,
        autoMemoryEnabled: getLiveConfig().enableAutoMemory,
        persistAppData: saveAppData,
        completeSingleModelView: (options) => singleModelResponseLifecycle.completeView(options),
        restoreRealtimeCouncilDetails: ({ targetElement }) => restoreOpenCouncilDetails(targetElement, getOpenCouncilDetailKeys(targetElement)),
        renderRealtimeCouncilFinal: ({ targetElement, fullResponse }) => renderIncrementalResponse(targetElement, fullResponse, { final: true, preserveCouncilDetails: true }),
        playbackCouncilResponse: ({ targetElement, fullResponse, signal }) => playbackStreamingMarkdownResponse(targetElement, fullResponse, signal, true),
        extractPersonalMemory: (userMessageText, fullResponse) => extractPersonalMemory(userMessageText, fullResponse),
        completeImageView: generatedImageParts ? () => {
          const finalMessageElement = addMessageToUI(finalAiMessage, conv.messages.length - 1, false);
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
        persistAppData: saveAppData
      });
    } finally {
      const lastMessageElement = runSubmitFinalCleanupLifecycle(
        () => singleModelResponseLifecycle.stop(),
        () => { setIsCouncilRunning(false); setAbortController(null); },
        (...args) => legacyRuntimeContext.resolveBinding('submit.updateSubmitButtonState')(...args),
        (...args) => legacyRuntimeContext.resolveBinding('input.updateInputState')(...args),
        renderCouncilControls,
        renderInputIndicators,
        () => ALL_ELEMENTS.messageList.lastElementChild
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

  return {
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
