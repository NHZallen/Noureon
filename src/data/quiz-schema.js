// The quiz a model writes for the person (docs/superpowers/specs/2026-10-09-quiz-card-design.md, §4): a ```quiz block with only JSON. This reads it, checks it and gives it a
// fixed shape for the card (src/app/ui/quiz/quiz-card.js). Nothing here touches the page.
//
//   { "title": "...", "questions": [ { "type": "single" | "multi" | "truefalse", "question": "...",
//       "options": [ { "text": "...", "why": "..." } ], "answer": 1 | [0, 2], "explanation": "...", "hint": "..." } ] }

export const QUIZ_LIMITS = Object.freeze({
  questions: 30,
  minOptions: 2,
  options: 6,
  title: 120,
  question: 1200,
  optionText: 400,
  why: 1200,
  explanation: 1500,
  hint: 500
});

const TYPES = new Set(['single', 'multi', 'truefalse']);

const fail = (error, question = 0) => ({ ok: false, error, ...(question ? { question } : {}) });

const clean = (value, limit) => {
  if (value === null || value === undefined) return '';
  const text = (typeof value === 'string' ? value : String(value)).replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
};

// Whether a text that does not parse as JSON is only unfinished (a reply still being written): brackets opened and not closed, or a string still open, and nothing closed wrongly.
function looksUnfinished(text) {
  const stack = [];
  let inString = false;
  let escaped = false;
  for (const char of text) {
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') stack.push('}');
    else if (char === '[') stack.push(']');
    else if (char === '}' || char === ']') {
      if (stack.pop() !== char) return false;
    }
  }
  return inString || stack.length > 0;
}

const answerList = (value) => {
  const list = Array.isArray(value) ? value : [value];
  const numbers = list.map((item) => (typeof item === 'string' && /^\d+$/.test(item.trim()) ? Number(item) : item));
  if (!numbers.length || numbers.some((item) => !Number.isInteger(item))) return null;
  return [...new Set(numbers)].sort((a, b) => a - b);
};

function normalizeQuestion(raw, number) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail('bad_question', number);
  const question = clean(raw.question, QUIZ_LIMITS.question);
  if (!question) return fail('bad_question', number);
  if (!Array.isArray(raw.options) || raw.options.length < QUIZ_LIMITS.minOptions || raw.options.length > QUIZ_LIMITS.options) return fail('bad_options', number);
  const options = [];
  for (const item of raw.options) {
    const source = typeof item === 'string' ? { text: item } : item;
    const text = clean(source?.text, QUIZ_LIMITS.optionText);
    if (!text) return fail('bad_options', number);
    options.push({ text, why: clean(source.why, QUIZ_LIMITS.why) });
  }
  const answer = answerList(raw.answer);
  if (!answer || answer.some((index) => index < 0 || index >= options.length)) return fail('bad_answer', number);
  let type = TYPES.has(raw.type) ? raw.type : (answer.length > 1 ? 'multi' : 'single');
  if (type === 'truefalse' && options.length !== 2) return fail('bad_options', number);
  if (type === 'multi') {
    // Two or more correct options, and at least one that is wrong.
    if (answer.length < 2 || answer.length >= options.length) return fail('bad_answer', number);
  } else if (answer.length !== 1) {
    return fail('bad_answer', number);
  }
  if (type === 'multi' && options.length < 3) return fail('bad_options', number);
  type = type === 'truefalse' ? 'truefalse' : type;
  return { ok: true, question: { type, question, options, answer, explanation: clean(raw.explanation, QUIZ_LIMITS.explanation), hint: clean(raw.hint, QUIZ_LIMITS.hint) } };
}

/**
 * The quiz a ```quiz block holds: { ok: true, quiz: { title, questions: [{ type, question, options: [{ text, why }], answer: [index...], explanation, hint }] } },
 * or { ok: false, error, question? } with one of: empty, incomplete (the text is cut off: it is probably still being written), not_json, not_object, no_questions,
 * too_many_questions, bad_question, bad_options, bad_answer (`question` is the number of the question, counting from 1).
 * `answer` is always a list of option numbers counting from 0 (one number for single and truefalse).
 */
export function parseQuiz(source) {
  const text = String(source ?? '').trim();
  if (!text) return fail('empty');
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return fail(looksUnfinished(text) ? 'incomplete' : 'not_json');
  }
  if (Array.isArray(data)) data = { questions: data };
  if (!data || typeof data !== 'object') return fail('not_object');
  if (!Array.isArray(data.questions) || !data.questions.length) return fail('no_questions');
  if (data.questions.length > QUIZ_LIMITS.questions) return fail('too_many_questions');
  const questions = [];
  for (const [index, raw] of data.questions.entries()) {
    const result = normalizeQuestion(raw, index + 1);
    if (!result.ok) return result;
    questions.push(result.question);
  }
  return { ok: true, quiz: { title: clean(data.title, QUIZ_LIMITS.title), questions } };
}
