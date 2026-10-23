// The model picker in the composer: one button that names what will answer
// (a model, or a council) and the one panel behind it for choosing a model,
// building a council (and saving up to five named groups of members), and setting
// how deeply the model thinks. The models used lately are offered first.

import {
  renderDepthPanel,
  renderDepthTrigger,
  renderPickerPanel,
  renderPickerTrigger
} from '../../ui/model-picker/model-picker-markup.js';
import {
  GROUP_LIMIT,
  newGroupId,
  nextGroupNumber,
  noteModelsUsed as noteRecent
} from '../../ui/model-picker/model-groups.js';
import { modelPickerText } from '../../ui/model-picker/model-picker-texts.js';
import { bindCouncilControlEvents } from './council-controls-events.js';
import { createPickerViewState } from './council-controls-view-state.js';
import { createPickerChoices } from './council-controls-choices.js';
import { applyModelSearch } from '../../ui/model-picker/model-search.js';

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
  const ui = {
    view: 'main',
    query: '',
    moreOpen: false,
    // Which saved group the member or combiner list is editing (none: the council itself).
    pickGroupId: null
  };

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
      // A phone panel keeps one size (model-picker.css), whatever the keyboard or the search results do.
      panel.style.maxHeight = '';
      panel.style.height = '';
      return;
    }
    panel.style.height = '';
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

  const { buildPickerState } = createPickerViewState({
    ui, models, councilMaxModels, getI18n, getCouncilTexts, getCouncilRuntimeTexts, getIsCouncilRunning, isImageConversation,
    getModelApiId, getModelTiers, groupsOf, modelName, getCouncilValidation, getModelsByIds, hasCouncilWebSearchAccess,
    normalizeConversationModel, getCouncilModelList, getModelReasoningConfig, normalizeReasoningEffort, getReasoningEffortLabel,
    getProviderLabel, modelSupportsVision, modelSupportsDocumentUpload, getSingleDocumentTranslatorModel, modelSupportsWebSearch,
    getModelRetirementLabel
  });

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
      ui.view = 'main';
      ui.query = '';
      dropMarkupCache();
      lastLayout = null;
      return;
    }
    conversation.council = normalizeCouncilConfig(conversation.council);
    const config = getConfig();
    const language = config.uiLanguage;
    const { state, t, councilActive } = buildPickerState({ conversation, config, language, wasOpen, target });

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
    const layout = `${councilActive ? 'council' : 'single'}:${ui.view}`;
    const page = container.querySelector('.mp-view');
    if (page && wasOpen && lastLayout && lastLayout !== layout) {
      const [beforeKind, beforeView] = lastLayout.split(':');
      const kind = councilActive ? 'council' : 'single';
      page.classList.add(beforeKind !== kind && beforeView === ui.view ? 'is-fade' : ui.view === 'main' ? 'is-back' : 'is-enter');
    }
    lastLayout = layout;
    const scroller = container.querySelector('[data-mp-scroll]');
    if (scroller && previousScroll) scroller.scrollTop = previousScroll;
    if (refocusSlider) container.querySelector('[data-mp-depth-input]')?.focus();
  };

  const applySearch = (container) => applyModelSearch(container.querySelector('#model-picker-popover'), ui.query);

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

  // On a phone the model panel is a fixed height (searching does not shrink it) that reaches from just above the composer box up to just under the row of buttons at the
  // top of the screen, as the design panel does (deck-design-control.js); measured once when it opens, from where the box is then.
  const PHONE_PANEL_TOP_ROOM = 56;
  const PHONE_PANEL_GAP = 12;
  const PHONE_PANEL_MAX = 544;
  const PHONE_PANEL_MIN = 200;
  const fitPhonePanel = (container) => {
    const view = document.defaultView;
    if (!container || !view || view.innerWidth > 768) {
      container?.style.removeProperty('--mp-phone-height');
      return;
    }
    const box = container.closest('.input-wrapper');
    if (!box) return;
    const room = box.getBoundingClientRect().top - PHONE_PANEL_GAP - PHONE_PANEL_TOP_ROOM;
    container.style.setProperty('--mp-phone-height', `${Math.round(Math.max(PHONE_PANEL_MIN, Math.min(PHONE_PANEL_MAX, room)))}px`);
  };

  // Opens the model panel or the thinking panel, or closes both. Only one is open at a time.
  const setPanelOpen = (container, which, open) => {
    closeAllPopovers();
    if (open) {
      if (which === 'model') {
        ui.view = 'main';
        ui.query = '';
      }
      if (which === 'model') fitPhonePanel(container);
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

  const { chooseModel, DEPTH_KEYS, paintDepth, commitDepth } = createPickerChoices({
    document, models, getActiveConversation, getConfig, getI18n, showCustomDialog, getModelReasoningConfig, normalizeReasoningEffort,
    normalizeConversationModel, renderSidebar, renderInputIndicators, saveAppData, saveConfig, afterPaint
  });

  // Bound when the control is first drawn; by then every helper below exists.
  function bindEvents(container) {
    bindCouncilControlEvents(container, {
    DEPTH_KEYS, addGroup, applySearch, chooseModel, commitCouncil, commitDepth, councilMaxModels, document, fitPanel,
    getActiveConversation, getConfig, getCouncilTexts, getIsCouncilRunning, groupsOf, isDepthOpen, isPanelOpen, normalizeCouncilConfig,
    notifyLocked, offerSearch, paintDepth, renderCouncilControls, renderInputIndicators, saveAppData, saveGroups, seedCouncilParticipants,
    setPanelOpen, showNotification, ui, updateGroup
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
    if (council && !conv.council.enabled && !isImageConversation(conv) && conv.retentionMode !== 'ephemeral') {
      if (getIsCouncilRunning()) return false;
      conv.council.enabled = true;
      seedCouncilParticipants(conv);
      commitCouncil(conv);
    }
    closeAllPopovers();
    ui.view = 'main';
    ui.query = '';
    fitPhonePanel(container);
    renderCouncilControls({ open: 'model' });
    return true;
  };

  return { renderCouncilControls, openModelPicker, noteConversationModels };
}
