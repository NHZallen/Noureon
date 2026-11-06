// Whether a drawing (SVG) can be changed from the editor: only a text model that looks at pictures can read the marks, so only while one is the model of the chat the cards of drawings have an Edit button (the attribute
// `data-model-vision` of <html>, read by src/styles/image-tool.css). A picture model makes its own pictures and is not asked to change a drawing.

import { modelSupportsVision } from '../shell/model-registry.js';

/** Sets or takes away the attribute for the model given; returns whether it is set. */
export function syncSvgEditGate(root, modelInfo) {
  const on = Boolean(modelInfo && modelInfo.outputModality !== 'image' && modelInfo.category !== 'image_generation' && modelSupportsVision(modelInfo));
  root?.toggleAttribute?.('data-model-vision', on);
  return on;
}
