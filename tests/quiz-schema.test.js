import assert from 'node:assert/strict';
import test from 'node:test';

import { QUIZ_LIMITS, parseQuiz } from '../src/data/quiz-schema.js';

const question = (extra = {}) => ({
  type: 'single',
  question: 'Which molecule does the oxygen of photosynthesis come from?',
  options: [{ text: 'Carbon dioxide', why: 'It is the source of carbon.' }, { text: 'Water', why: 'Water is split in the light reactions.' }, { text: 'Glucose', why: 'It is a product.' }],
  answer: 1,
  explanation: 'Tested with heavy oxygen in 1941.',
  hint: 'Think about what the light splits.',
  ...extra
});
const quiz = (questions = [question()], title = 'Photosynthesis') => JSON.stringify({ title, questions });

test('a good quiz is read into a fixed shape: answers are lists of option numbers, text is trimmed', () => {
  const result = parseQuiz(quiz());
  assert.equal(result.ok, true);
  assert.equal(result.quiz.title, 'Photosynthesis');
  const [first] = result.quiz.questions;
  assert.deepEqual(first.answer, [1]);
  assert.equal(first.type, 'single');
  assert.equal(first.options[1].why, 'Water is split in the light reactions.');
  assert.equal(first.hint, 'Think about what the light splits.');
  // Extra white space and a plain list of questions are fine.
  const loose = parseQuiz(JSON.stringify([question({ question: '  Why   is it so?  ', explanation: undefined, hint: undefined })]));
  assert.equal(loose.ok, true);
  assert.equal(loose.quiz.questions[0].question, 'Why is it so?');
  assert.equal(loose.quiz.questions[0].explanation, '');
  assert.equal(loose.quiz.title, '');
});

test('the kind of question is checked against its answer', () => {
  assert.equal(parseQuiz(quiz([question({ type: 'multi', answer: [0, 2] })])).ok, true);
  assert.deepEqual(parseQuiz(quiz([question({ type: 'multi', answer: [2, 0] })])).quiz.questions[0].answer, [0, 2], 'sorted');
  // A multiple-choice answer needs two or more right options and at least one wrong.
  assert.equal(parseQuiz(quiz([question({ type: 'multi', answer: [1] })])).error, 'bad_answer');
  assert.equal(parseQuiz(quiz([question({ type: 'multi', answer: [0, 1, 2] })])).error, 'bad_answer');
  // A single-choice question has one right option.
  assert.equal(parseQuiz(quiz([question({ answer: [0, 1] })])).error, 'bad_answer');
  assert.equal(parseQuiz(quiz([question({ answer: 7 })])).error, 'bad_answer');
  assert.equal(parseQuiz(quiz([question({ answer: -1 })])).error, 'bad_answer');
  assert.equal(parseQuiz(quiz([question({ answer: 'x' })])).error, 'bad_answer');
  assert.equal(parseQuiz(quiz([question({ answer: '1' })])).quiz.questions[0].answer[0], 1, 'a number written as a string');
  // True or false has exactly two options.
  assert.equal(parseQuiz(quiz([question({ type: 'truefalse' })])).error, 'bad_options');
  const tf = question({ type: 'truefalse', options: [{ text: 'True', why: 'a' }, { text: 'False', why: 'b' }], answer: 0 });
  assert.equal(parseQuiz(quiz([tf])).ok, true);
  // A missing type is told from the answer.
  assert.equal(parseQuiz(quiz([question({ type: undefined, answer: [0, 2] })])).quiz.questions[0].type, 'multi');
  assert.equal(parseQuiz(quiz([question({ type: undefined })])).quiz.questions[0].type, 'single');
});

test('the limits: questions, options and the shape of each one; the number of the bad question is told', () => {
  assert.equal(parseQuiz(quiz(Array.from({ length: QUIZ_LIMITS.questions }, () => question()))).ok, true);
  assert.equal(parseQuiz(quiz(Array.from({ length: QUIZ_LIMITS.questions + 1 }, () => question()))).error, 'too_many_questions');
  assert.equal(parseQuiz(JSON.stringify({ questions: [] })).error, 'no_questions');
  assert.equal(parseQuiz(JSON.stringify({ title: 'x' })).error, 'no_questions');
  const bad = parseQuiz(quiz([question(), question({ options: [{ text: 'only one' }] })]));
  assert.deepEqual([bad.error, bad.question], ['bad_options', 2]);
  assert.equal(parseQuiz(quiz([question({ options: Array.from({ length: 7 }, (_, i) => ({ text: `o${i}` })) })])).error, 'bad_options');
  assert.equal(parseQuiz(quiz([question({ options: [{ text: '' }, { text: 'b' }] })])).error, 'bad_options');
  assert.equal(parseQuiz(quiz([question({ question: '  ' })])).error, 'bad_question');
  assert.equal(parseQuiz(quiz([null])).error, 'bad_question');
  // Options may be plain strings; a long text is cut instead of refused.
  assert.equal(parseQuiz(quiz([question({ options: ['a', 'b', 'c'] })])).quiz.questions[0].options[0].why, '');
  const long = parseQuiz(quiz([question({ explanation: 'x'.repeat(QUIZ_LIMITS.explanation + 500) })])).quiz.questions[0].explanation;
  assert.equal(long.length, QUIZ_LIMITS.explanation);
});

test('what is not a quiz: empty, text, a cut-off block (still being written) and the wrong shape are told apart', () => {
  assert.equal(parseQuiz('').error, 'empty');
  assert.equal(parseQuiz('   ').error, 'empty');
  assert.equal(parseQuiz(null).error, 'empty');
  assert.equal(parseQuiz('here are some questions').error, 'not_json');
  assert.equal(parseQuiz('{"title": "x", "questions": [}').error, 'not_json', 'closed wrongly: not a block that is still coming');
  assert.equal(parseQuiz('3').error, 'not_object');
  assert.equal(parseQuiz('null').error, 'not_object');
  const whole = quiz();
  for (const cut of [20, 60, whole.length - 3]) assert.equal(parseQuiz(whole.slice(0, cut)).error, 'incomplete', `cut at ${cut}`);
  assert.equal(parseQuiz('{"title": "A \\"quoted\\" [word').error, 'incomplete', 'a string still open');
});
