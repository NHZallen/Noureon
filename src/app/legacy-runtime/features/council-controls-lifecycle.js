// The model picker in the composer: one button that names what will answer
// (a model, or a council) and the one panel behind it for choosing a model,
// building a council, and setting how deeply the model thinks.

import { buildModelGroups, getModelCompany } from '../../ui/model-picker/model-picker-groups.js';
import { renderPickerPanel, renderPickerTrigger } from '../../ui/model-picker/model-picker-markup.js';
import { modelPickerText } from '../../ui/model-picker/model-picker-texts.js';
import { prepareModelSwitcherModels } from './model-switcher-lifecycle.js';

export function createCouncilControlsLifecycle(deps) {
  const {
    closeAllPopovers = () => {},
    councilMaxModels = 4,
    document,
    escapeHTML = (value) => String(value ?? ''),
    getActiveConversation = () => null,
    getComposerAnchor = () => null,
    getConfig = () => ({}),
    getCouncilModelList = () => [],
    getCouncilRuntimeTexts = () => ({}),
    getCouncilTexts = () => ({}),
    getCouncilValidation = () => ({ ok: false, message: '' }),
    getI18n = () => ({}),
    getFileInputContainer = () => undefined,
    getIsCouncilRunning = () => false,
    getModelApiId = (model) => model?.id || '',
    getModelReasoningConfig = () => null,
    getModelRetirementLabel = () => '',
    getModelTiers = () => [],
    getModelsByIds = () => [],
    getProviderLabel = (provider) => provider || '',
    getReasoningEffortLabel = (value) => String(value ?? ''),
    getSingleDocumentTranslatorModel = () => null,
    hasCouncilWebSearchAccess = () => false,
    isImageConversation = () => false,
    modelSupportsDocumentUpload = () => false,
    modelSupportsVision = () => false,
    modelSupportsWebSearch = () => false,
    models = [],
    normalizeConversationModel = () => null,
    normalizeCouncilConfig = (value) => value,
    normalizeReasoningEffort = () => null,
    persistCouncilConfig = async () => {},
    renderInputIndicators = () => {},
    renderSidebar = () => {},
    requestFrame = (callback) => callback(),
    saveAppData = async () => {},
    saveConfig = async () => {},
    seedCouncilParticipants = () => {},
    showCustomDialog = async () => true,
    showNotification = () => {}
  } = deps || {};

  // What the panel is showing besides the conversation: which page of the
  // panel (the main one, or a list to pick members / the combining model from),
  // the search text, whether the extra options are open.
  let view = 'main';
  let query = '';
  let moreOpen = false;

  // Every submit runs this, and the answer is nearly always what is already on
  // screen, so the last markup is remembered and written again only when it changes.
  let cachedContainer = null;
  let cachedConversation = null;
  let cachedMarkup = null;
  const dropMarkupCache = () => {
    cachedContainer = null;
    cachedConversation = null;
    cachedMarkup = null;
  };

  // Above the button there may be less room than the panel's usual height (the composer sits mid-screen
  // in a new chat), so the panel is kept inside the window and its list scrolls.
  const fitPanel = (container) => {
    const panel = container.querySelector('#model-picker-popover');
    const trigger = container.querySelector('#model-picker-btn');
    const view = document.defaultView;
    if (!panel || !trigger || !view) return;
    if (view.innerWidth <= 640) {
      panel.style.maxHeight = '';
      return;
    }
    const room = trigger.getBoundingClientRect().top - 24;
    panel.style.maxHeight = `${Math.round(Math.max(220, Math.min(544, room)))}px`;
  };

  const isPanelOpen = (container) => Boolean(container?.querySelector('#model-picker-popover')?.classList.contains('visible'));

  const describe = (model, { translations, t, selected = false, disabled = false }) => {
    const tiers = getModelTiers(model) || [];
    const base = model.descriptionKey;
    const description = translations[base] || (tiers[0] ? translations[`${base}_tier_${tiers[0]}`] : '') || '';
    return {
      id: model.id,
      name: model.name,
      apiId: getModelApiId(model),
      company: model.company || getModelCompany(model, getModelApiId(model)),
      provider: model.provider,
      providerLabel: getProviderLabel(model.provider),
      abilities: [
        modelSupportsVision(model) ? t('vision') : '',
        modelSupportsDocumentUpload(model) ? t('documents') : (getSingleDocumentTranslatorModel() ? t('translatedDocuments') : ''),
        modelSupportsWebSearch(model) ? t('search') : ''
      ].filter(Boolean),
      free: tiers.includes('free'),
      retirement: getModelRetirementLabel(model) || '',
      description,
      selected,
      disabled
    };
  };

  const renderCouncilControls = ({ open: forceOpen = null } = {}) => {
    const fileInputContainer = getFileInputContainer();
    const anchor = getComposerAnchor();
    const parent = anchor?.parentElement || fileInputContainer?.parentElement;
    if (!parent) return;

    let container = document.getElementById('model-council-control');
    const existingPanel = container?.querySelector('#model-picker-popover');
    const wasOpen = forceOpen ?? isPanelOpen(container);
    const previousScroll = wasOpen ? (existingPanel?.querySelector('[data-mp-scroll]')?.scrollTop || 0) : 0;
    const refocusSlider = wasOpen && document.activeElement?.matches?.('[data-mp-depth-input]');

    if (!container) {
      container = document.createElement('div');
      container.id = 'model-council-control';
      bindEvents(container);
    }
    // Next to the send controls; where there is no such button, after the attach button.
    if (anchor && anchor.parentElement === parent) {
      if (container.parentElement !== parent || container.nextElementSibling !== anchor) parent.insertBefore(container, anchor);
    } else if (container.parentElement !== parent || container.previousElementSibling !== fileInputContainer) {
      fileInputContainer.insertAdjacentElement('afterend', container);
    }

    const conversation = getActiveConversation();
    if (!conversation) {
      container.innerHTML = '';
      view = 'main';
      query = '';
      dropMarkupCache();
      return;
    }
    conversation.council = normalizeCouncilConfig(conversation.council);
    const config = getConfig();
    const language = config.uiLanguage;
    const i18n = getI18n();
    const translations = i18n[language] || i18n['zh-TW'] || {};
    const t = (key, values) => modelPickerText(language, key, values);
    const texts = getCouncilTexts();
    const runtimeTexts = getCouncilRuntimeTexts();
    const locked = getIsCouncilRunning() && conversation.council.enabled;
    const image = isImageConversation(conversation);
    const councilActive = conversation.council.enabled && !image;
    if (!wasOpen && forceOpen !== true) view = 'main';
    if (!councilActive && view !== 'main') view = 'main';
    const showTabs = !image && !(config.isLearningMode && !conversation.council.enabled);
    const archived = Boolean(conversation.archived);

    const { betaModels, currentModel, visibleModels } = prepareModelSwitcherModels({
      currentModelId: conversation.model,
      getModelApiId,
      getModelTiers,
      modelSettings: config.modelSettings,
      models
    });
    const context = { translations, t };
    const state = {
      open: wasOpen,
      view,
      query,
      locked,
      showTabs,
      disabled: archived,
      council: null,
      councilBlocked: false,
      groups: [],
      pickGroups: [],
      depth: null,
      effortLabel: '',
      modelName: currentModel?.name || '',
      title: currentModel?.name || t('modelPicker')
    };

    if (councilActive) {
      const validation = getCouncilValidation(conversation);
      const participants = getModelsByIds(conversation.council.participantModelIds);
      const synthesizer = models.find((model) => model.id === conversation.council.synthesizerModelId);
      const atMax = participants.length >= councilMaxModels;
      state.council = {
        count: participants.length,
        members: participants.map((model) => ({ id: model.id, name: model.name })),
        max: councilMaxModels,
        canAdd: !atMax,
        combinerName: synthesizer?.name || '',
        combinerPlaceholder: texts.selectSynthesizer,
        mode: conversation.council.mode,
        moreOpen,
        showRaw: Boolean(conversation.council.showRawResponses),
        showComparison: Boolean(conversation.council.showComparisonTable),
        searchAvailable: hasCouncilWebSearchAccess(synthesizer || normalizeConversationModel(conversation)) && !archived,
        searchOn: Boolean(conversation.isWebSearchEnabled),
        ok: validation.ok,
        message: validation.ok ? `${texts.ready} · ${participants.length} · ${synthesizer?.name || ''}` : validation.message,
        labels: {
          consensus: texts.consensus,
          deliberation: texts.deliberation,
          rawNotes: texts.rawNotes,
          comparison: runtimeTexts.comparisonToggle
        }
      };
      state.title = `${texts.title} · ${participants.length}`;
      if (view !== 'main') {
        const list = getCouncilModelList(conversation);
        const pickMembers = view === 'members';
        state.pickGroups = buildModelGroups(list, {
          decorate: (model) => describe(model, {
            ...context,
            selected: pickMembers
              ? conversation.council.participantModelIds.includes(model.id)
              : conversation.council.synthesizerModelId === model.id,
            disabled: locked || (pickMembers && atMax && !conversation.council.participantModelIds.includes(model.id))
          })
        });
      }
    } else {
      const listed = [...visibleModels.filter((model) => !model.isBeta), ...betaModels];
      state.groups = buildModelGroups(listed, {
        decorate: (model) => describe(model, { ...context, selected: model.id === currentModel?.id, disabled: archived }),
        currentId: currentModel?.id,
        currentLabel: t('current'),
        betaLabel: t('beta')
      });
      const reasoning = currentModel ? getModelReasoningConfig(currentModel) : null;
      if (reasoning?.options?.length > 1) {
        const effort = normalizeReasoningEffort(currentModel, conversation.reasoningEffort);
        const levels = reasoning.options.map((option) => ({ value: option, label: getReasoningEffortLabel(option, language) }));
        const index = Math.max(0, levels.findIndex((level) => level.value === effort));
        state.depth = { levels, index, defaultIndex: levels.findIndex((level) => level.value === reasoning.defaultEffort), disabled: archived };
        state.effortLabel = levels[index].label;
      }
    }

    const ctx = { t, escape: escapeHTML };
    const markup = `${renderPickerTrigger(state, ctx)}${renderPickerPanel(state, ctx)}`;
    // The panel can be closed from outside (a click elsewhere) without a render, so
    // what is on screen is only reused while it still agrees with what would be drawn.
    const screenMatches = isPanelOpen(container) === wasOpen
      && container.querySelector('#model-picker-btn')?.getAttribute('aria-expanded') === String(wasOpen);
    if (
      existingPanel
      && screenMatches
      && cachedContainer === container
      && cachedConversation === conversation
      && cachedMarkup === markup
    ) {
      if (wasOpen) fitPanel(container);
      return;
    }
    container.innerHTML = markup;
    cachedContainer = container;
    cachedConversation = conversation;
    cachedMarkup = markup;

    applySearch(container);
    fitPanel(container);
    const scroller = container.querySelector('[data-mp-scroll]');
    if (scroller && previousScroll) scroller.scrollTop = previousScroll;
    if (refocusSlider) container.querySelector('[data-mp-depth-input]')?.focus();
  };

  const applySearch = (container) => {
    const needle = query.trim().toLowerCase();
    const panel = container.querySelector('#model-picker-popover');
    if (!panel) return;
    let shown = 0;
    panel.querySelectorAll('[data-mp-group]').forEach((group) => {
      let any = false;
      group.querySelectorAll('[data-mp-search-text]').forEach((row) => {
        const match = !needle || (row.dataset.mpSearchText || '').includes(needle);
        row.hidden = !match;
        any ||= match;
      });
      group.hidden = !any;
      if (any) shown += 1;
    });
    const empty = panel.querySelector('[data-mp-empty]');
    if (empty) empty.hidden = shown > 0;
  };

  const notifyLocked = (container) => {
    showNotification(getCouncilRuntimeTexts().councilLocked, 'warning');
    renderCouncilControls();
    return container;
  };

  const setPanelOpen = (container, open) => {
    const panel = container.querySelector('#model-picker-popover');
    const button = container.querySelector('#model-picker-btn');
    if (!panel || !button) return;
    closeAllPopovers();
    if (open) {
      view = 'main';
      query = '';
      renderCouncilControls({ open: true });
      const search = container.querySelector('[data-mp-search]');
      const coarse = document.defaultView?.matchMedia?.('(pointer: coarse)')?.matches;
      if (search && !coarse) requestFrame(() => search.focus({ preventScroll: true }));
    } else {
      panel.classList.remove('visible');
      button.setAttribute('aria-expanded', 'false');
    }
  };

  const chooseModel = async (modelId) => {
    const conv = getActiveConversation();
    const config = getConfig();
    if (!conv || conv.archived) return false;
    const info = models.find((model) => model.id === modelId);
    if (!info) return false;
    const translations = getI18n()[config.uiLanguage] || {};
    const acknowledged = Array.isArray(config.acknowledgedStealthModelTerms) ? config.acknowledgedStealthModelTerms : [];
    const acknowledgementId = info.stealthTermsAcknowledgementId || info.id;
    if (info.requiresStealthTermsAcknowledgement && !acknowledged.includes(acknowledgementId)) {
      const placeholder = '{termsLink}';
      const template = translations.stealthModelTermsMessage || 'This stealth model is developed and operated by a third-party model provider. Prompts and completions for this model are retained by the provider and are not used for training; all other use is governed by the {termsLink}.';
      const linkText = translations.stealthModelTermsLink || 'Stealth Model Terms(opens in new tab)';
      const at = template.indexOf(placeholder);
      const messageParts = at === -1
        ? [template]
        : [template.slice(0, at), { text: linkText, href: 'https://openrouter.ai/terms/stealth' }, template.slice(at + placeholder.length)];
      const accepted = await showCustomDialog({
        title: translations.stealthModelTermsTitle || 'Stealth model terms',
        messageParts,
        buttons: [
          { text: translations.cancel || 'Cancel', class: 'bg-[var(--hover-bg)] px-4 py-2 rounded-md hover:bg-[var(--active-bg)]', value: () => false },
          { text: translations.confirm || 'Confirm', class: 'px-4 py-2 rounded-md btn-primary', value: () => true }
        ]
      });
      if (!accepted) return false;
      config.acknowledgedStealthModelTerms = [...acknowledged, acknowledgementId];
    }
    conv.model = info.id;
    conv.provider = info.provider;
    const defaultEffort = getModelReasoningConfig(info) ? normalizeReasoningEffort(info, null) : null;
    if (defaultEffort) conv.reasoningEffort = defaultEffort;
    else delete conv.reasoningEffort;
    if (info.outputModality === 'image' && conv.council) conv.council.enabled = false;
    config.lastUsedModel = modelId;
    await saveAppData();
    await saveConfig();
    renderSidebar();
    renderInputIndicators();
    return true;
  };

  const DEPTH_KEYS = Object.freeze({ ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, Home: 'first', End: 'last' });

  // Draws the thumb, the fill and the name at a position between 0 and the last level.
  const paintDepth = (input, position, { tick = false } = {}) => {
    const wrap = input.closest('[data-mp-slider]');
    if (tick && wrap && wrap.dataset.mpLevel !== undefined && Number(wrap.dataset.mpLevel) !== position) {
      try { document.defaultView?.navigator?.vibrate?.(6); } catch { /* no haptics here */ }
    }
    if (wrap) wrap.dataset.mpLevel = String(position);
    const last = Math.max(1, Number(input.max));
    wrap?.style.setProperty('--mp-p', String(Math.min(1, Math.max(0, position / last))));
    const labels = JSON.parse(input.closest('[data-mp-depth]')?.dataset.mpLabels || '[]');
    const label = labels[Math.min(labels.length - 1, Math.max(0, Math.round(position)))];
    if (label === undefined) return null;
    const value = input.closest('[data-mp-depth]')?.querySelector('[data-mp-depth-value]');
    if (value) value.textContent = label;
    input.setAttribute('aria-valuetext', label);
    return label;
  };

  // Lands on a level: the choice is saved without redrawing the panel, which would cut the
  // thumb's short move to that dot.
  const commitDepth = async (container, input, index) => {
    input.value = String(index);
    const label = paintDepth(input, index);
    const conv = getActiveConversation();
    const info = conv ? normalizeConversationModel(conv) : null;
    const options = getModelReasoningConfig(info)?.options || [];
    const chosen = normalizeReasoningEffort(info, options[index]);
    if (!conv || !chosen || chosen === normalizeReasoningEffort(info, conv.reasoningEffort)) return;
    conv.reasoningEffort = chosen;
    const effort = container.querySelector('.mp-trigger-effort');
    if (effort && label) effort.textContent = label;
    await saveAppData();
  };

  function bindEvents(container) {
    document.defaultView?.addEventListener?.('resize', () => { if (isPanelOpen(container)) fitPanel(container); });
    container.addEventListener('click', async (event) => {
      const target = event.target.closest?.('button, [data-mp-tab]');
      if (!target || !container.contains(target)) return;
      // Clicks here redraw the panel, which removes the clicked button before the page's
      // "click outside closes popovers" handler looks for it inside the picker.
      event.stopPropagation();
      const conv = getActiveConversation();
      if (!conv) return;

      if (target.id === 'model-picker-btn') {
        event.preventDefault();
        if (target.disabled) return;
        setPanelOpen(container, !isPanelOpen(container));
        return;
      }
      if (target.dataset.mpTab) {
        const wantCouncil = target.dataset.mpTab === 'council';
        conv.council = normalizeCouncilConfig(conv.council);
        if (conv.council.enabled === wantCouncil) return;
        if (getIsCouncilRunning()) { notifyLocked(container); return; }
        conv.council.enabled = wantCouncil;
        if (wantCouncil) seedCouncilParticipants(conv);
        view = 'main';
        query = '';
        await persistCouncilConfig(conv);
        renderCouncilControls();
        if (wantCouncil && !conv.isWebSearchEnabled) showNotification(getCouncilRuntimeTexts().searchManualNotice, 'warning');
        return;
      }
      if (target.dataset.mpModel) {
        if (await chooseModel(target.dataset.mpModel)) {
          container.querySelector('#model-picker-popover')?.classList.remove('visible');
          container.querySelector('#model-picker-btn')?.setAttribute('aria-expanded', 'false');
          renderCouncilControls({ open: false });
        }
        return;
      }
      if (target.dataset.mpOpen) {
        view = target.dataset.mpOpen;
        query = '';
        renderCouncilControls({ open: true });
        return;
      }
      if ('mpBack' in target.dataset) {
        view = 'main';
        query = '';
        renderCouncilControls({ open: true });
        return;
      }
      if (target.dataset.mpRemove) {
        if (getIsCouncilRunning()) { notifyLocked(container); return; }
        conv.council.participantModelIds = conv.council.participantModelIds.filter((id) => id !== target.dataset.mpRemove);
        await persistCouncilConfig(conv);
        return;
      }
      if (target.dataset.mpMode) {
        if (getIsCouncilRunning()) { notifyLocked(container); return; }
        conv.council.mode = target.dataset.mpMode;
        await persistCouncilConfig(conv);
      }
    });

    container.addEventListener('change', async (event) => {
      const input = event.target;
      const conv = getActiveConversation();
      if (!conv || !input?.matches) return;
      conv.council = normalizeCouncilConfig(conv.council);
      const guarded = () => {
        if (!getIsCouncilRunning()) return false;
        notifyLocked(container);
        return true;
      };
      if (input.matches('[data-mp-member]')) {
        if (guarded()) return;
        const ids = new Set(conv.council.participantModelIds);
        if (input.checked) {
          if (ids.size >= councilMaxModels) {
            showNotification(getCouncilTexts().tooMany, 'warning');
            renderCouncilControls();
            return;
          }
          ids.add(input.dataset.mpMember);
        } else {
          ids.delete(input.dataset.mpMember);
        }
        conv.council.participantModelIds = [...ids];
        await persistCouncilConfig(conv);
      } else if (input.matches('[data-mp-combiner]')) {
        if (guarded() || !input.checked) return;
        conv.council.synthesizerModelId = input.dataset.mpCombiner;
        view = 'main';
        query = '';
        await persistCouncilConfig(conv);
        renderCouncilControls();
      } else if (input.matches('[data-mp-raw]')) {
        if (guarded()) return;
        conv.council.showRawResponses = input.checked;
        await persistCouncilConfig(conv);
      } else if (input.matches('[data-mp-comparison]')) {
        if (guarded()) return;
        conv.council.showComparisonTable = input.checked;
        await persistCouncilConfig(conv);
      } else if (input.matches('[data-mp-search-toggle]')) {
        if (guarded()) return;
        conv.isWebSearchEnabled = input.checked;
        await saveAppData();
        renderCouncilControls();
        renderInputIndicators();
      } else if (input.matches('[data-mp-depth-input]')) {
        // Let go: the thumb settles on the nearest dot and that level is kept.
        await commitDepth(container, input, Math.round(Number(input.value)));
      }
    });

    container.addEventListener('input', (event) => {
      const input = event.target;
      if (input?.matches?.('[data-mp-search]')) {
        query = input.value;
        applySearch(container);
      } else if (input?.matches?.('[data-mp-depth-input]')) {
        // It goes to the nearest dot at once, with a tick where the hardware has one.
        paintDepth(input, Math.round(Number(input.value)), { tick: true });
      }
    });

    container.addEventListener('toggle', (event) => {
      if (event.target?.matches?.('.mp-more')) moreOpen = Boolean(event.target.open);
    }, true);

    container.addEventListener('keydown', (event) => {
      if (event.target?.matches?.('[data-mp-depth-input]') && DEPTH_KEYS[event.key]) {
        event.preventDefault();
        const input = event.target;
        const last = Math.max(1, Number(input.max));
        const current = Math.round(Number(input.value));
        const step = DEPTH_KEYS[event.key];
        commitDepth(container, input, step === 'first' ? 0 : step === 'last' ? last : Math.min(last, Math.max(0, current + step)));
        return;
      }
      if (event.key === 'Escape' && isPanelOpen(container)) {
        if (event.target?.matches?.('[data-mp-search]') && event.target.value) {
          event.target.value = '';
          query = '';
          applySearch(container);
        } else {
          setPanelOpen(container, false);
          container.querySelector('#model-picker-btn')?.focus();
        }
        event.stopPropagation();
      }
    });
  }

  // Opens the panel on the council page (the attachment menu's "Model council").
  const openModelPicker = async ({ council = false } = {}) => {
    renderCouncilControls();
    const container = document.getElementById('model-council-control');
    const conv = getActiveConversation();
    if (!container || !conv) return false;
    conv.council = normalizeCouncilConfig(conv.council);
    if (council && !conv.council.enabled && !isImageConversation(conv)) {
      if (getIsCouncilRunning()) return false;
      conv.council.enabled = true;
      seedCouncilParticipants(conv);
      await persistCouncilConfig(conv);
    }
    closeAllPopovers();
    view = 'main';
    query = '';
    renderCouncilControls({ open: true });
    return true;
  };

  return { renderCouncilControls, openModelPicker };
}
