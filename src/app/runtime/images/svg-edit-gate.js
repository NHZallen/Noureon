// Whether a drawing (SVG) can be changed from the editor: the marks are read by a model that looks at pictures. A text model that looks at pictures reads them itself; a picture model that makes SVGs (GPT Image 2.6)
// has them read and written by GPT-6 Luna (svg-writer.js), which looks at pictures. So the cards of drawings have an Edit button while the model of the chat is one of those two (the attribute `data-model-vision`
// of <html>, read by src/styles/image-tool.css); any other model hides it.

import { modelSupportsVision } from '../shell/model-registry.js';
import { supportedFormatsOf } from './image-formats.js';

/** Sets or takes away the attribute for the model given; returns whether it is set. */
export function syncSvgEditGate(root, modelInfo) {
  const pictureMaker = Boolean(modelInfo && (modelInfo.outputModality === 'image' || modelInfo.category === 'image_generation'));
  const on = Boolean(modelInfo && (pictureMaker ? supportedFormatsOf(modelInfo).includes('svg') : modelSupportsVision(modelInfo)));
  root?.toggleAttribute?.('data-model-vision', on);
  return on;
}
