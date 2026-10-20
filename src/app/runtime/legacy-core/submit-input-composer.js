// The tools around the message box (part of submit-input-council-lifecycle.js): which buttons the attachment menu offers for the model,
// learning mode, the chips above the box (learning, the Noura, web search, the council), and the council's settings of a conversation.
// The parts made after it (the council controls, the model switcher, deep research) are reached through `late`.

import { getRuntimeText } from '../i18n/runtime-texts.js';
import { renderModelCouncilMenuItem } from '../features/composer-menu-item.js';
import { renderComposerToolIcon } from '../../composer-tool-icons.js';
import { chipCloseButton } from '../features/composer-chip.js';
import { syncInputIndicatorItems } from './input-indicator-sync.js';

export function createSubmitInputComposer({
  document, elements: ALL_ELEMENTS, legacyRuntimeContext, state, models: MODELS, i18n, openRouterVisionModels, councilMinModels, councilMaxModels,
  getLiveConfig, getLocalizedText, getUploadedFiles, getActiveConversation, normalizeConversationModel, isImageConversation,
  getCouncilSelectedModels, getCouncilTexts, getCouncilValidation, getVisibleCouncilModels, isCouncilEnabled, normalizeCouncilConfig, cloneCouncilConfig,
  modelSupportsVision, hasSingleDocumentAccess, hasCouncilWebSearchAccess, hasSingleWebSearchAccess,
  imageModeControls, deckDesignControl, closeAllPopovers, escapeHTML, getActiveAstrasId, deactivateAstras,
  saveAppData, saveConfig, showNotification, updateApiKeyWarningBadge, late
}) {
  const openModelPicker = (...args) => late.openModelPicker(...args);
  const renderCouncilControls = (...args) => late.renderCouncilControls(...args);
  const renderModelSwitcher = (...args) => late.renderModelSwitcher(...args);
  const getResearchMode = () => late.researchMode();

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
      councilMenuButton.style.display = imageMode || conv.retentionMode === 'ephemeral' || (config.isLearningMode && !councilActive) ? 'none' : 'flex';
      councilMenuButton.classList.toggle('is-active', councilActive);
    }
    getResearchMode()?.syncMenu();
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
    // With a Noura active, explain how the two rule sets combine, not the plain toast.
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
    // Both rule sets are active: surface how they combine on both chips.
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

    getResearchMode()?.indicators(activeIndicators, chipCloseButton);

    syncInputIndicatorItems({ document, container, wrapper, activeIndicators });
    ALL_ELEMENTS.messageInput?.syncInlineModeTokens?.();
  };

  const updateFileInputUI = () => {
    const { fileInputContainer } = ALL_ELEMENTS;
    fileInputContainer?.classList.remove('hidden');
    const conv = getActiveConversation();
    const modelInfo = MODELS.find((model) => model.id === conv?.model);
    if (modelInfo?.provider !== 'gemini' && getUploadedFiles().length > 0) {
      // Legacy no-op: kept only for the historical capability check.
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
    // Only how it works: the icon beside it says it is the council.
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
    getCouncilModelList
  };
}
