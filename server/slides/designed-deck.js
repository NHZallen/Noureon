// A deck from the design system (a ```file block of a .pptx with its spec), laid out on the server: the page's own layout, with the
// design's fonts made ready as static faces and measured through a canvas.

import { buildDesignTokens } from '../../src/app/ui/files/design/design-tokens.js';
import { familiesOf } from '../../src/app/ui/files/design/deck-font-faces.js';
import { createCanvasMeasurer } from '../../src/app/ui/files/design/text-layout.js';
import { layoutDeck } from '../../src/app/ui/files/generators/pptx-layout.js';

/**
 * Lays out a parsed spec (parseDocumentSpec(...).spec). `resolveImage(source)` gives the data of an image the deck names (or nothing: it
 * is drawn as a placeholder). Resolves { layout, fontAlias, measure, fonts }.
 */
export async function layoutDesignedDeck(spec, { kit, language = 'zh-TW', resolveImage } = {}) {
  const { createCanvas } = await import('@napi-rs/canvas');
  return layoutDeck(spec, {
    language,
    resolveImage,
    prepareFonts: async (design, deckLanguage, { eastAsian }) => {
      const tokens = buildDesignTokens(design, { language: deckLanguage });
      const faces = [];
      for (const [family, weights] of familiesOf(tokens, design, { eastAsian })) for (const weight of weights) faces.push([family, weight]);
      await kit.ensure(faces);
      return { measure: createCanvasMeasurer(createCanvas(10, 10).getContext('2d')), fontAlias: kit.alias, assets: null, tokens };
    }
  });
}
