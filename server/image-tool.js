// The tool a text model has to draw pictures by itself (docs/superpowers/specs/2026-10-22-text-model-image-tool-design.md). It is a loader of the kind the
// skills and the connectors are (src/data/skill-tool.js, server/mcp/tool-loader.js): the loops of a reply see its tools, hand it each call, and give the
// model what it returns. `generate_image` asks the picture model the person chose for one or more pictures, from a prompt the model wrote and the
// pictures it named as references (a round, a source and a number each: src/data/conversation-pictures.js), after the person allowed it (when they have not
// allowed it for good). The pictures are kept in the person's cloud space and become parts of the reply's message.

import { drawPictures } from './image-run.js';
import { createImageAsk } from './image-ask.js';
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

  const lines = pictureIndexLines(pictures, { currentRound: round });
  const instruction = [
    `You can draw pictures for the user with the tool generate_image, using the picture model "${modelName}" that the user chose in the settings. Call it when the user asks for a picture, or asks you to change, redo or combine pictures; do not draw unasked.`,
    'Write the prompt yourself, in full. To change or combine pictures, name them in `references` and say in the prompt what to keep and what to change, referring to them by their order in `references`. Leave `references` out for a new picture.',
    `The message you are answering is round ${round}. A picture is named by its round, its source ("user": the user sent it; "generated": you drew it) and its number in its message, which is the number the user sees on the picture. The pictures of this conversation:`,
    lines.length ? lines.join('\n') : '(none yet)',
    'A picture the user attached to the message you are answering has a label in front of it ("Image 2 of 3 in this message: …"): the first number is its number, the one the user sees on it.',
    'The user may say "this one" (a picture of this message), "the one before", or give a number; read what they mean and pick the picture. If it is not clear which picture they mean, ask them in your reply instead of guessing.',
    `To find out which picture the user means, look at pictures with view_images (up to ${MAX_VIEW_PICTURES} each time, ${MAX_VIEW_CALLS} times in a reply): name some, or select by kind (for example every picture 3). A picture number alone does not say which round: "picture 3" may be any round\'s, so look at all of them and pick by what they show. list_images gives the full list when the one above is cut short. Do not guess: when you cannot tell, ask the user which one.`,
    'The user may be asked to allow each picture first. The pictures appear in your message by themselves once drawn: do not describe a link, and say briefly what you did.'
  ].join('\n');

  async function loadReferences(found) {
    const urls = [];
    for (const picture of found) {
      const data = pictureData(picture);
      if (!data) return { error: `The picture (${refName(pictureRef(picture))}) is not available any more: it was never kept in the user's cloud space. Tell the user, and go on without it only if they agree.` };
      if (data.kind === 'base64') {
        urls.push(`data:${data.mimeType || 'image/png'};base64,${data.data}`);
        continue;
      }
      if (!String(data.marker.__astraCloudAsset.path).startsWith(`${userId}/`)) return { error: `The picture (${refName(pictureRef(picture))}) cannot be read.` };
      try {
        urls.push(toDataUrl(await files.load({ userId, marker: data.marker }), data.mimeType));
      } catch (error) {
        if (signal?.aborted) return { stopped: true };
        return { error: `The picture (${refName(pictureRef(picture))}) could not be read now. Tell the user briefly.` };
      }
    }
    return { urls };
  }

  /** The bytes of a picture of the conversation: { bytes, mimeType }, { stopped: true } or { missing: true }. */
  async function loadBytes(picture) {
    const data = pictureData(picture);
    if (!data) return { missing: true };
    if (data.kind === 'base64') return { bytes: Buffer.from(data.data, 'base64'), mimeType: data.mimeType || 'image/png' };
    if (!String(data.marker.__astraCloudAsset.path).startsWith(`${userId}/`)) return { missing: true };
    try {
      return { bytes: await files.load({ userId, marker: data.marker }), mimeType: data.mimeType || 'image/png' };
    } catch {
      return signal?.aborted ? { stopped: true } : { missing: true };
    }
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
    emit({ type: 'image', event: 'done', kind: 'view', count: shown.length, pictures: shown.map(pictureRef), reason: oneLine(args.reason, 300), label: shown.length ? sandboxText(language, 'imageViewed', { list: numbersText(shown) }) : sandboxText(language, 'imageViewedNone') });
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

    const maxCount = Number(info.maxImageCount) || 1;
    const wanted = Number.isInteger(args.count) ? args.count : 1;
    const count = Math.max(1, Math.min(wanted, maxCount));
    const ratios = Array.isArray(info.supportedImageAspectRatios) ? info.supportedImageAspectRatios : [];
    const firstShape = found.map((picture) => picture.part?.generatedImage?.aspectRatio).find((ratio) => IMAGE_ASPECT_RATIOS.includes(ratio));
    const askedShape = typeof args.aspect_ratio === 'string' && IMAGE_ASPECT_RATIOS.includes(args.aspect_ratio.trim()) ? args.aspect_ratio.trim() : '';
    const aspectRatio = resolveSupportedAspectRatio(askedShape || firstShape || '1:1', ratios);
    const resolution = resolveSupportedResolution('1K', Array.isArray(info.supportedImageResolutions) ? info.supportedImageResolutions : undefined);

    if (!allowed) {
      const answer = await asker.ask('draw', {
        model: { id: model.id, name: modelName },
        prompt: oneLine(prompt, 1500),
        count,
        references: found.map(pictureRef)
      }, (value) => ['once', 'always', 'deny'].includes(value));
      if (signal?.aborted) return 'The reply was stopped.';
      if (answer === 'always') allowed = true;
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
        signal,
        files,
        userId,
        fetchImpl,
        secrets,
        ...(wait ? { wait } : {})
      });
    } catch (error) {
      if (signal?.aborted) return 'The reply was stopped.';
      emit({ type: 'image', event: 'failed', label: sandboxText(language, 'imageDrawFailed') });
      return `The picture model could not draw it: ${oneLine(error?.message, 300)}. Tell the user briefly; try again only if it makes sense.`;
    }
    if (result.stopped || signal?.aborted) return 'The reply was stopped.';
    const first = drawn + 1;
    drawn += result.parts.length;
    onPictures(result.parts);
    emit({ type: 'image', event: 'done', count: result.parts.length, references: found.map(pictureRef), label: sandboxText(language, result.parts.length > 1 ? 'imageDrawnMany' : 'imageDrawn', { n: result.parts.length }) });
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
    get tools() {
      return [
        ...(calls < maxCalls ? [GENERATE_IMAGE_TOOL] : []),
        ...(pictures.length && looks < MAX_VIEW_CALLS ? [VIEW_IMAGES_TOOL] : []),
        ...(pictures.length ? [LIST_IMAGES_TOOL] : [])
      ];
    },
    handles: (name) => [GENERATE_IMAGE_TOOL.name, VIEW_IMAGES_TOOL.name, LIST_IMAGES_TOOL.name].includes(name),
    noteFor: () => null,
    /** The row of the step list for a call: the page draws it while the picture is made. */
    stepEvent(call) {
      if (call?.name === LIST_IMAGES_TOOL.name) return null;
      if (call?.name === VIEW_IMAGES_TOOL.name) return { type: 'image', event: 'start', kind: 'view', label: sandboxText(language, 'imageViewing'), reason: oneLine(call?.args?.reason, 300), references: [] };
      const asked = Array.isArray(call?.args?.references) ? call.args.references.map(readReference).filter(Boolean) : [];
      return { type: 'image', event: 'start', label: sandboxText(language, 'imageDrawing'), references: asked.filter((ref) => Number.isInteger(ref.round) && Number.isInteger(ref.number) && ref.source) };
    },
    async run(call) {
      if (call?.name === VIEW_IMAGES_TOOL.name) return view(call);
      if (call?.name === LIST_IMAGES_TOOL.name) return listAll(call);
      return generate(call);
    },
    answer: asker.answer
  };
}

