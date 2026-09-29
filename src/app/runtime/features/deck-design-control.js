// "Design" in the composer: chosen before asking for a presentation or a
// Word document, in one picker with a tab for each. "AI adaptive" (the
// default) lets the model set every design parameter for the content; a
// template makes it use that template as is. The choices are kept on the
// conversation (deckDesign, documentDesign) and sent with the file authoring
// guidance.
//
// The button sits next to the attachment button in both composer layouts.
// The picker (thumbnails of each template) loads while the browser is idle and
// when the pointer or a finger reaches the button, is drawn once and kept, and
// on opening only brings its choices up to date.

import { DESIGN_PRESET_IDS, getPresetText } from '../../ui/files/design/design-presets.js';
import { DOCUMENT_PRESET_IDS, getDocumentPresetText } from '../../ui/files/design/document-presets.js';
import { getFileText } from '../../ui/files/file-texts.js';
import { modelSupportsToolCalling } from '../legacy-core/model-registry.js';
import { describeFileModeState } from '../sandbox/file-mode.js';
import { browserSupportsSandbox } from '../sandbox/sandbox-protocol.js';

export const DECK_DESIGN_AUTO = 'auto';

export const normalizeDeckDesign = (value) => (DESIGN_PRESET_IDS.includes(value) ? value : DECK_DESIGN_AUTO);
export const normalizeDocumentChoice = (value) => (DOCUMENT_PRESET_IDS.includes(value) ? value : DECK_DESIGN_AUTO);
const FIELDS = Object.freeze({ deck: 'deckDesign', document: 'documentDesign' });
const currentChoices = (conversation) => ({
  deck: normalizeDeckDesign(conversation?.deckDesign),
  document: normalizeDocumentChoice(conversation?.documentDesign)
});

// Same chevron as the reasoning control, whose button styles this reuses.
const CHEVRON = '<svg class="deck-design-chevron" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 15 12 9 18 15"></polyline></svg>';

export function createDeckDesignControl({
  document,
  window = globalThis.window,
  getActiveConversation,
  saveAppData,
  getUiLanguage = () => 'zh-TW',
  closeAllPopovers = () => {},
  // For Standard or Advanced mode (the picker's "Mode" row).
  getConfig = () => ({}),
  normalizeConversationModel = () => null,
  isCouncilEnabled = () => false,
  getModeState = () => describeFileModeState({
    window,
    conversation: getActiveConversation(),
    config: getConfig(),
    modelInfo: normalizeConversationModel(getActiveConversation()),
    supportsToolCalling: modelSupportsToolCalling,
    isCouncil: isCouncilEnabled(getActiveConversation()),
    browserSupported: browserSupportsSandbox(window)
  }),
  // The picker's stylesheet loads with it, keeping the startup CSS small.
  loadPicker = () => Promise.all([
    import('../../ui/files/design/deck-design-picker.js'),
    import('../../ui/files/design/deck-design-picker.css')
  ]).then(([module]) => module),
  logError = (...args) => console.error(...args)
}) {
  let picker = null;
  let pickerLanguage = null;
  let loading = null;
  let preparing = null;

  // The picker's code and stylesheet, fetched once, before they are asked for where possible.
  const load = () => {
    loading ||= loadPicker().catch((error) => {
      loading = null;
      throw error;
    });
    return loading;
  };

  // Opens above the composer when there is room (the composer is usually at
  // the bottom), otherwise below it (a new chat centres the composer), and
  // never taller than the space on that side.
  const EDGE = 12;
  const GAP = 8;
  const PREFERRED_HEIGHT = 544;
  const MIN_ABOVE = 320;
  const PREFERRED_WIDTH = 400;
  const place = (button, popover) => {
    const rect = button.getBoundingClientRect();
    const viewportHeight = window?.innerHeight || document.documentElement.clientHeight || 800;
    const viewportWidth = window?.innerWidth || document.documentElement.clientWidth || 1024;
    // Horizontally: as wide as fits, starting at the control and shifted left
    // when it would run off the right edge (phones).
    const anchor = (popover.offsetParent || button.parentElement || button).getBoundingClientRect();
    const width = Math.max(200, Math.min(PREFERRED_WIDTH, viewportWidth - EDGE * 2));
    const left = Math.min(Math.max(anchor.left, EDGE), viewportWidth - EDGE - width);
    Object.assign(popover.style, { width: `${width}px`, left: `${Math.round(left - anchor.left)}px` });
    const above = rect.top - EDGE - GAP;
    const below = viewportHeight - rect.bottom - EDGE - GAP;
    const down = above < Math.min(MIN_ABOVE, PREFERRED_HEIGHT) && below > above;
    Object.assign(popover.style, {
      top: down ? '100%' : 'auto',
      bottom: down ? 'auto' : '100%',
      marginTop: down ? `${GAP}px` : '0',
      marginBottom: down ? '0' : `${GAP}px`,
      maxHeight: `${Math.max(160, Math.min(PREFERRED_HEIGHT, down ? below : above))}px`,
      transformOrigin: down ? 'top left' : 'bottom left'
    });
  };

  // Shown at once when the picker's code has not arrived yet, so the click answers straight away.
  // A turning ring drawn in the markup itself: it needs no stylesheet, which is one of the things loading.
  const showLoading = (popover) => {
    if (popover.childElementCount > 0) return;
    popover.innerHTML = '<div role="status" aria-busy="true" style="display:grid;place-items:center;min-height:4.5rem"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" opacity="0.2"></circle><path d="M21 12a9 9 0 0 0-9-9"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite"></animateTransform></path></svg></div>';
  };

  const ensure = () => {
    let control = document.getElementById('deck-design-control');
    if (control) return control;
    const container = document.getElementById('file-input-container');
    if (!container) return null;
    control = document.createElement('div');
    control.id = 'deck-design-control';
    control.className = 'relative';
    // Layout that must hold before the picker's stylesheet loads: the control
    // centres like the reasoning control, and the popover never takes space.
    control.style.cssText = 'display:inline-flex;align-items:center;align-self:center';
    control.innerHTML = `
      <button type="button" id="deck-design-btn" class="reasoning-depth-btn is-adjustable deck-design-btn" style="max-width:12rem" aria-haspopup="dialog" aria-expanded="false">
        <span class="deck-design-label"></span>${CHEVRON}
      </button>
      <div id="deck-design-popover" class="popover deck-design-popover" role="dialog" style="position:absolute;left:0;bottom:100%"></div>
    `;
    container.appendChild(control);
    const button = control.querySelector('#deck-design-btn');
    const popover = control.querySelector('#deck-design-popover');
    // Before the click: the browser is idle, or the pointer or a finger is on its way to the button.
    const warm = () => {
      if (button.disabled) return;
      preparing ||= prepare(popover).then((ready) => {
        if (!ready) preparing = null;
        return ready;
      });
    };
    const idle = window?.requestIdleCallback;
    if (typeof idle === 'function') idle.call(window, () => { void load().catch(() => {}); }, { timeout: 6000 });
    button.addEventListener('pointerenter', warm);
    button.addEventListener('focus', warm);
    button.addEventListener('touchstart', warm, { passive: true });
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (button.disabled) return;
      const opening = !popover.classList.contains('visible');
      closeAllPopovers();
      button.setAttribute('aria-expanded', String(opening));
      if (!opening) return;
      // Ready (loaded before the click, as it usually is): open now. Otherwise open on a turning ring
      // and fill it in when the picker and its styles are in.
      if (!picker) {
        showLoading(popover);
        place(button, popover);
        popover.classList.add('visible');
      }
      void prepare(popover).then((ready) => {
        if (button.getAttribute('aria-expanded') !== 'true') return;
        if (!ready) {
          popover.classList.remove('visible');
          popover.replaceChildren();
          button.setAttribute('aria-expanded', 'false');
          return;
        }
        place(button, popover);
        popover.classList.add('visible');
      });
    });
    // Clicks inside the picker must not reach the document handler that
    // closes every popover.
    popover.addEventListener('click', (event) => event.stopPropagation());
    return control;
  };

  // choose(value) sets the presentation design (as before); choose(kind,
  // value) sets either kind.
  const choose = async (kindOrValue, maybeValue) => {
    const conversation = getActiveConversation();
    if (!conversation) return;
    const kind = maybeValue === undefined ? 'deck' : kindOrValue;
    const value = maybeValue === undefined ? kindOrValue : maybeValue;
    if (!FIELDS[kind]) return;
    conversation[FIELDS[kind]] = kind === 'deck' ? normalizeDeckDesign(value) : normalizeDocumentChoice(value);
    render();
    try {
      await saveAppData();
    } catch (error) {
      logError('Saving the design choice failed:', error);
    }
  };

  // Choosing a mode keeps the picker open; the designs stay one click away.
  const chooseMode = async (value) => {
    const conversation = getActiveConversation();
    if (!conversation || (value !== 'standard' && value !== 'advanced')) return;
    conversation.fileMode = value;
    const state = getModeState();
    if (state) picker?.setMode?.(state);
    try {
      await saveAppData();
    } catch (error) {
      logError('Saving the mode failed:', error);
    }
  };

  // Draws the picker the first time (and again if the language changed), otherwise only brings the
  // choices and the mode up to date: redrawing every template each time it opened was the delay.
  async function prepare(popover) {
    try {
      const module = await load();
      const language = getUiLanguage();
      if (picker && pickerLanguage === language && popover.childElementCount > 0) {
        picker.setCurrent?.(currentChoices(getActiveConversation()));
        const mode = getModeState();
        if (mode) picker.setMode?.(mode);
        return true;
      }
      pickerLanguage = language;
      picker = module.renderDeckDesignPicker(popover, {
        document,
        window,
        language: getUiLanguage(),
        current: currentChoices(getActiveConversation()),
        mode: getModeState(),
        onMode: (value) => { void chooseMode(value); },
        onChoose: (kind, value) => {
          void choose(kind, value);
          popover.classList.remove('visible');
          document.getElementById('deck-design-btn')?.setAttribute('aria-expanded', 'false');
        }
      });
      return true;
    } catch (error) {
      logError('The design picker failed to load:', error);
      return false;
    }
  }

  function render() {
    const control = ensure();
    if (!control) return;
    const language = getUiLanguage();
    const conversation = getActiveConversation();
    const choices = currentChoices(conversation);
    const auto = getFileText(language, 'deckDesignAuto');
    const deckName = choices.deck === DECK_DESIGN_AUTO ? auto : getPresetText(choices.deck, language).name;
    const documentName = choices.document === DECK_DESIGN_AUTO ? auto : getDocumentPresetText(choices.document, language).name;
    const button = control.querySelector('#deck-design-btn');
    // The button always reads "Design"; the choices show in its tooltip
    // and in the picker.
    const cjk = /^(?:zh|ja|ko)/.test(language);
    control.querySelector('.deck-design-label').textContent = getFileText(language, 'design');
    const title = `${getFileText(language, 'design')}${cjk ? '：' : ': '}${getFileText(language, 'designTabDeck')} ${deckName}${cjk ? '・' : ' · '}${getFileText(language, 'designTabDocument')} ${documentName}`;
    button.title = title;
    button.setAttribute('aria-label', title);
    button.disabled = !conversation || Boolean(conversation.archived);
    button.classList.toggle('is-disabled', button.disabled);
    button.classList.toggle('is-adjustable', !button.disabled);
    picker?.setCurrent?.(choices);
  }

  return { render, choose, chooseMode };
}
