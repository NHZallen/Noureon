// Guards for speech to text (docs/superpowers/specs/2026-11-02-chat-video-audio-design.md, §8): a piece of sound with nothing in it is not sent to a speech model (a small Whisper makes words up out of
// silence and noise), and a transcript that falls into a loop ("把鑊子放在鑊子上…" said thirty times) is run again with a penalty for repeating, and is cut down to one saying when it still loops.
// A real repetition (a sentence said twice) is kept: only many saying in a row are a loop. Pure: no window, no document.

import { samplesOfWav } from './whisper-audio.js';

/** Under these a piece is taken for silence: the loudest sample, and the average power (about -40 and -50 dB of full scale). */
export const SILENCE = Object.freeze({ peak: 0.01, rms: 0.003 });
/** How many times in a row a phrase of N words (or letters of Chinese, Japanese and Korean) must come back to be a loop. */
export const LOOP_MIN_REPEATS = Object.freeze({ one: 8, short: 5, long: 4 });

/** Whether the samples (Float32, -1 to 1) hold no sound worth turning into text. */
export function isSilent(samples) {
  if (!samples?.length) return true;
  let peak = 0;
  let sum = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const value = Math.abs(samples[index]);
    if (value > peak) peak = value;
    sum += value * value;
  }
  return peak < SILENCE.peak || Math.sqrt(sum / samples.length) < SILENCE.rms;
}

/** Whether a 16-bit mono WAV file is silent (false for any other file: it is sent as it is). */
export function isSilentWav(data) {
  try {
    return isSilent(samplesOfWav(data).samples);
  } catch {
    return false;
  }
}

const WORD = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]|[\p{L}\p{N}']+/gu;
const minRepeats = (length) => (length === 1 ? LOOP_MIN_REPEATS.one : length <= 3 ? LOOP_MIN_REPEATS.short : LOOP_MIN_REPEATS.long);
const MAX_PHRASE = 40;

/** The first loop in a text: { start, length, repeats } in words, or null. Words are compared without case and without the marks between them. */
function findLoop(words) {
  for (let start = 0; start < words.length; start += 1) {
    for (let length = 1; length <= MAX_PHRASE && start + length * minRepeats(length) <= words.length; length += 1) {
      let repeats = 1;
      while (start + length * (repeats + 1) <= words.length) {
        let same = true;
        for (let offset = 0; offset < length; offset += 1) {
          if (words[start + offset].key !== words[start + length * repeats + offset].key) { same = false; break; }
        }
        if (!same) break;
        repeats += 1;
      }
      if (repeats >= minRepeats(length)) return { start, length, repeats };
    }
  }
  return null;
}

const wordsOf = (text) => [...String(text || '').matchAll(WORD)].map((match) => ({ key: match[0].toLowerCase(), from: match.index, to: match.index + match[0].length }));

/** Whether a text is a loop (a phrase that comes back many times in a row). */
export const isLooping = (text) => Boolean(findLoop(wordsOf(text)));

/** The text with each loop cut down to one saying of the phrase. A text without a loop is returned as it is. */
export function collapseLoops(text) {
  let current = String(text || '');
  for (let guard = 0; guard < 20; guard += 1) {
    const words = wordsOf(current);
    const loop = findLoop(words);
    if (!loop) break;
    const cutFrom = words[loop.start + loop.length].from;
    const cutTo = words[loop.start + loop.length * loop.repeats - 1].to;
    current = `${current.slice(0, cutFrom).trimEnd()}${current.slice(cutTo)}`;
  }
  return current.trim();
}

/** What is asked of Whisper again when the first try looped. */
export const RETRY_OPTIONS = Object.freeze({ repetition_penalty: 1.3 });

/**
 * Runs a Whisper pipeline on the samples of a piece: nothing for a silent one; a text that loops is tried again with a penalty for repeating, and cut down to one saying when it still loops.
 * `pipe(samples, options)` is the pipeline of transformers.js; `options` the ones for the language.
 */
export async function runGuardedWhisper(pipe, samples, options = {}) {
  if (isSilent(samples)) return '';
  const read = (out) => String(Array.isArray(out) ? out.map((item) => item.text).join(' ') : out?.text || '');
  const first = read(await pipe(samples, options));
  if (!isLooping(first)) return first;
  const second = read(await pipe(samples, { ...options, ...RETRY_OPTIONS }));
  return collapseLoops(second);
}
