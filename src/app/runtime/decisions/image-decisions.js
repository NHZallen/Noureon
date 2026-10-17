// The questions put to the Decisions API about a picture request (how many pictures, which shape, a collage or separate pictures, more than the
// model can do), and the reading of its answers. The Decisions model answers yes-or-no questions with a probability (the probe of 2026-10-17,
// scripts/decisions-image-probe.mjs: 39 of 40 answers as expected on sentences in five languages, 140 to 240 ms); it has no question for a number,
// so a count is read from "exactly N pictures" questions. What the answers mean for the request is in legacy-runtime/features/image-spoken-request.js.

import { DECISION_MODEL } from './decision-client.js';
import { DECISION_THRESHOLD } from './decision-store.js';

/** The most pictures one request can ask for (the count of the settings goes to 10). */
export const MAX_SPOKEN_COUNT = 10;
const COUNTS = Object.freeze(Array.from({ length: MAX_SPOKEN_COUNT - 1 }, (_, index) => index + 2));
const WORDS = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

/** The sentence that tells the model what the picture model in use can do (it is put in the state and in the question about the limits). */
export function describeLimits({ maxCount, minReferences = 0, maxReferences } = {}) {
  const pictures = `1 to ${maxCount > 0 ? maxCount : MAX_SPOKEN_COUNT}`;
  const references = maxReferences > 0 ? `${minReferences || 0} to ${maxReferences}` : 'any number of';
  return `The picture model in use makes ${pictures} pictures per request and takes ${references} reference pictures.`;
}

const questionsFor = (limits) => ({
  collage: 'The person wants ONE single picture made of several parts put together (a collage, a grid, panels, a storyboard, a triptych), not several separate pictures.',
  single: 'The person says outright that they want one single picture (one picture, a single image), or two or more parts in one picture.',
  ...Object.fromEntries(COUNTS.map((count) => [`exactly_${count}`, `The person asks for exactly ${WORDS[count]} separate pictures.`])),
  more_than_limit: `The person asks for more pictures, or more reference pictures, than the picture model can do (${limits}).`,
  ratio_stated: 'The person names the shape of the picture: an aspect ratio such as 9:16, 16:9, 4:3 or 1:1, or a word for it (portrait, vertical, wide, square).',
  portrait: 'The person asks for a tall picture (portrait, vertical, 9:16, 3:4, a phone wallpaper).',
  landscape: 'The person asks for a wide picture (landscape, horizontal, 16:9, 4:3, a banner).',
  square: 'The person asks for a square picture (1:1).'
});

const clip = (text, length) => {
  const value = String(text ?? '').replace(/\s+/g, ' ').trim();
  return value.length > length ? `${value.slice(0, length)}…` : value;
};

/** The request for one picture message; `limits` is { maxCount, minReferences, maxReferences } of the model in use, `attached` the reference pictures sent with the message. */
export function buildImageDecisionRequest({ message, limits = {}, attached = 0, model = DECISION_MODEL } = {}) {
  const latest = clip(message, 1500);
  if (!latest) return null;
  const sentence = describeLimits(limits);
  const questions = Object.fromEntries(Object.entries(questionsFor(sentence)).map(([name, instructions]) => [name, { type: 'noul', instructions }]));
  return { model, state: [`Latest message: ${latest}`, sentence, `Reference pictures attached to the latest message: ${attached}.`], questions };
}

const probability = (answer) => {
  const value = Number(answer?.noul);
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
};

/** The answers as { collage, single, count, more, ratioStated, portrait, landscape, square }: count is the N of the "exactly N" question that answered yes (the surest one), or null. null when there are no answers. */
export function parseImageDecisionResponse(body, threshold = DECISION_THRESHOLD) {
  const answers = body?.answers;
  if (!answers || typeof answers !== 'object') return null;
  const named = Object.fromEntries(Object.keys(questionsFor('')).map((name) => [name, probability(answers[name])]));
  if (!Object.values(named).some((value) => value !== null)) return null;
  let count = null;
  let best = threshold;
  for (const candidate of COUNTS) {
    const value = named[`exactly_${candidate}`];
    if (value !== null && value >= best) { best = value; count = candidate; }
  }
  return {
    collage: named.collage,
    single: named.single,
    count,
    more: named.more_than_limit,
    ratioStated: named.ratio_stated,
    portrait: named.portrait,
    landscape: named.landscape,
    square: named.square
  };
}

/** The shape written as numbers (9:16, 9：16, 9比16, 9x16), as "9:16", or '' when there is none. */
export function readWrittenRatio(message) {
  const found = /(?<![\d.:：])(\d{1,2})\s*(?:[:：比xX×]|\bby\b)\s*(\d{1,2})(?![\d:：])/i.exec(String(message || ''));
  return found ? `${Number(found[1])}:${Number(found[2])}` : '';
}
