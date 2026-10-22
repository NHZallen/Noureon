// The tool a text model has to draw pictures by itself (docs/superpowers/specs/2026-10-22-text-model-image-tool-design.md). It is a loader of the kind the
// skills and the connectors are (src/data/skill-tool.js, server/mcp/tool-loader.js): the loops of a reply see its tools, hand it each call, and give the
// model what it returns. `generate_image` asks the picture model the person chose for one or more pictures, from a prompt the model wrote and the
// pictures it named as references (a round, a source and a number each: src/data/conversation-pictures.js), after the person allowed it (when they have not
// allowed it for good). The pictures are kept in the person's cloud space and become parts of the reply's message.

import { drawPictures } from './image-run.js';
import { createImageAsk } from './image-ask.js';
import { randomUUID } from 'node:crypto';

import { currentRound, listPictures, pictureCaption, pictureData, pictureIndexLines, pictureRef, resolvePictureRefs, selectPictures } from '../src/data/conversation-pictures.js';
import { IMAGE_ASPECT_RATIOS, resolveSupportedAspectRatio, resolveSupportedResolution } from '../src/app/runtime/images/image-generation-config.js';
import { makeThumbnail } from './picture-thumb.js';
import { sandboxText } from '../src/app/runtime/sandbox/sandbox-texts.js';

/** Pictures asked for in one reply (each call may make several). */
export const MAX_IMAGE_CALLS = 4;
const MAX_REFERENCES = 16;
const PROMPT_CHARS = 4000;
/** Pictures shown to the model in one look, and looks in one reply (more is asked of the person instead). */
export const MAX_VIEW_PICTURES = 12;
export const MAX_VIEW_CALLS = 5;
/** Questions "which one is it?" in one reply, the candidates in one, and the size of the small pictures on the card. */
export const MAX_PICK_ASKS = 6;
export const MAX_PICK_CANDIDATES = 12;
const CARD_SIDE = 192;
const CARD_QUALITY = 55;
const CARD_MAX_CHARS = 30_000;
/** The tiny pictures of the step list (and of the record kept with the reply): small, since a reply may keep many. */
const STRIP_SIDE = 120;
const STRIP_QUALITY = 50;
const STRIP_MAX_CHARS = 8_000;
/** Tiny pictures the record keeps in all: past it the record keeps the numbers only. */
const RECORD_THUMBS = 40;
const CACHE_PICTURE_BYTES = 6 * 1024 * 1024;
const CACHE_TOTAL_BYTES = 36 * 1024 * 1024;

const REFERENCE_ITEM = Object.freeze({
  type: 'object',
  properties: {
    round: { type: 'integer', description: 'The round of the conversation the picture is in.' },
    source: { type: 'string', enum: ['user', 'generated'], description: '"user" for a picture the user sent, "generated" for one you drew.' },
    number: { type: 'integer', description: 'The picture\'s number in its message (from 1).' }
  },
  required: ['round', 'source', 'number']
});
const FILTER = Object.freeze({
  type: 'object',
  description: 'Pictures by their kind instead of one by one. Every part is optional and they combine. A `number` matches that number in every round.',
  properties: {
    source: { type: 'string', enum: ['user', 'generated'] },
    number: { type: 'integer', description: 'The number in the message: 3 matches every round\'s picture 3.' },
    from_round: { type: 'integer' },
    to_round: { type: 'integer' }
  }
});

export const VIEW_IMAGES_TOOL = Object.freeze({
  name: 'view_images',
  description: `Look at pictures of this conversation (the ones the user sent and the ones you drew) to find out which one they mean, or what it shows. Name them in \`references\`, or select them with \`filter\`. You are shown up to ${MAX_VIEW_PICTURES} pictures each time, the newest first when more match, each with a line telling its round, source and number; look again with a narrower filter to see others. If you cannot tell which picture the user means, ask them.`,
  parameters: Object.freeze({
    type: 'object',
    properties: {
      references: { type: 'array', maxItems: MAX_VIEW_PICTURES, items: REFERENCE_ITEM, description: 'Pictures to look at, one by one.' },
      filter: FILTER,
      reason: { type: 'string', maxLength: 300, description: 'One short sentence for the user: what you are looking for, and your thought about which picture it may be.' }
    },
    required: ['reason']
  })
});

export const CHOOSE_IMAGE_TOOL = Object.freeze({
  name: 'choose_image',
  description: 'Ask the user which picture they mean, when you are not sure (for example two pictures both fit what they said). The user sees the candidates and taps the right one. Ask one thing at a time. Do not ask when you are very sure, and do not ask about a picture attached to this message that the user called "this one".',
  parameters: Object.freeze({
    type: 'object',
    properties: {
      title: { type: 'string', maxLength: 120, description: 'The question the user reads, in their language, short and friendly, in your own words (for example "Which one is the blue living room?"), not a copy of what they wrote.' },
      candidates: { type: 'array', minItems: 1, maxItems: MAX_PICK_CANDIDATES, items: REFERENCE_ITEM, description: 'The pictures to choose from, the likeliest first.' },
      step: { type: 'integer', description: 'When you ask about several things in a row ("this bear with the cat"), which one this is (from 1).' },
      of: { type: 'integer', description: 'How many things you will ask about in all.' },
      reason: { type: 'string', maxLength: 300, description: 'One short sentence: why you are not sure.' }
    },
    required: ['title', 'candidates']
  })
});

export const LIST_IMAGES_TOOL = Object.freeze({
  name: 'list_images',
  description: 'The full list of the pictures of this conversation as text (round, source, number, name or prompt), without the pictures themselves. Use it when the list you were given is cut short.',
  parameters: Object.freeze({ type: 'object', properties: { filter: FILTER } })
});

export const GENERATE_IMAGE_TOOL = Object.freeze({
  name: 'generate_image',
  description: 'Draw one or more pictures for the user with the picture model they chose, from a prompt you write. The pictures are shown to the user in your message. To change, redo or combine existing pictures, name them in `references`; leave it out for a new picture.',
  parameters: Object.freeze({
    type: 'object',
    properties: {
      prompt: { type: 'string', maxLength: PROMPT_CHARS, description: 'The whole description of the picture: what it shows, the style, the colours, the light. When you edit or combine pictures, say what to keep and what to change, and refer to the reference pictures by their order in `references` (the first, the second, …).' },
      references: {
        type: 'array',
        maxItems: MAX_REFERENCES,
        description: 'The pictures to start from, in the order the picture model should read them. Each is named by the round, the source and the number it has in the list of pictures.',
        items: REFERENCE_ITEM
      },
      count: { type: 'integer', description: 'How many pictures to draw (1 unless the user asks for several).' },
      aspect_ratio: { type: 'string', description: 'The shape, like "1:1", "16:9" or "9:16". Leave it out to keep the shape of the first reference, or 1:1.' },
      reason: { type: 'string', maxLength: 300, description: 'One short sentence for the user: why you draw it this way and which pictures you use.' }
    },
    required: ['prompt']
  })
});

const oneLine = (text, limit) => {
  const value = String(text ?? '').replace(/\s+/g, ' ').trim();
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
};

const toDataUrl = (bytes, mimeType) => `data:${mimeType || 'image/png'};base64,${Buffer.from(bytes).toString('base64')}`;

const wholeNumber = (value) => (typeof value === 'number' ? value : typeof value === 'string' && /^\d{1,6}$/.test(value.trim()) ? Number(value) : NaN);

/** What the model gave as a reference, as { round, source, number } with real numbers (a number written as text is read; anything else stays as it is and is not found). */
export const readReference = (value) => (value && typeof value === 'object' && !Array.isArray(value)
  ? { round: wholeNumber(value.round), source: typeof value.source === 'string' ? value.source.trim().toLowerCase() : '', number: wholeNumber(value.number) }
  : null);

const refName = (ref) => (ref ? `round ${ref.round}, ${ref.source === 'user' ? 'sent by the user' : 'drawn by you'}, picture ${ref.number}` : '(not a picture)');

/**
 * `spec` is the reply's validated spec (its history, its message and `tools.imageGeneration`), `secrets.imageKey` the key of the picture model, `files` the
 * person's cloud store. `emit(event)` tells the pages what the steps are doing ({ type: 'image', event: 'ask' | 'answer' | 'done' | 'failed', ... }),
 * `onPictures(parts)` is given the `generatedImage` parts as soon as they are kept. `onWaited(ms)` is told how long the reply waited for the person.
 * Returns the loader and `answer(askId, value)` for the person's answers.
 */
export function createImageToolLoader({ spec, secrets, userId, files, signal = null, fetchImpl = fetch, language = 'zh-TW', emit = () => {}, onPictures = () => {}, onWaited = () => {}, now = Date.now, waitMs, maxCalls = MAX_IMAGE_CALLS, wait }) {
  const { model, permission } = spec.tools.imageGeneration;
  const info = model.info || {};
  const modelName = String(info.name || model.id);
  const pictures = listPictures({ history: spec.request.history, current: spec.request.currentMessage.parts });
  const round = currentRound(spec.request.history);
  const asker = createImageAsk({ emit, signal, ...(waitMs ? { waitMs } : {}), now, onWaited });
  let allowed = permission === 'always';
  let calls = 0;
  let drawn = 0;
  let looks = 0;
  let pickAsks = 0;
  let retries = 0;
  // What the person refused (pictures they said were not the one), and what they said while the reply was busy: the model is told with its next answer.
  const rejected = new Set();
  const notices = [];
  // The questions that were answered with a picture ({ title, picture }): a person may change the pick while the reply goes on.
  const picks = new Map();
  let drawing = null;
  // The drawing the model has asked for and the person has not yet seen the end of: its id (the page names it when the person says "not this one"), the pictures it starts from and the question it waits on.
  let activeDraw = null;
  const drawIds = new WeakMap();
  const keyOf = (picture) => `${picture.round}/${picture.source}/${picture.number}`;
  const cardPictures = new Map();
  const stripPictures = new Map();
  // What the person's step list shows of the pictures looked at, chosen and drawn, kept with the reply so that a page that opens it later draws the same.
  const steps = [];

  const lines = pictureIndexLines(pictures, { currentRound: round });
  const instruction = [
    `You can draw pictures for the user with the tool generate_image, using the picture model "${modelName}" that the user chose in the settings. Call it when the user asks for a picture, or asks you to change, redo or combine pictures; do not draw unasked.`,
    'Write the prompt yourself, in full. To change or combine pictures, name them in `references` and say in the prompt what to keep and what to change, referring to them by their order in `references`. Leave `references` out for a new picture.',
    `The message you are answering is round ${round}. A picture is named by its round, its source ("user": the user sent it; "generated": you drew it) and its number in its message, which is the number the user sees on the picture. The pictures of this conversation:`,
    lines.length ? lines.join('\n') : '(none yet)',
    'A picture the user attached to the message you are answering has a label in front of it ("Image 2 of 3 in this message: …"): the first number is its number, the one the user sees on it.',
    'The user may say "this one" (a picture of this message), "the one before", or give a number; read what they mean and pick the picture. If it is not clear which picture they mean, ask them in your reply instead of guessing.',
    `When you are very sure which picture the user means, use it without asking. When you are not sure, ask with choose_image (a title of your own words; one thing at a time, with step and of when there are several); the user taps the right one and you get the answer, or "none of these" and you look again (once) or ask them to describe it. A picture the user attached to this message and called "this one" needs no question.`,
    `To find out which picture the user means, look at pictures with view_images (up to ${MAX_VIEW_PICTURES} each time, ${MAX_VIEW_CALLS} times in a reply): name some, or select by kind (for example every picture 3). A picture number alone does not say which round: "picture 3" may be any round\'s, so look at all of them and pick by what they show. list_images gives the full list when the one above is cut short. Do not guess: when you cannot tell, ask the user which one.`,
    'The user may be asked to allow each picture first. The pictures appear in your message by themselves once drawn: do not describe a link, and say briefly what you did.'
  ].join('\n');

  async function loadReferences(found) {
    const urls = [];
    for (const picture of found) {
      const loaded = await loadBytes(picture);
      if (loaded.stopped) return { stopped: true };
      if (loaded.reason === 'gone') return { error: `The picture (${refName(pictureRef(picture))}) is not available any more: it was never kept in the user's cloud space. Tell the user, and go on without it only if they agree.` };
      if (loaded.reason === 'foreign') return { error: `The picture (${refName(pictureRef(picture))}) cannot be read.` };
      if (loaded.missing) return { error: `The picture (${refName(pictureRef(picture))}) could not be read now. Tell the user briefly.` };
      urls.push(toDataUrl(loaded.bytes, loaded.mimeType));
    }
    return { urls };
  }

  // The bytes of the pictures read so far (a picture is looked at, shown on a card and used to draw): kept while they are few and small.
  const byteCache = new Map();
  let cachedBytes = 0;
  /** The bytes of a picture of the conversation: { bytes, mimeType }, { stopped: true } or { missing: true, reason }. */
  async function loadBytes(picture) {
    const key = keyOf(picture);
    if (byteCache.has(key)) return byteCache.get(key);
    const data = pictureData(picture);
    if (!data) return { missing: true, reason: 'gone' };
    let loaded;
    if (data.kind === 'base64') {
      loaded = { bytes: Buffer.from(data.data, 'base64'), mimeType: data.mimeType || 'image/png' };
    } else if (!String(data.marker.__astraCloudAsset.path).startsWith(`${userId}/`)) {
      return { missing: true, reason: 'foreign' };
    } else {
      try {
        loaded = { bytes: await files.load({ userId, marker: data.marker }), mimeType: data.mimeType || 'image/png' };
      } catch {
        return signal?.aborted ? { stopped: true } : { missing: true, reason: 'unreadable' };
      }
    }
    if (loaded.bytes.byteLength <= CACHE_PICTURE_BYTES && cachedBytes + loaded.bytes.byteLength <= CACHE_TOTAL_BYTES) {
      byteCache.set(key, loaded);
      cachedBytes += loaded.bytes.byteLength;
    }
    return loaded;
  }

  const readFilter = (value) => (value && typeof value === 'object' && !Array.isArray(value)
    ? { source: typeof value.source === 'string' ? value.source.trim().toLowerCase() : '', number: wholeNumber(value.number), fromRound: wholeNumber(value.from_round), toRound: wholeNumber(value.to_round) }
    : null);

  const numbersText = (found) => {
    const numbers = [...new Set(found.map((picture) => picture.number))].sort((a, b) => a - b);
    try {
      return new Intl.ListFormat(language, { style: 'long', type: 'conjunction' }).format(numbers.map(String));
    } catch {
      return numbers.join(', ');
    }
  };

  async function view(call) {
    const args = call?.args && typeof call.args === 'object' ? call.args : {};
    if (looks >= MAX_VIEW_CALLS) return `You have looked at pictures ${MAX_VIEW_CALLS} times in this reply, which is the limit. Do not look again: tell the user you have not found the picture yet, and ask them to describe it (what it shows, which message it was in).`;
    const asked = Array.isArray(args.references) ? args.references : [];
    let chosen;
    if (asked.length) {
      if (asked.length > MAX_VIEW_PICTURES) return `Name at most ${MAX_VIEW_PICTURES} pictures at a time, or select them with \`filter\`.`;
      const { found, missing } = resolvePictureRefs(pictures, asked.map(readReference));
      if (missing.length) return `These pictures do not exist: ${missing.map((ref) => refName(readReference(ref))).join('; ')}. The pictures of this conversation:\n${lines.join('\n') || '(none)'}`;
      chosen = found;
    } else {
      const filter = readFilter(args.filter);
      if (!filter) return 'Name the pictures in `references`, or select them with `filter`.';
      chosen = selectPictures(pictures, filter);
    }
    if (!chosen.length) {
      emit({ type: 'image', event: 'done', kind: 'view', count: 0, pictures: [], reason: oneLine(args.reason, 300), label: sandboxText(language, 'imageViewedNone') });
      return `No picture matches. The pictures of this conversation:\n${lines.join('\n') || '(none)'}`;
    }
    looks += 1;
    // More than fit: the newest ones, and the model is told it can look for the others with a narrower filter.
    const given = chosen.length > MAX_VIEW_PICTURES ? chosen.slice(-MAX_VIEW_PICTURES) : chosen;
    const images = [];
    const shown = [];
    const gone = [];
    for (const picture of given) {
      const loaded = await loadBytes(picture);
      if (loaded.stopped || signal?.aborted) return 'The reply was stopped.';
      const thumb = loaded.missing ? null : await makeThumbnail(loaded.bytes, loaded.mimeType);
      if (!thumb) {
        gone.push(picture);
        continue;
      }
      images.push({ ...thumb, label: pictureCaption(picture) });
      shown.push(picture);
    }
    const strips = [];
    for (const picture of shown) strips.push(await withStrip(picture));
    const step = { kind: 'view', reason: oneLine(args.reason, 300), shown: strips, used: [] };
    steps.push(step);
    emit({ type: 'image', event: 'done', kind: 'view', count: shown.length, pictures: shown.map(pictureRef), shown: strips, reason: oneLine(args.reason, 300), label: shown.length ? sandboxText(language, 'imageViewed', { list: numbersText(shown) }) : sandboxText(language, 'imageViewedNone') });
    const notes = [
      chosen.length > given.length ? `${chosen.length} pictures match; you are shown the newest ${given.length}. Look again with a narrower filter (a round range, one source) to see the others.` : `${shown.length} picture(s) follow.`,
      gone.length ? `Not available to show (${gone.map((picture) => refName(pictureRef(picture))).join('; ')}).` : ''
    ].filter(Boolean).join(' ');
    return images.length ? { content: `${notes} Each picture has a line before it with its round, source and number.`, images } : `${notes} None of them could be shown.`;
  }

  function listAll(call) {
    const filter = readFilter(call?.args?.filter);
    const chosen = filter ? selectPictures(pictures, filter) : pictures;
    const text = pictureIndexLines(chosen, { currentRound: round, rounds: Infinity });
    return text.length ? `The pictures of this conversation:\n${text.join('\n')}` : 'No picture matches.';
  }

  /** The small picture of a candidate for the card: { mimeType, data }, or null (the card then shows its number). */
  async function cardPicture(picture) {
    const key = keyOf(picture);
    if (!cardPictures.has(key)) {
      const loaded = await loadBytes(picture);
      const thumb = loaded.bytes ? await makeThumbnail(loaded.bytes, loaded.mimeType, { side: CARD_SIDE, quality: CARD_QUALITY }) : null;
      cardPictures.set(key, thumb && thumb.data.length <= CARD_MAX_CHARS ? thumb : null);
    }
    return cardPictures.get(key);
  }

  /** The tiny picture of a picture for the step list: { mimeType, data } or null. */
  async function stripPicture(picture) {
    const key = keyOf(picture);
    if (!stripPictures.has(key)) {
      const loaded = await loadBytes(picture);
      const thumb = loaded.bytes ? await makeThumbnail(loaded.bytes, loaded.mimeType, { side: STRIP_SIDE, quality: STRIP_QUALITY }) : null;
      stripPictures.set(key, thumb && thumb.data.length <= STRIP_MAX_CHARS ? thumb : null);
    }
    return stripPictures.get(key);
  }
  const withStrip = async (picture) => ({ ...pictureRef(picture), thumb: await stripPicture(picture) });
  /** The pictures the model used (drawn from, or chosen by the person): the looks before it mark them. */
  const markUsed = (used) => {
    for (const step of steps) {
      if (step.kind !== 'view') continue;
      step.used = step.shown.filter((entry) => used.some((ref) => ref.round === entry.round && ref.source === entry.source && ref.number === entry.number)).map((entry) => pictureRef(entry));
    }
  };

  async function choose(call) {
    const args = call?.args && typeof call.args === 'object' ? call.args : {};
    const title = oneLine(args.title, 120);
    if (!title) return 'The call had no "title" (the question for the user).';
    if (pickAsks >= MAX_PICK_ASKS) return `You have asked ${MAX_PICK_ASKS} questions about pictures in this reply, which is the limit. Do not ask again: say what is unclear and let the user answer in their next message.`;
    const asked = Array.isArray(args.candidates) ? args.candidates : [];
    const { found, missing } = resolvePictureRefs(pictures, asked.slice(0, MAX_PICK_CANDIDATES + 1).map(readReference));
    if (asked.length > MAX_PICK_CANDIDATES) return `Give at most ${MAX_PICK_CANDIDATES} candidates.`;
    if (missing.length) return `These pictures do not exist: ${missing.map((ref) => refName(readReference(ref))).join('; ')}. The pictures of this conversation:\n${lines.join('\n') || '(none)'}`;
    const candidates = found.filter((picture) => !rejected.has(keyOf(picture)));
    if (!candidates.length) return 'The user already said that none of these is the one. Do not ask about them again: ask the user, in your reply, to describe the picture they mean.';
    pickAsks += 1;
    const cards = [];
    for (const picture of candidates) {
      cards.push({ ...pictureRef(picture), caption: pictureCaption(picture), thumb: await cardPicture(picture) });
      if (signal?.aborted) return 'The reply was stopped.';
    }
    const step = Number.isInteger(args.step) && args.step >= 1 ? args.step : 0;
    const of = Number.isInteger(args.of) && args.of >= step && args.of >= 2 ? args.of : 0;
    let askId = '';
    const answer = await asker.ask('pick', { title, ...(step && of ? { step, of } : {}), candidates: cards }, (value) => value === 'retry' || (/^pick:\d{1,2}$/.test(value) && Number(value.slice(5)) < cards.length), (id) => { askId = id; });
    if (signal?.aborted) return 'The reply was stopped.';
    if (answer === 'retry') {
      candidates.forEach((picture) => rejected.add(keyOf(picture)));
      retries += 1;
      return retries === 1
        ? `The user says none of these is the picture. Look again for other pictures (view_images with another filter), leaving these out, and ask again with choose_image. If you find nothing better, ask the user to describe it.`
        : 'The user says none of these is the picture, for the second time. Do not look again: ask the user in your reply to describe the picture they mean (what it shows, which message it was in).';
    }
    if (answer.startsWith('pick:')) {
      const picture = candidates[Number(answer.slice(5))];
      picks.set(askId, { title, picture });
      steps.push({ kind: 'pick', title, picked: await withStrip(picture) });
      markUsed([pictureRef(picture)]);
      return `The user chose ${refName(pictureRef(picture))}. Use it.`;
    }
    return answer === 'timeout'
      ? 'The user did not answer in time. Go on without the picture, or say that you need to know which one, in your reply.'
      : 'The question was not answered. Go on without it.';
  }

  /** The person said "not this one" while a picture was drawn: the drawing is over, the row says so, the model learns it with the notice. */
  function stoppedByPerson() {
    drawing = null;
    activeDraw = null;
    emit({ type: 'image', event: 'stopped', label: sandboxText(language, 'imageStopped') });
    return 'The user stopped this drawing: they said a picture you used is not the one. No picture was made.';
  }

  /** "Not this one" on a picture a drawing starts from: while the question waits it is the answer; while it is drawn the drawing stops. */
  function notThisReference(drawId, index) {
    if (!activeDraw || activeDraw.id !== drawId || !(index >= 0 && index < activeDraw.found.length)) return { answered: false };
    if (activeDraw.askId && asker.answer(activeDraw.askId, `not:${index}`).answered) return { answered: true };
    if (!drawing) return { answered: false };
    const picture = activeDraw.found[index];
    rejected.add(keyOf(picture));
    notices.push(`The user pressed "not this one" on ${refName(pictureRef(picture))}, a picture you were drawing from, so the drawing was stopped. Do not use it: ask which one they mean with choose_image (other candidates), then draw again.`);
    drawing.abort();
    return { answered: true };
  }

  /** The person changes a pick or refuses a picture the model used ("改", "不是"): the picture is not used again, a drawing under way stops, and the model is told. */
  function redo(askId) {
    const entry = picks.get(askId);
    if (!entry) return { answered: false };
    picks.delete(askId);
    rejected.add(keyOf(entry.picture));
    notices.push(`The user pressed "not this one" on ${refName(pictureRef(entry.picture))}, the picture you used for "${entry.title}". Do not use it again: ask which one they mean with choose_image (without that picture, or with other candidates), and if you were drawing, draw again after they chose.`);
    drawing?.abort();
    return { answered: true };
  }

  async function generate(call) {
    const args = call?.args && typeof call.args === 'object' ? call.args : {};
    const prompt = typeof args.prompt === 'string' ? args.prompt.trim() : '';
    if (!prompt) return 'The call had no "prompt".';
    if (calls >= maxCalls) return `The limit of ${maxCalls} picture requests per reply is reached. Go on with what you have and say so briefly.`;

    const asked = Array.isArray(args.references) ? args.references.slice(0, MAX_REFERENCES + 1) : [];
    if (asked.length > MAX_REFERENCES) return `At most ${MAX_REFERENCES} reference pictures may be named.`;
    const { found, missing } = resolvePictureRefs(pictures, asked.map(readReference));
    if (missing.length) return `These pictures do not exist: ${missing.map((ref) => refName(readReference(ref))).join('; ')}. The pictures of this conversation:\n${lines.join('\n') || '(none)'}`;
    const minReferences = Number(info.minImageReferences) || 0;
    const maxReferences = Number(info.maxImageReferences) || 0;
    if (found.length < minReferences) return `${modelName} edits pictures: it needs at least ${minReferences} reference picture(s). Name the picture(s) to start from in \`references\`, or tell the user there is none.`;
    if (maxReferences && found.length > maxReferences) return `${modelName} takes ${maxReferences} reference pictures at most and you named ${found.length}. Name fewer.`;
    const refused = found.filter((picture) => rejected.has(keyOf(picture)));
    if (refused.length) return `The user already said that ${refused.map((picture) => refName(pictureRef(picture))).join('; ')} is not the one they mean. Do not use ${refused.length > 1 ? 'them' : 'it'}: ask which one they mean with choose_image.`;

    const maxCount = Number(info.maxImageCount) || 1;
    const wanted = Number.isInteger(args.count) ? args.count : 1;
    const count = Math.max(1, Math.min(wanted, maxCount));
    const ratios = Array.isArray(info.supportedImageAspectRatios) ? info.supportedImageAspectRatios : [];
    const firstShape = found.map((picture) => picture.part?.generatedImage?.aspectRatio).find((ratio) => IMAGE_ASPECT_RATIOS.includes(ratio));
    const askedShape = typeof args.aspect_ratio === 'string' && IMAGE_ASPECT_RATIOS.includes(args.aspect_ratio.trim()) ? args.aspect_ratio.trim() : '';
    const aspectRatio = resolveSupportedAspectRatio(askedShape || firstShape || '1:1', ratios);
    const resolution = resolveSupportedResolution('1K', Array.isArray(info.supportedImageResolutions) ? info.supportedImageResolutions : undefined);

    // The person sees which pictures it starts from, each with a "not this one" (the question below, or the row while it is drawn).
    const drawId = drawIds.get(call) || randomUUID();
    activeDraw = { id: drawId, found, askId: '' };
    const strips = await Promise.all(found.map(withStrip));
    if (found.length) emit({ type: 'image', event: 'refs', id: drawId, references: strips });
    const notThis = (index) => {
      const picture = found[index];
      rejected.add(keyOf(picture));
      activeDraw = null;
      return `The user pressed "not this one" on ${refName(pictureRef(picture))}, a picture you were going to draw from. No picture was drawn. Do not use it: ask which one they mean with choose_image (other candidates), then draw again.`;
    };
    if (!allowed) {
      const answer = await asker.ask('draw', {
        drawId,
        model: { id: model.id, name: modelName },
        prompt: oneLine(prompt, 1500),
        count,
        references: strips
      }, (value) => ['once', 'always', 'deny'].includes(value) || (/^not:\d{1,2}$/.test(value) && Number(value.slice(4)) < found.length), (id) => { if (activeDraw) activeDraw.askId = id; });
      if (signal?.aborted) return 'The reply was stopped.';
      if (answer === 'always') allowed = true;
      else if (typeof answer === 'string' && answer.startsWith('not:')) return notThis(Number(answer.slice(4)));
      else if (answer !== 'once') {
        return answer === 'timeout'
          ? 'The user did not answer in time, so no picture was drawn. Go on without it and say so briefly.'
          : 'The user refused to let you draw. Go on without a picture and say so briefly; do not ask again for the same thing.';
      }
    }

    calls += 1;
    const loaded = await loadReferences(found);
    if (loaded.stopped) return 'The reply was stopped.';
    if (loaded.error) return loaded.error;

    // The person may say "not this one" while it is drawn: that stops this drawing (and only it), see redo().
    drawing = new AbortController();
    const stopDrawing = () => drawing?.abort();
    signal?.addEventListener?.('abort', stopDrawing, { once: true });
    let result;
    try {
      result = await drawPictures({
        apiKey: secrets.imageKey,
        model: model.id,
        prompt,
        config: { aspectRatio, ...(resolution ? { resolution } : {}), ...(count > 1 ? { n: count } : {}) },
        inputReferences: loaded.urls,
        aspectRatio,
        keepPrompt: true,
        signal: drawing.signal,
        files,
        userId,
        fetchImpl,
        secrets,
        ...(wait ? { wait } : {})
      });
    } catch (error) {
      if (signal?.aborted) return 'The reply was stopped.';
      if (drawing.signal.aborted) return stoppedByPerson();
      emit({ type: 'image', event: 'failed', label: sandboxText(language, 'imageDrawFailed') });
      return `The picture model could not draw it: ${oneLine(error?.message, 300)}. Tell the user briefly; try again only if it makes sense.`;
    }
    signal?.removeEventListener?.('abort', stopDrawing);
    if (signal?.aborted) return 'The reply was stopped.';
    if (result.stopped || drawing.signal.aborted) return stoppedByPerson();
    drawing = null;
    activeDraw = null;
    const first = drawn + 1;
    drawn += result.parts.length;
    onPictures(result.parts);
    const referenceStrips = await Promise.all(found.map(withStrip));
    steps.push({ kind: 'draw', count: result.parts.length, references: referenceStrips });
    markUsed(found.map(pictureRef));
    emit({ type: 'image', event: 'done', count: result.parts.length, references: referenceStrips, label: sandboxText(language, result.parts.length > 1 ? 'imageDrawnMany' : 'imageDrawn', { n: result.parts.length }) });
    const words = `${result.parts.length} picture(s) drawn with ${modelName} and shown to the user in your message (pictures ${result.parts.length > 1 ? `${first} to ${drawn}` : first} of this message). Say briefly what you did; do not describe a link.`;
    // The model sees how the pictures came out (small copies), so it can say so and the user can ask for a change.
    const images = [];
    for (const [index, picture] of (result.made || []).entries()) {
      const thumb = await makeThumbnail(picture.bytes, picture.mediaType);
      if (thumb) images.push({ ...thumb, label: `Picture ${first + index} of your message, just drawn:` });
    }
    return images.length ? { content: `${words} The pictures follow so that you can see them.`, images } : words;
  }

  return {
    get list() { return []; },
    get instruction() { return instruction; },
    get used() { return calls; },
    /** The steps with pictures, for the record kept with the reply ({ kind: 'view' | 'pick' | 'draw', ... }). */
    get record() {
      let thumbs = 0;
      const keep = (entry) => {
        if (!entry.thumb) return entry;
        thumbs += 1;
        return thumbs <= RECORD_THUMBS ? entry : { round: entry.round, source: entry.source, number: entry.number };
      };
      return steps.map((step) => (step.kind === 'view' ? { ...step, shown: step.shown.map(keep) } : step.kind === 'pick' ? { ...step, picked: keep(step.picked) } : { ...step, references: step.references.map(keep) }));
    },
    get tools() {
      return [
        ...(calls < maxCalls ? [GENERATE_IMAGE_TOOL] : []),
        ...(pictures.length && looks < MAX_VIEW_CALLS ? [VIEW_IMAGES_TOOL] : []),
        ...(pictures.length > 1 && pickAsks < MAX_PICK_ASKS ? [CHOOSE_IMAGE_TOOL] : []),
        ...(pictures.length ? [LIST_IMAGES_TOOL] : [])
      ];
    },
    handles: (name) => [GENERATE_IMAGE_TOOL.name, VIEW_IMAGES_TOOL.name, LIST_IMAGES_TOOL.name, CHOOSE_IMAGE_TOOL.name].includes(name),
    noteFor: () => null,
    /** The row of the step list for a call: the page draws it while the picture is made. */
    stepEvent(call) {
      if (call?.name === LIST_IMAGES_TOOL.name || call?.name === CHOOSE_IMAGE_TOOL.name) return null;
      if (call?.name === VIEW_IMAGES_TOOL.name) return { type: 'image', event: 'start', kind: 'view', label: sandboxText(language, 'imageViewing'), reason: oneLine(call?.args?.reason, 300), references: [] };
      const asked = Array.isArray(call?.args?.references) ? call.args.references.map(readReference).filter(Boolean) : [];
      const id = randomUUID();
      if (call && typeof call === 'object') drawIds.set(call, id);
      return { type: 'image', event: 'start', id, label: sandboxText(language, 'imageDrawing'), references: asked.filter((ref) => Number.isInteger(ref.round) && Number.isInteger(ref.number) && ref.source) };
    },
    async run(call) {
      const result = call?.name === VIEW_IMAGES_TOOL.name ? await view(call)
        : call?.name === LIST_IMAGES_TOOL.name ? listAll(call)
          : call?.name === CHOOSE_IMAGE_TOOL.name ? await choose(call)
            : await generate(call);
      if (!notices.length) return result;
      // What the person said while the model worked (a picture it used was not the one) comes first in its next answer.
      const told = `${notices.splice(0).join(' ')}\n\n`;
      return typeof result === 'string' ? `${told}${result}` : { ...result, content: `${told}${result.content}` };
    },
    /** The answer of the person to a question (once, always, deny, pick:N, retry), or "redo" for a pick they want to change. */
    answer: (askId, value) => (value === 'redo' ? redo(askId) : typeof value === 'string' && /^not:\d{1,2}$/.test(value) && activeDraw?.id === askId ? notThisReference(askId, Number(value.slice(4))) : asker.answer(askId, value))
  };
}

