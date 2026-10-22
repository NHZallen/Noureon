// The pictures of a conversation as a text model that draws by itself finds them (docs/superpowers/specs/2026-10-22-text-model-image-tool-design.md):
// the pictures the person sent and the ones that were drawn, each told by its round, its source and its number in its message.
//   - a round is one message of the person and the reply to it, counted from the start of the conversation (every round, with a picture or not);
//   - a picture's number is its place among the pictures of its message (the ones the person attached, or the ones the reply drew), from 1;
//   - the source is 'user' (attached by the person) or 'generated' (drawn).
// Nothing here is stored: it is worked out from the messages each time, so the numbers follow what the page shows, whatever was deleted or
// regenerated. Pure functions shared by the page and the server (no window, no document).

import { attachmentKind } from '../app/runtime/messages/attachment-labels.js';

export const PICTURE_SOURCES = Object.freeze(['user', 'generated']);

const PROMPT_CHARS = 200;

const oneLine = (text, limit) => {
  const value = String(text ?? '').replace(/\s+/g, ' ').trim();
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
};

const textOf = (parts) => (Array.isArray(parts) ? parts : []).map((part) => (typeof part?.text === 'string' ? part.text : '')).filter(Boolean).join(' ');

// A picture the person attached: an image with its data (or the cloud copy of it) and a name, as the labels of the attachments count them (attachment-labels.js).
const isAttachedPicture = (part) => Boolean(part?.inlineData?.data && attachmentKind(part.inlineData) === 'image' && String(part.inlineData.name || '').trim());
const isDrawnPicture = (part) => Boolean(part?.generatedImage?.id);

/**
 * The number each of the attachments of one message has as a picture (0 for one that is not): the pictures are counted in the order they are in, from 1.
 * `items` are attachments as the message keeps them ({ data, mimeType, name }). What the message shows on its pictures, what the box shows before the
 * message is sent and what the model is told are all counted here, so they are the same.
 */
export function attachedPictureNumbers(items = []) {
  let number = 0;
  return (Array.isArray(items) ? items : []).map((item) => (isAttachedPicture({ inlineData: item }) ? (number += 1) : 0));
}

/** The number each of the drawn pictures of one reply ({ id }) has, from 1 in their order (0 for one without an id). */
export function drawnPictureNumbers(items = []) {
  let number = 0;
  return (Array.isArray(items) ? items : []).map((item) => (isDrawnPicture({ generatedImage: item }) ? (number += 1) : 0));
}

/**
 * Every picture of the conversation, oldest first: [{ round, source, number, name?, mimeType, prompt?, part }]. `history` is the messages before this one
 * ({ role, parts }), `current` the parts of the message being answered (the person's, so it starts the newest round). A reply that came before any
 * message of the person belongs to the first round. `prompt` of a drawn picture is what it was asked with (kept with it, or else the person's message of its round).
 */
export function listPictures({ history = [], current = [] } = {}) {
  const pictures = [];
  let round = 0;
  let asked = '';
  const addMessage = (parts, source) => {
    let number = 0;
    for (const part of Array.isArray(parts) ? parts : []) {
      if (source === 'user' ? !isAttachedPicture(part) : !isDrawnPicture(part)) continue;
      number += 1;
      if (source === 'user') {
        pictures.push({ round, source, number, name: String(part.inlineData.name).trim(), mimeType: String(part.inlineData.mimeType || ''), part });
      } else {
        const drawn = part.generatedImage;
        const prompt = oneLine(drawn.prompt || asked, PROMPT_CHARS);
        pictures.push({ round, source, number, mimeType: String(drawn.mediaType || 'image/png'), ...(prompt ? { prompt } : {}), part });
      }
    }
  };
  for (const message of Array.isArray(history) ? history : []) {
    if (message?.role === 'user') {
      round += 1;
      asked = textOf(message.parts);
      addMessage(message.parts, 'user');
    } else if (message?.role === 'model') {
      round = Math.max(round, 1);
      addMessage(message.parts, 'generated');
    }
  }
  round += 1;
  addMessage(current, 'user');
  return pictures;
}

/** The round of the message being answered (the newest). */
export function currentRound(history = []) {
  let round = 0;
  for (const message of Array.isArray(history) ? history : []) round = message?.role === 'user' ? round + 1 : message?.role === 'model' ? Math.max(round, 1) : round;
  return round + 1;
}

/** One picture as the model names it in a call: `{ round, source, number }`. */
export const pictureRef = (picture) => ({ round: picture.round, source: picture.source, number: picture.number });

const sameRef = (picture, ref) => picture.round === ref.round && picture.source === ref.source && picture.number === ref.number;

/**
 * The pictures a list of references names, in the order they were given: { found: [picture], missing: [ref] }. A reference that is not well made
 * ({ round, source, number } with whole numbers and a known source) is missing; the same picture named twice is found once.
 */
export function resolvePictureRefs(pictures, refs) {
  const found = [];
  const missing = [];
  for (const ref of Array.isArray(refs) ? refs : []) {
    const valid = ref && Number.isInteger(ref.round) && ref.round >= 1 && Number.isInteger(ref.number) && ref.number >= 1 && PICTURE_SOURCES.includes(ref.source);
    const picture = valid ? pictures.find((entry) => sameRef(entry, ref)) : null;
    if (!picture) missing.push(ref);
    else if (!found.includes(picture)) found.push(picture);
  }
  return { found, missing };
}

/** Where the bytes of a picture are: { kind: 'base64', data, mimeType } for one the person attached, { kind: 'marker', marker, mimeType } for one kept in the cloud space, or null. */
export function pictureData(picture) {
  const part = picture?.part;
  if (part?.inlineData?.data) {
    const data = part.inlineData.data;
    if (typeof data === 'string') return { kind: 'base64', data, mimeType: picture.mimeType };
    if (data?.__astraCloudAsset?.path) return { kind: 'marker', marker: data, mimeType: picture.mimeType };
    return null;
  }
  const marker = part?.generatedImage?.cloudAsset;
  return marker?.__astraCloudAsset?.path ? { kind: 'marker', marker, mimeType: picture.mimeType } : null;
}

const INDEX_ROUNDS = 40;
const INDEX_PROMPT_CHARS = 100;
const quoted = (text) => `"${String(text).replace(/"/g, "'")}"`;

/**
 * The lines that tell a model which pictures the conversation holds, one for each round and source that has some:
 *   Round 2: the user sent picture 1 "kettle.png", picture 2 "cat.png"
 *   Round 3: you drew picture 1 (asked for: "a brown bear")
 * Only the newest INDEX_ROUNDS rounds that have pictures; older ones are counted. `currentRound` is the message being answered (marked "this message").
 * Plain English text for the model; the number of a picture is its place in its message, so it is what the person sees on the picture.
 */
export function pictureIndexLines(pictures, { currentRound: current = 0 } = {}) {
  const groups = [];
  for (const picture of Array.isArray(pictures) ? pictures : []) {
    const last = groups.at(-1);
    if (last && last.round === picture.round && last.source === picture.source) last.items.push(picture);
    else groups.push({ round: picture.round, source: picture.source, items: [picture] });
  }
  const rounds = [...new Set(groups.map((group) => group.round))];
  const kept = new Set(rounds.slice(-INDEX_ROUNDS));
  const lines = [];
  if (rounds.length > kept.size) lines.push(`(${rounds.length - kept.size} older rounds with pictures are not listed.)`);
  for (const group of groups) {
    if (!kept.has(group.round)) continue;
    const items = group.items.map((picture) => (picture.source === 'user'
      ? `picture ${picture.number} ${quoted(picture.name)}`
      : `picture ${picture.number}${picture.prompt ? ` (asked for: ${quoted(oneLine(picture.prompt, INDEX_PROMPT_CHARS))})` : ''}`));
    lines.push(`Round ${group.round}${group.round === current ? ' (this message)' : ''}: ${group.source === 'user' ? 'the user sent' : 'you drew'} ${items.join(', ')}`);
  }
  return lines;
}
