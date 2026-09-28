// The picker behind the composer's "Design" button, in two tabs: designs for
// presentations (AI adaptive or one of the 20 templates, each drawn as a
// sample cover slide) and for Word documents (AI adaptive or one of the 9
// templates, each drawn as a sample first page), in the UI language. Loaded
// when the picker is first opened.

import { buildDesignTokens } from './design-tokens.js';
import { normalizeDesign } from './design-params.js';
import { DESIGN_PRESET_IDS, getPresetText } from './design-presets.js';
import { DOCUMENT_PRESETS, DOCUMENT_PRESET_IDS, getDocumentPresetText } from './document-presets.js';
import { renderDocumentThumbnail } from './document-thumbnail.js';
import { parseDocumentSpec } from './document-spec.js';
import { getFileText } from '../file-texts.js';
import { layoutThumbnails } from '../generators/pptx-layout.js';
import { renderPresentationSlide } from '../previews/slide-preview.js';

const AUTO = 'auto';
export const DESIGN_KINDS = Object.freeze(['deck', 'document']);
// Drawn thumbnails, kept while the page is open: reopening is instant.
const THUMBNAILS = new Map();
// The tab shown last, so reopening the picker returns to it.
let lastKind = 'deck';

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

const cached = (key, draw) => {
  if (!THUMBNAILS.has(key)) {
    THUMBNAILS.set(key, draw().catch((error) => {
      THUMBNAILS.delete(key);
      throw error;
    }));
  }
  return THUMBNAILS.get(key).then((svg) => svg.cloneNode(true));
};

function deckThumbnail(preset, language, context) {
  return cached(`deck:${language}:${preset}`, async () => {
    const presentation = await layoutThumbnails(sampleSpec(language), normalizeDesign({ preset }).design, { ...context, language });
    return renderPresentationSlide(context.document, presentation, 0);
  });
}

// Registers the template's Latin faces (the ones the thumbnail shows large);
// East Asian text uses the page's fonts, as in the slide thumbnails.
async function documentFonts(design, language, context) {
  if (typeof context.window?.FontFace !== 'function') return (family) => family;
  try {
    const assets = await import('../generators/pptx-assets.js');
    const tokens = buildDesignTokens(normalizeDesign({ fonts: design.fonts, headingWeight: design.headingWeight }).design, { language });
    await assets.registerDeckFonts(tokens, { document: context.document, window: context.window, eastAsian: false });
    return assets.fontAlias;
  } catch {
    return (family) => family;
  }
}

function documentThumbnail(preset, language, context) {
  return cached(`document:${language}:${preset}`, async () => {
    const design = DOCUMENT_PRESETS[preset].params;
    const text = (key) => getFileText(language, key);
    const fontAlias = await documentFonts(design, language, context);
    return renderDocumentThumbnail(context.document, design, {
      language,
      fontAlias,
      text: {
        title: text('deckSampleTitle'),
        subtitle: text('deckSampleSubtitle'),
        kicker: text('deckSampleKicker'),
        heading: text('documentSampleHeading'),
        author: 'Noureon'
      }
    });
  });
}

const KINDS = Object.freeze({
  deck: {
    tab: 'designTabDeck',
    intro: 'deckDesignIntro',
    autoHint: 'deckDesignAutoHint',
    presets: DESIGN_PRESET_IDS,
    presetText: getPresetText,
    thumbnail: deckThumbnail
  },
  document: {
    tab: 'designTabDocument',
    intro: 'documentDesignIntro',
    autoHint: 'documentDesignAutoHint',
    presets: DOCUMENT_PRESET_IDS,
    presetText: getDocumentPresetText,
    thumbnail: documentThumbnail
  }
});

/**
 * Fills `container` with the picker. `onChoose(kind, value)` receives
 * "deck" or "document" and "auto" or a template id; `current` holds the
 * choice per kind. Returns { setCurrent(current) }.
 */
export function renderDeckDesignPicker(container, { document, window, language = 'zh-TW', current = {}, onChoose = () => {} }) {
  const text = (key) => getFileText(language, key);
  let choices = { deck: AUTO, document: AUTO, ...current };
  let kind = DESIGN_KINDS.includes(lastKind) ? lastKind : 'deck';
  let options = [];

  const tabs = element(document, 'div', 'deck-design-tabs');
  tabs.setAttribute('role', 'tablist');
  const panel = element(document, 'div', 'deck-design-panel');
  panel.setAttribute('role', 'tabpanel');
  const tabButtons = DESIGN_KINDS.map((id) => {
    const tab = element(document, 'button', 'deck-design-tab', text(KINDS[id].tab));
    tab.type = 'button';
    tab.id = `deck-design-tab-${id}`;
    tab.dataset.designKind = id;
    tab.setAttribute('role', 'tab');
    tab.addEventListener('click', () => show(id));
    tab.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const next = DESIGN_KINDS[(DESIGN_KINDS.indexOf(id) + 1) % DESIGN_KINDS.length];
      show(next);
      tabButtons.find((button) => button.dataset.designKind === next)?.focus();
    });
    tabs.appendChild(tab);
    return tab;
  });

  const markCurrent = () => {
    options.forEach((option) => option.setAttribute('aria-pressed', String(option.dataset.deckDesign === choices[kind])));
  };

  function show(id) {
    kind = id;
    lastKind = id;
    const entry = KINDS[id];
    tabButtons.forEach((tab) => {
      const selected = tab.dataset.designKind === id;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    panel.setAttribute('aria-labelledby', `deck-design-tab-${id}`);
    panel.dataset.designKind = id;
    options = [];

    const auto = element(document, 'button', 'deck-design-auto');
    auto.type = 'button';
    auto.dataset.deckDesign = AUTO;
    const autoCopy = element(document, 'span', 'deck-design-auto-copy');
    autoCopy.append(element(document, 'span', 'deck-design-auto-name', text('deckDesignAuto')), element(document, 'span', 'deck-design-auto-hint', text(entry.autoHint)));
    auto.append(autoCopy, element(document, 'span', 'deck-design-check'));
    auto.addEventListener('click', () => onChoose(id, AUTO));
    options.push(auto);

    const grid = element(document, 'div', `deck-design-grid is-${id}`);
    for (const preset of entry.presets) {
      const presetText = entry.presetText(preset, language);
      const button = element(document, 'button', 'deck-design-template');
      button.type = 'button';
      button.dataset.deckDesign = preset;
      button.title = `${presetText.name} — ${presetText.feature}`;
      const frame = element(document, 'span', 'deck-design-thumb');
      frame.setAttribute('aria-hidden', 'true');
      button.append(frame, element(document, 'span', 'deck-design-template-name', presetText.name));
      button.addEventListener('click', () => onChoose(id, preset));
      grid.appendChild(button);
      options.push(button);
    }

    panel.replaceChildren(
      element(document, 'p', 'deck-design-intro', text(entry.intro)),
      auto,
      element(document, 'p', 'deck-design-heading', text('deckDesignTemplates')),
      grid
    );
    markCurrent();

    // Thumbnails appear one by one; the list is usable at once.
    (async () => {
      for (const button of grid.children) {
        if (!container.isConnected || kind !== id) return;
        try {
          const svg = await entry.thumbnail(button.dataset.deckDesign, language, { document, window });
          if (svg) button.querySelector('.deck-design-thumb').replaceChildren(svg);
        } catch {
          // The name alone still identifies the template.
        }
      }
    })();
  }

  container.replaceChildren(element(document, 'p', 'deck-design-title', text('design')), tabs, panel);
  show(kind);

  const setCurrent = (next) => {
    choices = { ...choices, ...next };
    markCurrent();
  };
  return { setCurrent, show };
}
