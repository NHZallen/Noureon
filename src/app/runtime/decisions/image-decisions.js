// The questions put to the Decisions API about a picture request (how many pictures, which shape, a collage or separate pictures, more than the
// model can do), and the reading of its answers. The Decisions model answers yes-or-no questions with a probability (the probe of 2026-10-17,
// scripts/decisions-image-probe.mjs: 39 of 40 answers as expected on sentences in five languages, 140 to 240 ms); it has no question for a number,
// so a count is read from "exactly N pictures" questions; the same goes for the frames of a GIF and the time of a frame (a yes-or-no question says that a number was given, the number is
// read from the words, as the shape is). What the answers mean for the request is in runtime/images/image-spoken-request.js.

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
  count_said: 'The person says how many pictures (images, photos) they want, with a number or a number word, such as one picture, two images, 一張, 兩張, trois images. Counting things inside the picture (three cats) does not count.',
  ...Object.fromEntries(COUNTS.map((count) => [`exactly_${count}`, `The person asks for exactly ${WORDS[count]} separate pictures.`])),
  more_than_limit: `The person asks for more pictures, or more reference pictures, than the picture model can do (${limits}).`,
  ratio_stated: 'The person names the shape of the picture: an aspect ratio such as 9:16, 16:9, 4:3 or 1:1, or a word for it (portrait, vertical, wide, square).',
  portrait: 'The person asks for a tall picture (portrait, vertical, 9:16, 3:4, a phone wallpaper).',
  landscape: 'The person asks for a wide picture (landscape, horizontal, 16:9, 4:3, a banner).',
  square: 'The person asks for a square picture (1:1).',
  animated: 'The person asks for a picture that moves: a GIF, an animation, an animated image, 動圖, 動畫, 會動的圖, un GIF animé, анимация, una animación.',
  vector: 'The person asks for a vector picture: an SVG, a vector graphic, a picture drawn in scalable lines and shapes, 向量圖, 矢量圖, une image vectorielle, векторная графика, un gráfico vectorial.',
  frames_stated: 'The person says how many frames the animation has, with a number (8 frames, 6 格, 12 cadres, 10 кадров). How many frames per second does not count.',
  all_frames: 'The person wants the change made in EVERY frame of the animation (all the frames, the whole GIF, the same change everywhere, 每一格都, 整個動圖, 全部格, toutes les images, все кадры, todos los fotogramas), not in one frame only.',
  frame_time_stated: 'The person says how long each single frame of the animation shows, with a number and a unit of time (200 ms per frame, half a second each, 每格 100 毫秒, 0,5 s par image). The length of the whole animation does not count.'
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

/** The answers as { collage, countSaid, count, more, ratioStated, portrait, landscape, square, animated, vector, framesStated, allFrames, frameTimeStated }: count is the N of the "exactly N" question that answered yes (the surest one), or null. null when there are no answers. */
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
    countSaid: named.count_said,
    count,
    more: named.more_than_limit,
    ratioStated: named.ratio_stated,
    portrait: named.portrait,
    landscape: named.landscape,
    square: named.square,
    animated: named.animated,
    vector: named.vector,
    framesStated: named.frames_stated,
    allFrames: named.all_frames,
    frameTimeStated: named.frame_time_stated
  };
}

/** The shape written as numbers (9:16, 9：16, 9比16, 9x16), as "9:16", or '' when there is none. */
export function readWrittenRatio(message) {
  const found = /(?<![\d.:：])(\d{1,2})\s*(?:[:：比xX×]|\bby\b)\s*(\d{1,2})(?![\d:：])/i.exec(String(message || ''));
  return found ? `${Number(found[1])}:${Number(found[2])}` : '';
}

const CHINESE_NUMBERS = { 二: 2, 兩: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 十一: 11, 十二: 12, 十三: 13, 十四: 14, 十五: 15, 十六: 16 };
const FRAME_WORDS = '(?:frames?|cadres?|fotogramas?|cuadros?|кадр(?:а|ов|ы)?|格|幀|帧)';
const PER_SECOND = '(?:\\s*(?:\\/|per|par|por|в|每)\\s*(?:s\\b|sec|second|seconde|segundo|секунд|秒))';

/** The number of frames written in the words ("8 frames", "8-frame", "frames: 8", "6 格", "六格", "12 кадров"), or null when there is none. A rate ("30 frames per second") is no number of frames. */
export function readWrittenFrames(message) {
  const text = String(message || '');
  const before = new RegExp(`(?<![\\d.])(\\d{1,2}|十[一二三四五六]?|[二兩两三四五六七八九])\\s*-?\\s*${FRAME_WORDS}(?!${PER_SECOND.slice(3, -1)})(?!\\w)`, 'iu').exec(text);
  const after = /(?:frames?|cadres?|fotogramas?|cuadros|кадров|格數|幀數|帧数)\s*[:：=]\s*(\d{1,2})(?!\d)/iu.exec(text);
  const raw = before?.[1] ?? after?.[1];
  if (raw === undefined) return null;
  const number = /^\d+$/.test(raw) ? Number(raw) : CHINESE_NUMBERS[raw];
  return Number.isInteger(number) ? number : null;
}

/** The time of one frame written in the words ("200 ms", "0.5 s", "每格 100 毫秒", "0,5 секунды"), in milliseconds (rounded to 10), or null when there is none or it is not a time a frame can have (20 to 2000: "3 seconds" is the length of the whole animation). */
export function readWrittenFrameTime(message) {
  const text = String(message || '');
  const found = /(?<![\d.,])(\d+(?:[.,]\d+)?)\s*(ms|msec|milli\w*|мс|миллисекунд\w*|毫秒|s(?![a-z])|sec\w*|seconds?|secondes?|segundos?|секунд\w*|сек(?![а-я])|秒)/iu.exec(text);
  if (!found) return null;
  const value = Number(found[1].replace(',', '.'));
  const unit = found[2].toLowerCase();
  const milliseconds = /^(ms|msec|milli|мс|миллисекунд|毫秒)/u.test(unit) ? value : value * 1000;
  const rounded = Math.round(milliseconds / 10) * 10;
  return rounded >= 20 && rounded <= 2000 ? rounded : null;
}
