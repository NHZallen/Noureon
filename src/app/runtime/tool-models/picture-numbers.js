// Whether the pictures show their numbers: only while a text model may draw pictures (a picture model is chosen in the settings), as the attribute
// `data-picture-numbers` of <html> that src/styles/image-tool.css reads.

import { getImageToolModel } from './tool-models-state.js';

/** Shows or hides the numbers for the settings given; returns whether they are shown. */
export function syncPictureNumbers(root, config) {
  const on = Boolean(getImageToolModel(config));
  if (!root?.setAttribute) return on;
  if (on) {
    if (root.getAttribute('data-picture-numbers') !== 'on') root.setAttribute('data-picture-numbers', 'on');
  } else root.removeAttribute('data-picture-numbers');
  return on;
}
