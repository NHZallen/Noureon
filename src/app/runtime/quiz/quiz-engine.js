// What happens in a quiz card, without the page (docs/superpowers/specs/2026-10-09-quiz-card-design.md, §3): which question is on, which options are chosen, what the answer was,
// the score, and the rounds ("redo only the ones I missed", "start again"). The state is plain data (`state()`), so what a person has answered can be kept and restored.
//
// A question's options are shown in an order of their own (shuffled), and every choice is kept as the number the option has in the quiz, so a shuffle can never move an answer.

const shuffled = (list, random) => {
  const result = [...list];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
};

const sameSet = (a, b) => a.length === b.length && a.every((item) => b.includes(item));

/**
 * `quiz` is what parseQuiz gives. `state` (what `state()` gave before) takes the session back to where it was. `shuffleOptions` shuffles the options of each question,
 * `shuffleQuestions` the questions of the first round (the questions of a later round are shuffled when it starts); `random` is for the tests.
 */
export function createQuizSession(quiz, { state = null, shuffleOptions = true, shuffleQuestions = false, random = Math.random } = {}) {
  const questions = quiz.questions;
  const count = questions.length;
  let data;

  const freshRound = (order) => ({
    order,
    optionOrder: Object.fromEntries(order.map((index) => [index, shuffleOptions ? shuffled(questions[index].options.map((_, option) => option), random) : questions[index].options.map((_, option) => option)])),
    pos: 0,
    phase: 'answering',
    picked: [],
    results: {},
    round: 1
  });

  const valid = (candidate) => candidate && Array.isArray(candidate.order) && candidate.order.length
    && candidate.order.every((index) => Number.isInteger(index) && index >= 0 && index < count)
    && ['answering', 'checked', 'done'].includes(candidate.phase)
    && Number.isInteger(candidate.pos) && candidate.pos >= 0 && candidate.pos < candidate.order.length
    && candidate.optionOrder && candidate.order.every((index) => Array.isArray(candidate.optionOrder[index]) && sameSet([...candidate.optionOrder[index]].sort((a, b) => a - b), questions[index].options.map((_, option) => option)))
    && candidate.results && typeof candidate.results === 'object';

  if (valid(state)) {
    data = {
      order: [...state.order],
      optionOrder: Object.fromEntries(state.order.map((index) => [index, [...state.optionOrder[index]]])),
      pos: state.pos,
      phase: state.phase,
      picked: Array.isArray(state.picked) ? state.picked.filter((option) => Number.isInteger(option)) : [],
      results: Object.fromEntries(Object.entries(state.results).map(([key, value]) => [key, { picked: [...(value.picked || [])], correct: Boolean(value.correct) }])),
      round: Number.isInteger(state.round) && state.round > 0 ? state.round : 1
    };
  } else {
    const order = questions.map((_, index) => index);
    data = freshRound(shuffleQuestions ? shuffled(order, random) : order);
  }

  const currentIndex = () => data.order[data.pos];
  const correctSet = (index) => [...questions[index].answer];

  const view = () => {
    const index = currentIndex();
    const question = questions[index];
    return {
      index,
      number: data.pos + 1,
      total: data.order.length,
      type: question.type,
      text: question.question,
      hint: question.hint,
      explanation: question.explanation,
      multi: question.type === 'multi',
      correctCount: question.answer.length,
      options: data.optionOrder[index].map((option, position) => ({ id: option, letter: String.fromCharCode(65 + position), text: question.options[option].text, why: question.options[option].why, correct: question.answer.includes(option) }))
    };
  };

  const api = {
    phase: () => data.phase,
    current: view,
    picked: () => [...data.picked],
    /** Chooses an option of the question on screen (a single-choice question keeps one; a multiple-choice one toggles). Only while it is not answered. */
    toggle(optionId) {
      if (data.phase !== 'answering' || !questions[currentIndex()].options[optionId]) return false;
      if (questions[currentIndex()].type === 'multi') data.picked = data.picked.includes(optionId) ? data.picked.filter((id) => id !== optionId) : [...data.picked, optionId];
      else data.picked = [optionId];
      return true;
    },
    canConfirm: () => data.phase === 'answering' && data.picked.length > 0,
    /** Marks the answer: { correct, picked, answer }. A multiple-choice question is right only when exactly the right set was chosen. */
    confirm() {
      if (!api.canConfirm()) return null;
      const index = currentIndex();
      const picked = [...data.picked].sort((a, b) => a - b);
      const answer = correctSet(index);
      const correct = sameSet(picked, answer);
      data.results[index] = { picked, correct };
      data.phase = 'checked';
      return { correct, picked, answer };
    },
    /** What was answered on the question on screen (only after it is marked). */
    result() {
      const answered = data.results[currentIndex()];
      return data.phase === 'answering' || !answered ? null : { correct: answered.correct, picked: [...answered.picked], answer: correctSet(currentIndex()) };
    },
    isLast: () => data.pos === data.order.length - 1,
    /** To the next question, or to the end after the last one. */
    next() {
      if (data.phase !== 'checked') return false;
      if (api.isLast()) {
        data.phase = 'done';
        return true;
      }
      data.pos += 1;
      data.phase = 'answering';
      data.picked = [];
      return true;
    },
    /** The progress bar: one entry per question of the round, 'right', 'miss', 'now' or 'todo'. */
    steps: () => data.order.map((index, position) => {
      const answered = data.results[index];
      if (answered) return answered.correct ? 'right' : 'miss';
      return position === data.pos && data.phase !== 'done' ? 'now' : 'todo';
    }),
    score() {
      const missed = data.order.filter((index) => data.results[index] && !data.results[index].correct);
      const right = data.order.filter((index) => data.results[index]?.correct).length;
      return { right, total: data.order.length, missed, perfect: missed.length === 0 && right === data.order.length };
    },
    round: () => data.round,
    /** A new round with only the questions that were missed (in a new order, options shuffled again). */
    retryMissed() {
      const { missed } = api.score();
      if (data.phase !== 'done' || !missed.length) return false;
      const round = data.round + 1;
      data = freshRound(shuffled(missed, random));
      data.round = round;
      return true;
    },
    /** Everything again, questions in a new order. */
    restart() {
      data = freshRound(shuffled(questions.map((_, index) => index), random));
      return true;
    },
    state: () => JSON.parse(JSON.stringify(data))
  };
  return api;
}
