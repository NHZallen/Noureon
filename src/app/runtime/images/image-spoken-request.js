// What the person said about the pictures they want (how many, which shape, a collage) turned into what the request does, from the answers of the
// Decisions model (runtime/decisions/image-decisions.js). What is said counts for this message only: the numbers of the settings are not changed.
//   - a count ("two pictures") sets how many the request makes; a collage is one picture made of parts, so it makes one;
//   - a shape written as numbers (9:16) or in a word (portrait, wide, square) sets the shape;
//   - more than the model can do (a count, a shape it lacks) is a problem: the request is not sent.
// Without answers (no key, slow, paused) nothing is read and the request goes with the settings.

import { IMAGE_ASPECT_RATIOS } from './image-generation-config.js';
import { MAX_SPOKEN_COUNT, readWrittenRatio } from '../decisions/image-decisions.js';
import { DECISION_THRESHOLD } from '../decisions/decision-store.js';

const TALL = ['9:16', '3:4', '2:3', '4:5'];
const WIDE = ['16:9', '4:3', '3:2', '5:4'];

/** The limits of a picture model as the question about them needs them. */
export const limitsOf = (modelInfo = {}) => ({
  maxCount: modelInfo.maxImageCount,
  minReferences: modelInfo.minImageReferences,
  maxReferences: modelInfo.maxImageReferences
});

const yes = (value) => typeof value === 'number' && value >= DECISION_THRESHOLD;
// A collage makes one picture whatever the count says, so it needs a surer yes than the rest: "four pictures in different styles" answered 0.74 for a collage,
// the real ones 0.89 and more (the probe of 2026-10-17). A word for the shape alone ("portrait", "a phone wallpaper") needs 0.75: it is a guess about what is meant.
const COLLAGE_THRESHOLD = 0.85;
const SHAPE_WORD_THRESHOLD = 0.75;

/** { count, aspectRatio, collage, problem }: each is empty ('' or null or false) when nothing was said about it; `problem` is { code, ... } for a request the model cannot do. */
export function readSpokenRequest({ decision, message, modelInfo = {}, attached = 0 } = {}) {
  const nothing = { count: null, aspectRatio: '', collage: false, problem: null };
  if (!decision) return nothing;
  const collage = typeof decision.collage === 'number' && decision.collage >= COLLAGE_THRESHOLD;
  // A count of two or more that was read ("exactly N") wins; when a count was said but it is not two or more, it is one.
  // "Exactly three pictures" also answers yes for "three cats" (0.59 and above on the probe), so a count counts only when a count of pictures was said (0.98 on the real ones, 0.08 on three cats).
  const countSaid = typeof decision.countSaid === 'number' ? yes(decision.countSaid) : true;
  const read = countSaid ? decision.count : null;
  const count = collage ? 1 : read ?? (typeof decision.countSaid === 'number' && countSaid ? 1 : null);
  const maxCount = modelInfo.maxImageCount > 0 ? modelInfo.maxImageCount : MAX_SPOKEN_COUNT;
  const supported = Array.isArray(modelInfo.supportedImageAspectRatios) ? modelInfo.supportedImageAspectRatios : [];

  if (!collage && count > maxCount) return { ...nothing, problem: { code: 'count', n: count, max: maxCount } };
  // More than the ten that can be asked for in words (the answers have no number for it): said to be beyond what the model does.
  const referencesOver = modelInfo.maxImageReferences > 0 && attached > modelInfo.maxImageReferences;
  if (!collage && read === null && yes(decision.more) && !referencesOver) return { ...nothing, problem: { code: 'count-any', max: maxCount } };

  let aspectRatio = '';
  const written = yes(decision.ratioStated) ? readWrittenRatio(message) : '';
  if (written) {
    if (!IMAGE_ASPECT_RATIOS.includes(written) || written === 'auto' || (supported.length > 0 && !supported.includes(written))) {
      return { ...nothing, problem: { code: 'ratio', ratio: written } };
    }
    aspectRatio = written;
  } else {
    // A word for the shape (portrait, wide, square, a phone wallpaper): the surest of the three, if it is sure enough.
    const best = [['portrait', decision.portrait], ['landscape', decision.landscape], ['square', decision.square]]
      .filter(([, value]) => typeof value === 'number' && value >= SHAPE_WORD_THRESHOLD)
      .sort((a, b) => b[1] - a[1])[0]?.[0];
    const choices = best === 'portrait' ? TALL : best === 'landscape' ? WIDE : best === 'square' ? ['1:1'] : [];
    aspectRatio = choices.find((ratio) => supported.length === 0 || supported.includes(ratio)) || '';
  }
  return { count: Number.isInteger(count) ? count : null, aspectRatio, collage, problem: null };
}

/** The words for a problem, in the language of the page (`getText(key, fallback)`). */
export function spokenProblemText(problem, getText) {
  const fill = (text, values) => Object.entries(values).reduce((result, [name, value]) => result.replaceAll(`{${name}}`, String(value)), text);
  if (problem.code === 'count') return fill(getText('imageCountOverLimit', 'This model makes {max} pictures per request at most and you asked for {n}, so nothing was sent.'), problem);
  if (problem.code === 'count-any') return fill(getText('imageCountOverLimitAny', 'You asked for more pictures than this model makes per request ({max} at most), so nothing was sent.'), problem);
  return fill(getText('imageRatioOverLimit', 'This model does not take the shape {ratio}, so nothing was sent.'), problem);
}

/** The line added to the prompt when a count of two or more was said: the picture model reads "two pictures" in the words as panels of one image (seen on staging, 2026-10-17: both pictures were a collage of two scenes), so it is told that the count is made elsewhere. */
export const SEVERAL_INSTRUCTION = 'Make exactly ONE picture of a single scene (no collage, no panels, no frames). How many pictures are made and their shape are set separately, so the words of the request about the number of pictures or the shape are not part of this picture.';
/** The line added when a shape was said and no count: the shape is set separately, and must not be drawn as frames or written in the picture. */
export const SHAPE_INSTRUCTION = 'The shape of the picture is set separately: do not draw frames or panels for it and do not write it in the picture.';

/** The line added to the prompt of a collage, so that the model makes one picture of parts and not several pictures. */
export const COLLAGE_INSTRUCTION = 'Make this ONE single image, composed as a collage of its parts (not separate images).';
