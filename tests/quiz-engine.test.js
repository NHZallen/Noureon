import assert from 'node:assert/strict';
import test from 'node:test';

import { parseQuiz } from '../src/data/quiz-schema.js';
import { createQuizSession } from '../src/app/runtime/quiz/quiz-engine.js';

const make = (extra = []) => parseQuiz(JSON.stringify({
  title: 'T',
  questions: [
    { type: 'single', question: 'Q1', options: [{ text: 'a1', why: 'w' }, { text: 'b1', why: 'w' }, { text: 'c1', why: 'w' }], answer: 1, explanation: 'e1' },
    { type: 'multi', question: 'Q2', options: [{ text: 'a2' }, { text: 'b2' }, { text: 'c2' }, { text: 'd2' }], answer: [0, 2] },
    { type: 'truefalse', question: 'Q3', options: [{ text: 'True' }, { text: 'False' }], answer: 1 },
    ...extra
  ]
})).quiz;

// A random generator with a fixed sequence, so a shuffle can be told.
const seeded = (seed = 7) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const plain = { shuffleOptions: false };

test('a question is chosen, checked, and the session goes on to the next one and then to the end', () => {
  const session = createQuizSession(make(), plain);
  assert.equal(session.phase(), 'answering');
  assert.equal(session.current().text, 'Q1');
  assert.equal(session.canConfirm(), false);
  assert.equal(session.confirm(), null, 'nothing chosen: nothing is checked');
  assert.equal(session.next(), false, 'cannot skip an unanswered question');
  session.toggle(0);
  assert.equal(session.canConfirm(), true);
  const wrong = session.confirm();
  assert.deepEqual([wrong.correct, wrong.picked, wrong.answer], [false, [0], [1]]);
  assert.equal(session.phase(), 'checked');
  assert.equal(session.toggle(1), false, 'an answered question cannot be changed');
  assert.equal(session.confirm(), null);
  assert.equal(session.result().correct, false);
  assert.equal(session.isLast(), false);
  session.next();
  assert.equal(session.current().text, 'Q2');
  assert.equal(session.result(), null, 'the answer is not given before the question is answered');
});

test('a single-choice question keeps one option; a multiple-choice question is right only with exactly the right set', () => {
  const session = createQuizSession(make(), plain);
  session.toggle(0);
  session.toggle(2);
  assert.deepEqual(session.picked(), [2], 'the second choice replaces the first');
  session.toggle(1);
  assert.equal(session.confirm().correct, true);
  session.next();
  // Q2: right options are 0 and 2.
  session.toggle(0);
  assert.equal(session.confirm().correct, false, 'one of two right options is not enough');
  const again = createQuizSession(make(), plain);
  again.toggle(1); again.confirm(); again.next();
  again.toggle(0); again.toggle(2); again.toggle(3);
  assert.equal(again.confirm().correct, false, 'a wrong option on top of the right ones');
  const exact = createQuizSession(make(), plain);
  exact.toggle(1); exact.confirm(); exact.next();
  exact.toggle(2); exact.toggle(0); exact.toggle(3); exact.toggle(3);
  assert.deepEqual(exact.picked(), [2, 0], 'a click again takes an option off');
  assert.equal(exact.confirm().correct, true);
});

test('the options are shown in their own order, and a shuffle never moves an answer', () => {
  const quiz = make();
  for (let seed = 1; seed <= 25; seed += 1) {
    const session = createQuizSession(quiz, { random: seeded(seed) });
    const view = session.current();
    assert.deepEqual(view.options.map((option) => option.letter), ['A', 'B', 'C']);
    assert.deepEqual(view.options.map((option) => option.id).sort(), [0, 1, 2], 'every option is there once');
    const right = view.options.find((option) => option.correct);
    assert.equal(right.text, 'b1', 'the right option is the one the quiz says, wherever it is shown');
    session.toggle(right.id);
    assert.equal(session.confirm().correct, true);
  }
  const orders = new Set();
  for (let seed = 1; seed <= 25; seed += 1) orders.add(createQuizSession(quiz, { random: seeded(seed) }).current().options.map((option) => option.id).join());
  assert.ok(orders.size > 1, 'the order changes');
  // The questions keep their order in the first round unless asked.
  assert.equal(createQuizSession(quiz, { ...plain, random: seeded(3) }).current().text, 'Q1');
  const questionsShuffled = new Set();
  for (let seed = 1; seed <= 25; seed += 1) questionsShuffled.add(createQuizSession(quiz, { ...plain, shuffleQuestions: true, random: seeded(seed) }).current().text);
  assert.ok(questionsShuffled.size > 1);
});

test('the score, the missed questions, the progress bar and the end', () => {
  const session = createQuizSession(make(), plain);
  assert.deepEqual(session.steps(), ['now', 'todo', 'todo']);
  session.toggle(1); session.confirm();
  assert.deepEqual(session.steps(), ['right', 'todo', 'todo']);
  assert.equal(session.isLast(), false);
  session.next();
  session.toggle(0); session.confirm();
  assert.deepEqual(session.steps(), ['right', 'miss', 'todo']);
  session.next();
  assert.equal(session.isLast(), true);
  session.toggle(0); session.confirm();
  session.next();
  assert.equal(session.phase(), 'done');
  assert.deepEqual(session.steps(), ['right', 'miss', 'miss']);
  assert.deepEqual(session.score(), { right: 1, total: 3, missed: [1, 2], perfect: false });
  assert.equal(session.next(), false);
});

test('"redo the ones I missed" starts a new round with only those; "start again" starts everything again', () => {
  const session = createQuizSession(make(), { ...plain, random: seeded(11) });
  const answer = (pickRight) => {
    const view = session.current();
    const right = view.options.filter((option) => option.correct).map((option) => option.id);
    const wrong = view.options.filter((option) => !option.correct).map((option) => option.id);
    for (const id of pickRight ? right : [wrong[0]]) session.toggle(id);
    session.confirm();
    session.next();
  };
  answer(true); answer(false); answer(true);
  assert.equal(session.phase(), 'done');
  assert.equal(session.retryMissed(), true);
  assert.equal(session.round(), 2);
  assert.equal(session.phase(), 'answering');
  assert.equal(session.current().total, 1);
  assert.equal(session.current().text, 'Q2');
  answer(true);
  assert.deepEqual(session.score(), { right: 1, total: 1, missed: [], perfect: true });
  assert.equal(session.retryMissed(), false, 'nothing is missed any more');
  assert.equal(session.restart(), true);
  assert.equal(session.current().total, 3);
  assert.equal(session.phase(), 'answering');
  assert.deepEqual(session.steps().filter((step) => step !== 'todo' && step !== 'now'), [], 'a fresh bar');
});

test('the state is plain data: a session takes up where it was, and a state that does not fit the quiz is left alone', () => {
  const quiz = make();
  const first = createQuizSession(quiz, { random: seeded(5) });
  first.toggle(first.current().options[0].id);
  first.confirm();
  first.next();
  first.toggle(first.current().options[1].id);
  const saved = JSON.parse(JSON.stringify(first.state()));
  const second = createQuizSession(quiz, { state: saved, random: seeded(99) });
  assert.deepEqual(second.state(), first.state());
  assert.equal(second.current().text, first.current().text);
  assert.deepEqual(second.current().options.map((option) => option.id), first.current().options.map((option) => option.id), 'the same order of options');
  assert.deepEqual(second.picked(), first.picked());
  assert.deepEqual(second.steps(), first.steps());
  // A state of another quiz (a question that is not there, options that do not match) is not used.
  for (const broken of [{ ...saved, order: [9] }, { ...saved, phase: 'x' }, { ...saved, pos: 50 }, { ...saved, optionOrder: {} }, 'x', { order: [] }]) {
    const fresh = createQuizSession(quiz, { state: broken, ...plain });
    assert.equal(fresh.phase(), 'answering');
    assert.equal(fresh.current().number, 1);
    assert.deepEqual(fresh.steps(), ['now', 'todo', 'todo']);
  }
});
