// The model picker in the composer: one button that names what will answer
// (a model, or a council) and the one panel behind it for choosing a model,
// building a council (and saving up to five named groups of members), and setting
// how deeply the model thinks. The models used lately are offered first.

import { buildModelGroups, getModelCompany } from '../../ui/model-picker/model-picker-groups.js';
import { renderDepthPanel, renderDepthTrigger, renderPickerPanel, renderPickerTrigger } from '../../ui/model-picker/model-picker-markup.js';
import {
  GROUP_LIMIT,
  GROUP_NAME_LIMIT,
  councilMatchesGroup,
  newGroupId,
  nextGroupNumber,
  noteModelsUsed as noteRecent,
  pickRecentModels
} from '../../ui/model-picker/model-groups.js';
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
  // Which saved group the member or combiner list is editing (none: the council itself).
  let pickGroupId = null;

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
    if (view.innerWidth <= 768) {
      panel.style.maxHeight = '';
      return;
    }
    const room = trigger.getBoundingClientRect().top - 24;
    panel.style.maxHeight = `${Math.round(Math.max(220, Math.min(640, room)))}px`;
  };

  const isPanelOpen = (container) => Boolean(container?.querySelector('#model-picker-popover')?.classList.contains('visible'));
  const isDepthOpen = (container) => Boolean(container?.querySelector('#model-depth-popover')?.classList.contains('visible'));

  // How the panel last looked (single or council, which page), so a change of page can ease in.
  let lastLayout = null;

  const groupsOf = (config) => (Array.isArray(config.councilGroups) ? config.councilGroups : []);
  const modelName = (id) => models.find((model) => model.id === id)?.name || '';
  // Saving writes everything and can hold the page for a moment, so a change is drawn first and its
  // save starts two frames later, after the drawing has been painted.
  const inBackground = (work) => Promise.resolve(work).catch((error) => console.error('Could not save the model picker settings', error));
  const afterPaint = (work) => requestFrame(() => requestFrame(() => inBackground(work())));

  const saveGroups = (config, groups) => {
    config.councilGroups = groups;
    afterPaint(saveConfig);
  };

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
    // `open` is 'model' or 'depth' to open that panel (true means the model one), false to close both,
    // and left out to keep what is on screen.
    const target = forceOpen === true ? 'model' : forceOpen;
    const wasOpen = target === null ? isPanelOpen(container) : target === 'model';
    let depthOpen = target === null ? isDepthOpen(container) : target === 'depth';
    const previousScroll = wasOpen ? (existingPanel?.querySelector('[data-mp-scroll]')?.scrollTop || 0) : 0;
    const refocusSlider = depthOpen && document.activeElement?.matches?.('[data-mp-depth-input]');

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
      lastLayout = null;
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
    if (!wasOpen && target !== 'model') view = 'main';
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
    const groupList = groupsOf(config);
    if (pickGroupId && !groupList.some((group) => group.id === pickGroupId)) pickGroupId = null;
    const pickTarget = pickGroupId ? groupList.find((group) => group.id === pickGroupId) : null;
    const groupLabel = (group, index) => group.name || t('groupDefaultName', { n: index + 1 });
    const groupSummary = (group) => [
      group.participantModelIds.length ? group.participantModelIds.map(modelName).filter(Boolean).join(', ') : t('groupNoMembers'),
      group.synthesizerModelId ? t('groupCombinerIs', { name: modelName(group.synthesizerModelId) }) : t('groupNoCombiner')
    ].join(' · ');
    const state = {
      open: wasOpen,
      depthOpen: false,
      view,
      query,
      locked,
      showTabs,
      disabled: archived,
      council: null,
      councilBlocked: false,
      groups: [],
      pickGroups: [],
      pickTitle: '',
      groupsPage: null,
      depth: null,
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
        groupLimit: GROUP_LIMIT,
        canSaveGroup: groupList.length < GROUP_LIMIT && participants.length > 0,
        groups: groupList.map((group, index) => ({
          id: group.id,
          label: groupLabel(group, index),
          summary: groupSummary(group),
          active: councilMatchesGroup(group, conversation.council)
        })),
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
      if (view === 'groups') {
        state.groupsPage = {
          limit: GROUP_LIMIT,
          nameLimit: GROUP_NAME_LIMIT,
          canAdd: groupList.length < GROUP_LIMIT,
          groups: groupList.map((group, index) => ({
            id: group.id,
            name: group.name,
            label: groupLabel(group, index),
            summary: groupSummary(group),
            canApply: group.participantModelIds.length > 0
          }))
        };
      } else if (view !== 'main') {
        const list = getCouncilModelList(conversation);
        const pickMembers = view === 'members';
        const memberIds = pickTarget ? pickTarget.participantModelIds : conversation.council.participantModelIds;
        const combinerId = pickTarget ? pickTarget.synthesizerModelId : conversation.council.synthesizerModelId;
        const full = memberIds.length >= councilMaxModels;
        const targetLabel = pickTarget ? groupLabel(pickTarget, groupList.indexOf(pickTarget)) : '';
        state.pickTitle = pickMembers
          ? (pickTarget ? t('groupPickMembers', { name: targetLabel }) : `${t('pickMembers')} (${memberIds.length}/${councilMaxModels})`)
          : (pickTarget ? t('groupPickCombiner', { name: targetLabel }) : t('pickCombiner'));
        state.pickGroups = buildModelGroups(list, {
          decorate: (model) => describe(model, {
            ...context,
            selected: pickMembers ? memberIds.includes(model.id) : combinerId === model.id,
            disabled: (!pickTarget && locked) || (pickMembers && full && !memberIds.includes(model.id))
          }),
          recentIds: pickRecentModels(config.recentModelIds, list.map((model) => model.id)),
          recentLabel: t('recent')
        });
      }
    } else {
      const listed = [...visibleModels.filter((model) => !model.isBeta), ...betaModels];
      state.groups = buildModelGroups(listed, {
        decorate: (model) => describe(model, { ...context, selected: model.id === currentModel?.id, disabled: archived }),
        recentIds: pickRecentModels(config.recentModelIds, listed.map((model) => model.id), { current: currentModel?.id }),
        recentLabel: t('recent'),
        betaLabel: t('beta')
      });
      const reasoning = currentModel ? getModelReasoningConfig(currentModel) : null;
      if (reasoning?.options?.length > 1) {
        const effort = normalizeReasoningEffort(currentModel, conversation.reasoningEffort);
        const levels = reasoning.options.map((option) => ({ value: option, label: getReasoningEffortLabel(option, language) }));
        const index = Math.max(0, levels.findIndex((level) => level.value === effort));
        state.depth = { levels, index, defaultIndex: levels.findIndex((level) => level.value === reasoning.defaultEffort), disabled: archived };
      }
    }

    depthOpen = depthOpen && Boolean(state.depth);
    state.depthOpen = depthOpen;
    const ctx = { t, escape: escapeHTML };
    const depthMarkup = state.depth ? `<div class="mp-anchor">${renderDepthTrigger(state, ctx)}${renderDepthPanel(state, ctx)}</div>` : '';
    const markup = `<div class="mp-anchor">${renderPickerTrigger(state, ctx)}${renderPickerPanel(state, ctx)}</div>${depthMarkup}`;
    // The panel can be closed from outside (a click elsewhere) without a render, so
    // what is on screen is only reused while it still agrees with what would be drawn.
    const screenMatches = isPanelOpen(container) === wasOpen
      && isDepthOpen(container) === depthOpen
      && container.querySelector('#model-picker-btn')?.getAttribute('aria-expanded') === String(wasOpen)
      && (!state.depth || container.querySelector('#model-depth-btn')?.getAttribute('aria-expanded') === String(depthOpen));
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
    // Moving to another page of the panel eases in: forward slides from the right, back from the left,
    // and single/council fades.
    const layout = `${councilActive ? 'council' : 'single'}:${view}`;
    const page = container.querySelector('.mp-view');
    if (page && wasOpen && lastLayout && lastLayout !== layout) {
      const [beforeKind, beforeView] = lastLayout.split(':');
      const kind = councilActive ? 'council' : 'single';
      page.classList.add(beforeKind !== kind && beforeView === view ? 'is-fade' : view === 'main' ? 'is-back' : 'is-enter');
    }
    lastLayout = layout;
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

  // The council changed: draw it now and save it after the drawing is painted. (When the save ends the
  // page redraws, which changes nothing that shows.)
  const commitCouncil = (conv) => {
    const config = getConfig();
    // Turning the council on turns Learning mode off, as saving it will; the tag row must agree at once.
    if (conv.council?.enabled && config.isLearningMode) config.isLearningMode = false;
    renderCouncilControls();
    renderInputIndicators();
    afterPaint(() => persistCouncilConfig(conv));
  };

  const notifyLocked = (container) => {
    showNotification(getCouncilRuntimeTexts().councilLocked, 'warning');
    renderCouncilControls();
    return container;
  };

  // Opens the model panel or the thinking panel, or closes both. Only one is open at a time.
  const setPanelOpen = (container, which, open) => {
    closeAllPopovers();
    if (open) {
      if (which === 'model') {
        view = 'main';
        query = '';
      }
      renderCouncilControls({ open: which });
      if (which === 'model') {
        const search = container.querySelector('[data-mp-search]');
        const coarse = document.defaultView?.matchMedia?.('(pointer: coarse)')?.matches;
        if (search && !coarse) requestFrame(() => search.focus({ preventScroll: true }));
      } else {
        container.querySelector('[data-mp-depth-input]')?.focus({ preventScroll: true });
      }
      return;
    }
    container.querySelectorAll('.mp-panel').forEach((panel) => panel.classList.remove('visible'));
    container.querySelectorAll('.mp-trigger').forEach((button) => button.setAttribute('aria-expanded', 'false'));
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
    config.recentModelIds = noteRecent(config.recentModelIds, [modelId]);
    renderSidebar();
    renderInputIndicators();
    afterPaint(async () => {
      await saveAppData();
      await saveConfig();
    });
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
    if (value && value.textContent !== label) {
      value.textContent = label;
      const reduce = document.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
      if (typeof value.animate === 'function' && !reduce) {
        value.animate([{ opacity: 0.3, transform: 'translateY(5px) scale(0.92)' }, { opacity: 1, transform: 'none' }], { duration: 170, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1.2)' });
      }
    }
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
    const shown = container.querySelector('.mp-depth-trigger-value');
    if (shown && label) shown.textContent = label;
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
        setPanelOpen(container, 'model', !isPanelOpen(container));
        return;
      }
      if (target.id === 'model-depth-btn') {
        event.preventDefault();
        if (target.disabled) return;
        setPanelOpen(container, 'depth', !isDepthOpen(container));
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
        commitCouncil(conv);
        renderCouncilControls();
        if (wantCouncil && !conv.isWebSearchEnabled) offerSearch(conv);
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
      if (target.dataset.mpGroupApply !== undefined) {
        const config = getConfig();
        const group = groupsOf(config).find((item) => item.id === target.dataset.mpGroupApply);
        if (!group || !group.participantModelIds.length) return;
        if (getIsCouncilRunning()) { notifyLocked(container); return; }
        conv.council = normalizeCouncilConfig(conv.council);
        conv.council.participantModelIds = group.participantModelIds.slice(0, councilMaxModels);
        if (group.synthesizerModelId) conv.council.synthesizerModelId = group.synthesizerModelId;
        if (view === 'groups') view = 'main';
        commitCouncil(conv);
        renderCouncilControls({ open: 'model' });
        return;
      }
      if (target.dataset.mpGroupSave !== undefined) {
        const council = normalizeCouncilConfig(conv.council);
        await addGroup(getConfig(), { participantModelIds: council.participantModelIds.slice(), synthesizerModelId: council.synthesizerModelId });
        renderCouncilControls({ open: 'model' });
        return;
      }
      if (target.dataset.mpGroupNew !== undefined) {
        const group = await addGroup(getConfig(), {});
        if (group) {
          pickGroupId = group.id;
          view = 'members';
          query = '';
        }
        renderCouncilControls({ open: 'model' });
        return;
      }
      if (target.dataset.mpGroupEdit || target.dataset.mpGroupEditCombiner) {
        pickGroupId = target.dataset.mpGroupEdit || target.dataset.mpGroupEditCombiner;
        view = target.dataset.mpGroupEdit ? 'members' : 'combiner';
        query = '';
        renderCouncilControls({ open: 'model' });
        return;
      }
      if (target.dataset.mpGroupDelete) {
        const config = getConfig();
        await saveGroups(config, groupsOf(config).filter((group) => group.id !== target.dataset.mpGroupDelete));
        renderCouncilControls({ open: 'model' });
        return;
      }
      if (target.dataset.mpOpen) {
        pickGroupId = null;
        view = target.dataset.mpOpen;
        query = '';
        renderCouncilControls({ open: 'model' });
        return;
      }
      if ('mpBack' in target.dataset) {
        // Back from a group's own list goes to the groups page, otherwise to the council page.
        view = pickGroupId ? 'groups' : 'main';
        pickGroupId = null;
        query = '';
        renderCouncilControls({ open: 'model' });
        return;
      }
      if (target.dataset.mpRemove) {
        if (getIsCouncilRunning()) { notifyLocked(container); return; }
        conv.council.participantModelIds = conv.council.participantModelIds.filter((id) => id !== target.dataset.mpRemove);
        commitCouncil(conv);
        return;
      }
      if (target.dataset.mpMode) {
        if (getIsCouncilRunning()) { notifyLocked(container); return; }
        conv.council.mode = target.dataset.mpMode;
        commitCouncil(conv);
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
      if (input.matches('[data-mp-group-name]')) {
        const config = getConfig();
        const groups = groupsOf(config);
        const index = groups.findIndex((group) => group.id === input.dataset.mpGroupName);
        if (index < 0) return;
        const name = input.value.trim().slice(0, GROUP_NAME_LIMIT)
          || modelPickerText(config.uiLanguage, 'groupDefaultName', { n: index + 1 });
        await updateGroup(config, input.dataset.mpGroupName, { name });
        renderCouncilControls({ open: 'model' });
      } else if (pickGroupId && input.matches('[data-mp-member], [data-mp-combiner]')) {
        const config = getConfig();
        const group = groupsOf(config).find((item) => item.id === pickGroupId);
        if (!group) return;
        if (input.matches('[data-mp-member]')) {
          const ids = new Set(group.participantModelIds);
          if (input.checked) {
            if (ids.size >= councilMaxModels) {
              showNotification(getCouncilTexts().tooMany, 'warning');
              renderCouncilControls({ open: 'model' });
              return;
            }
            ids.add(input.dataset.mpMember);
          } else {
            ids.delete(input.dataset.mpMember);
          }
          await updateGroup(config, group.id, { participantModelIds: [...ids] });
        } else if (input.checked) {
          await updateGroup(config, group.id, { synthesizerModelId: input.dataset.mpCombiner });
          view = 'groups';
          pickGroupId = null;
          query = '';
        }
        renderCouncilControls({ open: 'model' });
      } else if (input.matches('[data-mp-member]')) {
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
        commitCouncil(conv);
      } else if (input.matches('[data-mp-combiner]')) {
        if (guarded() || !input.checked) return;
        conv.council.synthesizerModelId = input.dataset.mpCombiner;
        view = 'main';
        query = '';
        commitCouncil(conv);
        renderCouncilControls();
      } else if (input.matches('[data-mp-raw]')) {
        if (guarded()) return;
        conv.council.showRawResponses = input.checked;
        commitCouncil(conv);
      } else if (input.matches('[data-mp-comparison]')) {
        if (guarded()) return;
        conv.council.showComparisonTable = input.checked;
        commitCouncil(conv);
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
      if (event.key === 'Escape' && (isPanelOpen(container) || isDepthOpen(container))) {
        if (event.target?.matches?.('[data-mp-search]') && event.target.value) {
          event.target.value = '';
          query = '';
          applySearch(container);
        } else {
          const depth = isDepthOpen(container);
          setPanelOpen(container, depth ? 'depth' : 'model', false);
          container.querySelector(depth ? '#model-depth-btn' : '#model-picker-btn')?.focus();
        }
        event.stopPropagation();
      }
    });
  }

  // Groups: saved sets of members and who combines them.
  const addGroup = async (config, values) => {
    const groups = groupsOf(config);
    if (groups.length >= GROUP_LIMIT) return null;
    const language = config.uiLanguage;
    const number = nextGroupNumber(groups, (n) => modelPickerText(language, 'groupDefaultName', { n }));
    const group = {
      id: newGroupId(groups),
      name: modelPickerText(language, 'groupDefaultName', { n: number }),
      participantModelIds: values.participantModelIds || [],
      synthesizerModelId: values.synthesizerModelId || null
    };
    await saveGroups(config, [...groups, group]);
    return group;
  };

  const updateGroup = async (config, id, change) => {
    const groups = groupsOf(config);
    if (!groups.some((group) => group.id === id)) return;
    await saveGroups(config, groups.map((group) => (group.id === id ? { ...group, ...change } : group)));
  };

  // What the council now uses is recorded as used lately, so it is offered first next time.
  const noteModelsUsed = async (ids) => {
    const config = getConfig();
    const before = Array.isArray(config.recentModelIds) ? config.recentModelIds : [];
    const next = noteRecent(before, ids.filter((id) => models.some((model) => model.id === id)));
    if (next.join('|') === before.join('|')) return;
    config.recentModelIds = next;
    await saveConfig();
  };

  const noteConversationModels = async (conv) => {
    if (!conv) return;
    const council = normalizeCouncilConfig(conv.council);
    if (council.enabled && !isImageConversation(conv)) {
      await noteModelsUsed([...(council.participantModelIds || []), council.synthesizerModelId].filter(Boolean));
    } else if (conv.model) {
      await noteModelsUsed([conv.model]);
    }
  };

  // A council does not search the web by itself: say so once, with a button that turns Search on.
  const offerSearch = (conv) => {
    if (!hasCouncilWebSearchAccess(models.find((model) => model.id === conv.council?.synthesizerModelId) || normalizeConversationModel(conv))) return;
    const runtimeTexts = getCouncilRuntimeTexts();
    showNotification(runtimeTexts.searchManualNotice, 'warning', {
      action: {
        label: runtimeTexts.searchManualAction,
        onClick: async () => {
          conv.isWebSearchEnabled = true;
          await saveAppData();
          renderCouncilControls();
          renderInputIndicators();
        }
      }
    });
  };

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
      commitCouncil(conv);
    }
    closeAllPopovers();
    view = 'main';
    query = '';
    renderCouncilControls({ open: 'model' });
    return true;
  };

  return { renderCouncilControls, openModelPicker, noteConversationModels };
}
