// The rows of the step list for the pictures a text model looked at, was asked about and drew (data/picture-steps.js), the same whether the reply is under way
// (sandbox-ledger.js) or opened later (sandbox-run-view.js). A row of looking opens to what the model thought (the one line it gave as its reason; the model's own
// thinking is the row before it) and the pictures it saw, each with its number, its round and where it came from; the ones used are outlined and say so.

import { sandboxText } from '../../runtime/sandbox/sandbox-texts.js';
import { pictureNumbers, sameRef } from '../../../data/picture-steps.js';
import { setPictureNumber } from '../files/picture-number.js';

const dataUrl = (thumb) => (thumb?.data && /^image\/(png|jpeg|webp|gif)$/.test(thumb.mimeType || '') ? `data:${thumb.mimeType};base64,${thumb.data}` : '');

const listOf = (language, numbers) => {
  try {
    return new Intl.ListFormat(language, { style: 'long', type: 'conjunction' }).format(numbers.map(String));
  } catch {
    return numbers.join(', ');
  }
};

const make = (document, tag, className, content) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
};

/** A tiny picture with its number in the corner. */
export function pictureTile(document, picture, className = 'picture-tile') {
  const node = make(document, 'span', className);
  const src = dataUrl(picture.thumb);
  if (src) {
    const image = document.createElement('img');
    image.src = src;
    image.alt = '';
    node.append(image);
  } else {
    node.classList.add('has-no-picture');
  }
  setPictureNumber(document, node, picture.number);
  return node;
}

/** "Looked at picture 3 and 5". */
export const viewLabel = (language, step) => sandboxText(language, 'imageViewed', { list: listOf(language, pictureNumbers(step.shown)) });

/** "Drew a picture" / "Drew 2 pictures". */
export const drawLabel = (language, step) => sandboxText(language, step.count > 1 ? 'imageDrawnMany' : 'imageDrawn', { n: step.count });

/** The pictures a drawing was made from, as tiny pictures after the row's words. */
export function appendMiniRefs(document, label, references) {
  if (!label || !Array.isArray(references) || !references.length) return;
  label.querySelector?.(':scope > .image-mini-refs')?.remove();
  const refs = make(document, 'span', 'image-mini-refs');
  references.forEach((picture) => refs.append(pictureTile(document, picture, 'image-mini-ref')));
  label.append(refs);
}

/** The body of a row of looking: the model's reason, then the pictures it saw. */
export function viewBody(document, step, language) {
  const box = make(document, 'div', 'image-look');
  if (step.reason) box.append(make(document, 'p', 'image-look-think', step.reason));
  const strip = make(document, 'div', 'image-look-strip');
  for (const picture of step.shown) {
    const cell = make(document, 'button', 'image-look-cell');
    cell.type = 'button';
    cell.dataset.round = String(picture.round);
    cell.dataset.source = picture.source;
    cell.dataset.number = String(picture.number);
    cell.append(pictureTile(document, picture));
    cell.append(make(document, 'span', 'image-look-cap', sandboxText(language, 'imageRound', { round: picture.round })), make(document, 'span', 'image-look-who', sandboxText(language, picture.source === 'user' ? 'imageFromUser' : 'imageFromModel')));
    // A tap makes it larger (the tiny pictures are only a look).
    cell.addEventListener('click', () => cell.classList.toggle('is-zoomed'));
    strip.append(cell);
  }
  box.append(strip);
  markUsed(box, step.used || [], language);
  return box;
}

/** Outlines the pictures of `container` that were used, and says so under them. */
export function markUsed(container, used, language) {
  if (!container?.querySelectorAll || !used?.length) return;
  for (const cell of container.querySelectorAll('.image-look-cell')) {
    const ref = { round: Number(cell.dataset.round), source: cell.dataset.source, number: Number(cell.dataset.number) };
    if (!used.some((entry) => sameRef(entry, ref)) || cell.classList.contains('is-used')) continue;
    cell.classList.add('is-used');
    const who = cell.querySelector('.image-look-who');
    if (who) who.textContent = sandboxText(language, 'imageUsed');
  }
}

/** The finished row of a step, for the reply opened later: { kind, label, body, mini } for sandbox-run-view.js to draw. */
export function pictureStepRow(document, step, language) {
  if (step.kind === 'view') return { kind: 'image', label: viewLabel(language, step), body: [viewBody(document, step, language)], references: [] };
  if (step.kind === 'draw') return { kind: 'image', label: drawLabel(language, step), body: [], references: step.references };
  const body = make(document, 'div', 'image-look');
  return { kind: 'image', label: sandboxText(language, 'imagePicked', { number: step.picked.number }), body: [body], references: [step.picked], empty: true };
}
