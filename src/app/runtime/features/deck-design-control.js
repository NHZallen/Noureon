// "Presentation design" in the composer: chosen before asking for a deck.
// "AI adaptive" (the default) lets the model set every design parameter for
// the content; a template makes it use that preset as is. The choice is
// kept on the conversation and sent with the file authoring guidance.
//
// The button sits next to the attachment button in both composer layouts;
// the picker (thumbnails of each template) loads when it is first opened.

import { DESIGN_PRESET_IDS, getPresetText } from '../../ui/files/design/design-presets.js';
import { getFileText } from '../../ui/files/file-texts.js';

export const DECK_DESIGN_AUTO = 'auto';

export const normalizeDeckDesign = (value) => (DESIGN_PRESET_IDS.includes(value) ? value : DECK_DESIGN_AUTO);

// Same chevron as the reasoning control, whose button styles this reuses.
const CHEVRON = '<svg class="deck-design-chevron" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 15 12 9 18 15"></polyline></svg>';

export function createDeckDesignControl({
  document,
  window = globalThis.window,
  getActiveConversation,
  saveAppData,
  getUiLanguage = () => 'zh-TW',
  closeAllPopovers = () => {},
  // The picker's stylesheet loads with it, keeping the startup CSS small.
  loadPicker = () => Promise.all([
    import('../../ui/files/design/deck-design-picker.js'),
    import('../../ui/files/design/deck-design-picker.css')
  ]).then(([module]) => module),
  logError = (...args) => console.error(...args)
}) {
  let picker = null;

  const ensure = () => {
    let control = document.getElementById('deck-design-control');
    if (control) return control;
    const container = document.getElementById('file-input-container');
    if (!container) return null;
    control = document.createElement('div');
    control.id = 'deck-design-control';
    control.className = 'relative';
    control.innerHTML = `
      <button type="button" id="deck-design-btn" class="reasoning-depth-btn is-adjustable deck-design-btn" style="max-width:12rem" aria-haspopup="dialog" aria-expanded="false">
        <span class="deck-design-label"></span>${CHEVRON}
      </button>
      <div id="deck-design-popover" class="popover deck-design-popover" role="dialog"></div>
    `;
    container.appendChild(control);
    const button = control.querySelector('#deck-design-btn');
    const popover = control.querySelector('#deck-design-popover');
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (button.disabled) return;
      const opening = !popover.classList.contains('visible');
      closeAllPopovers();
      button.setAttribute('aria-expanded', String(opening));
      if (!opening) return;
      // The popover's styles load with the picker, so it opens once both are in.
      void openPicker(popover).then((ready) => {
        if (ready && button.getAttribute('aria-expanded') === 'true') popover.classList.add('visible');
      });
    });
    // Clicks inside the picker must not reach the document handler that
    // closes every popover.
    popover.addEventListener('click', (event) => event.stopPropagation());
    return control;
  };

  const choose = async (value) => {
    const conversation = getActiveConversation();
    if (!conversation) return;
    conversation.deckDesign = normalizeDeckDesign(value);
    render();
    try {
      await saveAppData();
    } catch (error) {
      logError('Saving the presentation design failed:', error);
    }
  };

  async function openPicker(popover) {
    try {
      const module = await loadPicker();
      picker = module.renderDeckDesignPicker(popover, {
        document,
        window,
        language: getUiLanguage(),
        current: normalizeDeckDesign(getActiveConversation()?.deckDesign),
        onChoose: (value) => {
          void choose(value);
          popover.classList.remove('visible');
          document.getElementById('deck-design-btn')?.setAttribute('aria-expanded', 'false');
        }
      });
      return true;
    } catch (error) {
      logError('The presentation design picker failed to load:', error);
      return false;
    }
  }

  function render() {
    const control = ensure();
    if (!control) return;
    const language = getUiLanguage();
    const conversation = getActiveConversation();
    const value = normalizeDeckDesign(conversation?.deckDesign);
    const name = value === DECK_DESIGN_AUTO ? getFileText(language, 'deckDesignAuto') : getPresetText(value, language).name;
    const button = control.querySelector('#deck-design-btn');
    // The button always reads "Presentation design"; the choice shows in
    // its tooltip and in the picker.
    control.querySelector('.deck-design-label').textContent = getFileText(language, 'deckDesign');
    const title = `${getFileText(language, 'deckDesign')}${/^(?:zh|ja|ko)/.test(language) ? '：' : ': '}${name}`;
    button.title = title;
    button.setAttribute('aria-label', title);
    button.disabled = !conversation || Boolean(conversation.archived);
    button.classList.toggle('is-disabled', button.disabled);
    button.classList.toggle('is-adjustable', !button.disabled);
    picker?.setCurrent?.(value);
  }

  return { render, choose };
}
