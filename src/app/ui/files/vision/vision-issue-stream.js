// The problems of a visual check, read from the model's JSON answer while the model is still writing it, so the reply that reports them can be
// drawn as it is written, as any reply is. Shared with the server (it uses nothing of the page).

import { buildFreeVisionResult } from './vision-free.js';
import { VISION_TEXTS } from './vision-texts.js';

const ESCAPES = Object.freeze({ n: '\n', t: '\t', r: '\r', b: '\b', f: '\f' });
const WHITESPACE = /\s/;

// The string that begins at `start` (just after its opening quote): what is written of it, and whether it is closed.
function readString(text, start) {
  let value = '';
  let index = start;
  while (index < text.length) {
    const char = text[index];
    if (char === '"') return { value, closed: true, end: index + 1 };
    if (char === '\\') {
      const next = text[index + 1];
      if (next === undefined) break;
      if (next === 'u') {
        const code = text.slice(index + 2, index + 6);
        if (code.length < 4) break;
        value += String.fromCharCode(Number.parseInt(code, 16) || 0);
        index += 6;
        continue;
      }
      value += ESCAPES[next] ?? next;
      index += 2;
      continue;
    }
    value += char;
    index += 1;
  }
  return { value, closed: false, end: text.length };
}

// The fields written so far of the object that begins at `start`. `writing` names the string that is not closed yet.
function readObject(text, start) {
  const fields = {};
  let index = start + 1;
  for (;;) {
    while (index < text.length && (WHITESPACE.test(text[index]) || text[index] === ',')) index += 1;
    if (index >= text.length) return { fields, writing: '', closed: false, end: text.length };
    if (text[index] === '}') return { fields, writing: '', closed: true, end: index + 1 };
    if (text[index] !== '"') {
      index += 1;
      continue;
    }
    const key = readString(text, index + 1);
    if (!key.closed) return { fields, writing: '', closed: false, end: text.length };
    index = key.end;
    while (index < text.length && WHITESPACE.test(text[index])) index += 1;
    if (text[index] !== ':') return { fields, writing: '', closed: false, end: text.length };
    index += 1;
    while (index < text.length && WHITESPACE.test(text[index])) index += 1;
    if (index >= text.length) return { fields, writing: '', closed: false, end: text.length };
    if (text[index] === '"') {
      const value = readString(text, index + 1);
      fields[key.value] = value.value;
      if (!value.closed) return { fields, writing: key.value, closed: false, end: text.length };
      index = value.end;
    } else {
      // A number counts once what ends it has come (1 may become 12).
      const number = /^-?\d+(?:\.\d+)?(?=[\s,}])/.exec(text.slice(index));
      if (number) {
        fields[key.value] = Number(number[0]);
        index += number[0].length;
      } else {
        while (index < text.length && text[index] !== ',' && text[index] !== '}') index += 1;
        if (index >= text.length) return { fields, writing: '', closed: false, end: text.length };
      }
    }
  }
}

/** The problems written so far in `answer`: the finished ones, and the one being written with the fields it has. */
export function readIssuesSoFar(answer) {
  const text = String(answer || '');
  const found = /"issues"\s*:\s*\[/.exec(text);
  if (!found) return [];
  const issues = [];
  let index = found.index + found[0].length;
  for (;;) {
    while (index < text.length && (WHITESPACE.test(text[index]) || text[index] === ',')) index += 1;
    if (index >= text.length || text[index] === ']') break;
    if (text[index] !== '{') {
      index += 1;
      continue;
    }
    const object = readObject(text, index);
    issues.push({ ...object.fields, writing: object.writing });
    if (!object.closed) break;
    index = object.end;
  }
  return issues;
}

// A problem as the reply tells it: its slide and kind must be known (so the line starts right), and its words have begun.
const toIssue = (entry, categories) => {
  if (!Number.isInteger(entry.slide) || entry.slide < 1) return null;
  if (typeof entry.category !== 'string' || entry.writing === 'category' || !categories[entry.category]) return null;
  if (typeof entry.problem !== 'string' || !entry.problem) return null;
  return { slide: entry.slide, category: entry.category, problem: entry.problem, fix: typeof entry.fix === 'string' ? entry.fix : '' };
};

/**
 * Tells the reply of the check (`send(text)`, the words so far) as the model writes its answer: `feed(answer)` with the answer so far. The words
 * are sent at most every `every` ms (the last of them by `flush`), and nothing is sent until a problem has begun.
 */
export function createIssueStream({ language, checkedSlides, totalSlides, send, every = 80, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout }) {
  const categories = (VISION_TEXTS[language] || VISION_TEXTS.en).categories;
  let sent = '';
  let sentAt = -Infinity;
  let held = '';
  let timer = null;
  const give = () => {
    timer = null;
    if (!held || held === sent) return;
    sent = held;
    sentAt = now();
    send(held);
  };
  return {
    feed(answer) {
      const issues = readIssuesSoFar(answer).map((entry) => toIssue(entry, categories)).filter(Boolean);
      if (!issues.length) return;
      held = buildFreeVisionResult({ result: { issues }, language, checkedSlides, totalSlides });
      if (held === sent) return;
      const wait = every - (now() - sentAt);
      if (wait <= 0) {
        if (timer !== null) clearTimer(timer);
        give();
      } else if (timer === null) timer = setTimer(give, wait);
    },
    /** Sends what is held back. */
    flush() {
      if (timer !== null) clearTimer(timer);
      give();
    }
  };
}
