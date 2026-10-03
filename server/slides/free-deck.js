// A .pptx that Python drew freely, read and laid out on the server (the same reader and layout as the page's: src/app/ui/sandbox/
// free-presentation.js), with the app's fonts measured through a canvas.

import { createCanvasMeasurer, createEstimatingMeasurer } from '../../src/app/ui/files/design/text-layout.js';
import { layoutFreePresentation } from '../../src/app/ui/sandbox/free-slide-layout.js';
import { readPresentation } from '../../src/app/ui/sandbox/pptx-reader.js';

/** Resolves { layout, fontAlias, measure, fonts } for the deck in `bytes`. Throws when the file is not a readable presentation. */
export async function buildFreePresentation(bytes, { kit }) {
  const [{ default: JSZip }, { DOMParser }, { createCanvas }] = await Promise.all([import('jszip'), import('@xmldom/xmldom'), import('@napi-rs/canvas')]);
  const model = await readPresentation(new Blob([bytes]), { JSZip, DOMParser });
  // A first pass finds the fonts the text falls back on; the second measures with them.
  const estimate = layoutFreePresentation(model, { measure: createEstimatingMeasurer(), fontAlias: kit.alias });
  await kit.ensure([...estimate.fonts].flatMap((family) => [[family, 400], [family, 700]]));
  const measure = createCanvasMeasurer(createCanvas(10, 10).getContext('2d'));
  return layoutFreePresentation(model, { measure, fontAlias: kit.alias });
}
