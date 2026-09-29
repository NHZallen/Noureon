// Builds what the slide preview draws from a .pptx Python made: reads the
// file, loads the open-source fonts its text falls back on, and lays the
// slides out with a canvas measurer. Browser only; loaded on demand.

import { createCanvasMeasurer, createEstimatingMeasurer } from '../files/design/text-layout.js';
import { layoutFreePresentation } from './free-slide-layout.js';
import { readPresentation } from './pptx-reader.js';

export async function buildFreePresentation(blob, { JSZip, window = globalThis.window, document = globalThis.document } = {}) {
  const model = await readPresentation(blob, { JSZip, DOMParser: window?.DOMParser });
  const { fontAlias, registerFace } = await import('../files/generators/pptx-assets.js');
  // A first pass finds the fonts the text needs; the second measures with them.
  const estimate = layoutFreePresentation(model, { measure: createEstimatingMeasurer(), fontAlias });
  await Promise.all([...estimate.fonts].flatMap((family) => [400, 700].map((weight) => registerFace(family, weight, { document, window }))).filter(Boolean)).catch(() => {});
  const context = document?.createElement?.('canvas')?.getContext?.('2d');
  return layoutFreePresentation(model, { measure: context ? createCanvasMeasurer(context) : createEstimatingMeasurer(), fontAlias });
}
