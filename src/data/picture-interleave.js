// A reply of a text model that drew pictures by itself reads "words, picture, words": the pictures stand where the model drew them. The parts of such a
// message are the same in that order ([text, generatedImage, text, ...]). The server works the order out from where the answer stood when each picture was kept
// (`interleaveParts`), and the page, which gets the words and the pictures apart, puts them back from the places the server's parts had (`pictureOffsets`,
// `placePictures`). The first text part keeps the run record that stands above the answer. Pure functions, shared with the server
// (scripts/server-shared-modules.json).

import { liftSandboxRunBlock } from '../app/ui/sandbox/sandbox-run-block.js';

const clamp = (value, max) => Math.max(0, Math.min(max, Math.round(Number(value) || 0)));

/**
 * `text` is the whole text of the message (the run record, then the answer), `pictures` the picture parts in the order they were drawn and `offsets` where in
 * the ANSWER each stood (a number of characters from its start). Returns the parts in order; the words before the first picture keep the record above them.
 * Words between two pictures are a part of their own; an empty one is left out.
 */
export function placePictures(text, pictures, offsets) {
  const whole = String(text ?? '');
  if (!pictures?.length) return [{ text: whole }];
  const lifted = liftSandboxRunBlock(whole);
  const prefix = whole.slice(0, whole.length - lifted.text.length);
  const answer = lifted.text;
  const marks = pictures.map((_, index) => clamp(offsets?.[index] ?? answer.length, answer.length));
  // Pictures keep the order they were drawn in, whatever the numbers say.
  for (let index = 1; index < marks.length; index += 1) marks[index] = Math.max(marks[index], marks[index - 1]);
  const parts = [];
  let from = 0;
  pictures.forEach((picture, index) => {
    const words = answer.slice(from, marks[index]);
    if (index === 0) parts.push({ text: `${prefix}${words}` });
    else if (words) parts.push({ text: words });
    parts.push(picture);
    from = marks[index];
  });
  const rest = answer.slice(from);
  if (rest) parts.push({ text: rest });
  return parts;
}

/**
 * For the parts of a finished message that stand in order, where in the answer each picture stood: [number], and the text and the pictures apart.
 * Returns { text, pictures, offsets }: `text` is the joined text (record and answer), `offsets` are relative to the answer (the record is not counted).
 */
export function pictureOffsets(parts) {
  let text = '';
  const marks = [];
  const pictures = [];
  for (const part of Array.isArray(parts) ? parts : []) {
    if (typeof part?.text === 'string') text += part.text;
    else if (part?.generatedImage) {
      pictures.push(part);
      marks.push(text.length);
    }
  }
  const prefixLength = text.length - liftSandboxRunBlock(text).text.length;
  return { text, pictures, offsets: marks.map((mark) => Math.max(0, mark - prefixLength)) };
}
