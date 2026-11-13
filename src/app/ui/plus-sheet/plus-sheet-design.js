// The design page of the "+" sheet: the design picker (the same one the desktop panel shows, with the thumbnails of the real templates)
// drawn inside the sheet. Choosing keeps the page open; the choice is kept on the conversation, as the panel does.

import { describeFileModeState } from '../../runtime/sandbox/file-mode.js';
import { browserSupportsSandbox } from '../../runtime/sandbox/sandbox-protocol.js';
import { modelSupportsToolCalling } from '../../runtime/shell/model-registry.js';
import { normalizeDeckDesign, normalizeDocumentChoice } from '../../runtime/features/deck-design-control.js';
import { element } from './plus-sheet-dom.js';

const FIELDS = Object.freeze({ deck: 'deckDesign', document: 'documentDesign' });
const choicesOf = (conversation) => ({ deck: normalizeDeckDesign(conversation?.deckDesign), document: normalizeDocumentChoice(conversation?.documentDesign) });

export async function buildDesignPage(context, page) {
  const { document, window, language } = context;
  const loading = element(document, 'div', 'ps-loading');
  loading.setAttribute('role', 'status');
  loading.setAttribute('aria-busy', 'true');
  page.append(loading);
  let module;
  try {
    [module] = await Promise.all([import('../files/design/deck-design-picker.js'), import('../files/design/deck-design-picker.css')]);
  } catch (error) {
    console.error('The design picker failed to load:', error);
    loading.remove();
    return;
  }
  if (!page.isConnected) return;
  const conversation = () => context.getActiveConversation?.();
  const modeState = () => describeFileModeState({
    window,
    conversation: conversation(),
    config: context.getConfig?.() || {},
    modelInfo: context.normalizeConversationModel?.(conversation()),
    supportsToolCalling: modelSupportsToolCalling,
    isCouncil: Boolean(context.isCouncilEnabled?.(conversation())),
    browserSupported: browserSupportsSandbox(window)
  });
  const container = element(document, 'div', 'ps-picker');
  loading.replaceWith(container);
  const picker = module.renderDeckDesignPicker(container, {
    document,
    window,
    language,
    current: choicesOf(conversation()),
    mode: modeState(),
    onChoose: async (kind, value) => {
      const active = conversation();
      if (!active || !FIELDS[kind]) return;
      active[FIELDS[kind]] = kind === 'deck' ? normalizeDeckDesign(value) : normalizeDocumentChoice(value);
      picker.setCurrent(choicesOf(active));
      context.refresh?.();
      try {
        await context.saveAppData?.();
      } catch (error) {
        console.error('Saving the design choice failed:', error);
      }
    }
  });
}
