// The picker behind the composer's "Presentation design" button: AI adaptive
// design, or one of the 20 templates, each drawn as a sample cover slide in
// the UI language. Loaded when the picker is first opened.

import { normalizeDesign } from './design-params.js';
import { DESIGN_PRESET_IDS, getPresetText } from './design-presets.js';
import { parseDocumentSpec } from './document-spec.js';
import { getFileText } from '../file-texts.js';
import { layoutThumbnails } from '../generators/pptx-layout.js';
import { renderPresentationSlide } from '../previews/slide-preview.js';

const AUTO = 'auto';
// Drawn thumbnails, kept while the page is open: reopening is instant.
const THUMBNAILS = new Map();

function element(document, tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function sampleSpec(language) {
  const text = (key) => getFileText(language, key);
  const source = {
    language,
    title: text('deckSampleTitle'),
    slides: [{ layout: 'cover', kicker: text('deckSampleKicker'), title: text('deckSampleTitle'), subtitle: text('deckSampleSubtitle') }]
  };
  return parseDocumentSpec(JSON.stringify(source), { uiLanguage: language }).spec;
}

async function thumbnailFor(preset, language, context) {
  const key = `${language}:${preset}`;
  if (!THUMBNAILS.has(key)) {
    THUMBNAILS.set(key, (async () => {
      const presentation = await layoutThumbnails(sampleSpec(language), normalizeDesign({ preset }).design, { ...context, language });
      return renderPresentationSlide(context.document, presentation, 0);
    })().catch((error) => {
      THUMBNAILS.delete(key);
      throw error;
    }));
  }
  return (await THUMBNAILS.get(key)).cloneNode(true);
}

/**
 * Fills `container` with the picker. `onChoose(value)` receives "auto" or a
 * preset id. Returns { setCurrent(value) }.
 */
export function renderDeckDesignPicker(container, { document, window, language = 'zh-TW', current = AUTO, onChoose = () => {} }) {
  const text = (key) => getFileText(language, key);
  const options = [];

  const auto = element(document, 'button', 'deck-design-auto');
  auto.type = 'button';
  auto.dataset.deckDesign = AUTO;
  const autoCopy = element(document, 'span', 'deck-design-auto-copy');
  autoCopy.append(element(document, 'span', 'deck-design-auto-name', text('deckDesignAuto')), element(document, 'span', 'deck-design-auto-hint', text('deckDesignAutoHint')));
  auto.append(autoCopy, element(document, 'span', 'deck-design-check'));
  auto.addEventListener('click', () => onChoose(AUTO));
  options.push(auto);

  const grid = element(document, 'div', 'deck-design-grid');
  for (const preset of DESIGN_PRESET_IDS) {
    const presetText = getPresetText(preset, language);
    const button = element(document, 'button', 'deck-design-template');
    button.type = 'button';
    button.dataset.deckDesign = preset;
    button.title = `${presetText.name} — ${presetText.feature}`;
    const frame = element(document, 'span', 'deck-design-thumb');
    frame.setAttribute('aria-hidden', 'true');
    button.append(frame, element(document, 'span', 'deck-design-template-name', presetText.name));
    button.addEventListener('click', () => onChoose(preset));
    grid.appendChild(button);
    options.push(button);
  }

  container.replaceChildren(
    element(document, 'p', 'deck-design-title', text('deckDesign')),
    element(document, 'p', 'deck-design-intro', text('deckDesignIntro')),
    auto,
    element(document, 'p', 'deck-design-heading', text('deckDesignTemplates')),
    grid
  );

  const setCurrent = (value) => {
    options.forEach((option) => option.setAttribute('aria-pressed', String(option.dataset.deckDesign === value)));
  };
  setCurrent(current);

  // Thumbnails appear one by one; the list is usable at once.
  (async () => {
    for (const button of grid.children) {
      if (!container.isConnected) return;
      try {
        const svg = await thumbnailFor(button.dataset.deckDesign, language, { document, window });
        if (svg) button.querySelector('.deck-design-thumb').replaceChildren(svg);
      } catch {
        // The name alone still identifies the template.
      }
    }
  })();

  return { setCurrent };
}
