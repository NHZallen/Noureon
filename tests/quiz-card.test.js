import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { marked } from 'marked';
import { Window } from 'happy-dom';

import { createMarkdownRenderingHelpers } from '../src/app/runtime/legacy-core/markdown-rendering-helpers.js';
import { createQuizWatch } from '../src/app/runtime/quiz/quiz-watch.js';
import { hydrateQuizCards, memoryStore, quizOf } from '../src/app/ui/quiz/quiz-card.js';
import { QUIZ_TEXTS, quizText } from '../src/app/ui/quiz/quiz-texts.js';

const tick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

const QUIZ = JSON.stringify({
  title: 'Photosynthesis',
  questions: [
    { type: 'single', question: 'Where does the oxygen come from?', options: [{ text: 'Carbon dioxide', why: 'The carbon source.' }, { text: 'Water', why: 'Water is split by light.' }, { text: 'Glucose', why: 'A product, not a source.' }, { text: 'Chlorophyll', why: 'A pigment.' }], answer: 1, explanation: 'Shown in 1941 with heavy oxygen.', hint: 'Think of what the light splits.' },
    { type: 'multi', question: 'Which are gases?', options: [{ text: 'Oxygen', why: 'A gas.' }, { text: 'Iron', why: 'A metal.' }, { text: 'Nitrogen', why: 'A gas.' }], answer: [0, 2], explanation: '' },
    { type: 'truefalse', question: 'Plants make oxygen.', options: [{ text: 'True', why: 'They do.' }, { text: 'False', why: 'They do.' }], answer: 0, explanation: 'Also water vapour.' }
  ]
});

function page(markdown = `Here is a quiz:\n\n\`\`\`quiz\n${QUIZ}\n\`\`\`\n\nAnd code:\n\n\`\`\`python\nprint(1)\n\`\`\`\n`) {
  const window = new Window({ url: 'https://example.test/' });
  class BrowserLikeDOMParser {
    parseFromString(html) {
      const parsed = window.document.implementation.createHTMLDocument('');
      const body = /^<body>([\s\S]*)<\/body>$/.exec(html);
      parsed.body.innerHTML = body ? body[1] : html;
      return parsed;
    }
  }
  const helpers = createMarkdownRenderingHelpers({ marked, sanitizer: { sanitize: (html) => html }, DOMParser: BrowserLikeDOMParser, katex: { renderToString: () => '' }, getUiLanguage: () => 'en', getText: (key, fallback) => fallback ?? key, escapeHTML: (value) => String(value) });
  window.document.body.innerHTML = helpers.renderMarkdown(markdown);
  return { window, document: window.document };
}

// The random generator of the engine cannot be chosen from the card, so the tests pick the option by what it says.
const optionByText = (card, text) => [...card.querySelectorAll('[data-option]')].find((button) => button.textContent.includes(text));
const click = (node) => node.dispatchEvent(new node.ownerDocument.defaultView.MouseEvent('click', { bubbles: true }));
const key = (node, name) => node.dispatchEvent(new node.ownerDocument.defaultView.KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }));
const primary = (card) => card.querySelector('[data-focus="primary"]');

test('a ```quiz block in an answer becomes a placeholder that carries it; other code blocks stay', () => {
  const { document } = page();
  const cards = document.querySelectorAll('div.quiz-card[data-quiz]');
  assert.equal(cards.length, 1);
  assert.equal(JSON.parse(quizOf(cards[0])).title, 'Photosynthesis');
  assert.equal(document.querySelectorAll('pre > code.language-quiz').length, 0);
  assert.equal(document.querySelectorAll('pre > code.language-python').length, 1);
});

test('the card shows one question with the options in a row, and "Check" waits for a choice', () => {
  memoryStore.clear();
  const { document } = page();
  assert.equal(hydrateQuizCards({ root: document, language: 'en' }), 1);
  const card = document.querySelector('.quiz-card');
  assert.equal(card.dataset.ready, '1');
  assert.equal(card.querySelector('.quiz-question').textContent, 'Where does the oxygen come from?');
  assert.equal(card.querySelectorAll('[data-option]').length, 4);
  assert.deepEqual([...card.querySelectorAll('.quiz-key')].map((node) => node.textContent), ['A', 'B', 'C', 'D']);
  assert.equal(card.querySelectorAll('.quiz-steps i').length, 3);
  assert.equal(primary(card).disabled, true, 'nothing chosen yet');
  assert.equal(card.querySelector('.quiz-band'), null, 'the answer is not shown before it is given');
  assert.equal(card.textContent.includes('Water is split by light.'), false, 'neither is a reason');
  assert.equal(card.textContent.includes('Shown in 1941'), false);
  // Choosing marks the option and lets the person check.
  const water = optionByText(card, 'Water');
  click(water);
  assert.equal(card.querySelector('.is-selected')?.textContent.includes('Water'), true);
  assert.equal(optionByText(card, 'Water').getAttribute('aria-pressed'), 'true');
  assert.equal(primary(card).disabled, false);
  click(optionByText(card, 'Glucose'));
  assert.equal(card.querySelectorAll('.is-selected').length, 1, 'a single-choice question keeps one');
});

test('a right answer: the band says so, gives why and what is good to know, and the other options are one tap away', () => {
  memoryStore.clear();
  const { document } = page();
  hydrateQuizCards({ root: document, language: 'en' });
  const card = document.querySelector('.quiz-card');
  click(optionByText(card, 'Water'));
  click(primary(card));
  const band = card.querySelector('.quiz-band');
  assert.ok(band.classList.contains('is-correct'));
  assert.match(band.querySelector('.quiz-verdict').textContent, /Correct/);
  assert.match(band.textContent, /Water is split by light\./);
  assert.match(band.textContent, /Good to know/);
  assert.match(band.textContent, /Shown in 1941 with heavy oxygen\./);
  assert.equal(band.querySelector('.quiz-reasons'), null, 'the other options are not shown yet');
  assert.ok(optionByText(card, 'Water').closest('.quiz-option').classList.contains('is-correct'));
  assert.equal(card.querySelector('.is-wrong'), null);
  assert.equal(card.querySelector('[data-focus="hint"]'), null, 'no hint once it is answered');
  click(card.querySelector('.quiz-more'));
  const others = card.querySelector('.quiz-reasons');
  assert.ok(others);
  assert.equal(others.textContent.includes('A pigment.'), true);
  assert.equal(others.textContent.includes('Water is split by light.'), false, 'only the other options');
  click(card.querySelector('.quiz-more'));
  assert.equal(card.querySelector('.quiz-reasons'), null);
});

test('a wrong answer: every option has its reason, the right and the chosen ones are marked, and what is good to know follows', () => {
  memoryStore.clear();
  const { document } = page();
  hydrateQuizCards({ root: document, language: 'en' });
  const card = document.querySelector('.quiz-card');
  click(optionByText(card, 'Glucose'));
  click(primary(card));
  const band = card.querySelector('.quiz-band');
  assert.ok(band.classList.contains('is-wrong'));
  assert.match(band.querySelector('.quiz-verdict').textContent, /Not quite/);
  assert.match(band.querySelector('.quiz-verdict').textContent, /The answer is [A-D]/);
  const items = [...band.querySelectorAll('.quiz-reasons li')];
  assert.equal(items.length, 4);
  assert.equal(band.querySelectorAll('.quiz-reasons li.is-correct').length, 1);
  assert.equal(band.querySelector('.quiz-reasons li.is-correct').textContent.includes('Water is split by light.'), true);
  assert.equal(band.querySelector('.quiz-reasons li.is-picked').textContent.includes('A product, not a source.'), true);
  assert.match(band.querySelector('.quiz-reasons li.is-picked').textContent, /Your choice/);
  assert.match(band.querySelector('.quiz-reasons li.is-correct').textContent, /Correct answer/);
  assert.match(band.textContent, /Shown in 1941 with heavy oxygen\./, 'what is good to know is shown for a wrong answer too');
  assert.ok(optionByText(card, 'Glucose').closest('.quiz-option').classList.contains('is-wrong'));
  assert.ok(optionByText(card, 'Water').closest('.quiz-option').classList.contains('is-correct'));
  assert.equal(band.querySelector('.quiz-more'), null, 'everything is already shown');
  // An answered question cannot be changed.
  click(optionByText(card, 'Carbon'));
  assert.ok(optionByText(card, 'Glucose').closest('.quiz-option').classList.contains('is-wrong'));
});

test('a whole quiz: the hint, a multiple-choice question that needs the exact set, the score, "redo the missed" and "start again"', () => {
  memoryStore.clear();
  const { document } = page();
  hydrateQuizCards({ root: document, language: 'en' });
  const card = document.querySelector('.quiz-card');
  // The hint opens and closes.
  click(card.querySelector('[data-focus="hint"]'));
  assert.match(card.querySelector('.quiz-hint').textContent, /Think of what the light splits\./);
  click(card.querySelector('[data-focus="hint"]'));
  assert.equal(card.querySelector('.quiz-hint'), null);
  click(optionByText(card, 'Water')); click(primary(card)); click(primary(card));
  // Question 2 (multiple choice): one right option is not enough.
  assert.match(card.querySelector('.quiz-dock p').textContent, /Choose 2 correct answers/);
  click(optionByText(card, 'Oxygen'));
  click(primary(card));
  assert.ok(card.querySelector('.quiz-band').classList.contains('is-wrong'));
  assert.equal(card.querySelectorAll('.quiz-reasons li.is-correct').length, 2);
  click(primary(card));
  // Question 3 (true or false), the last one: the button says "See results".
  click(optionByText(card, 'True'));
  click(primary(card));
  assert.equal(primary(card).textContent.trim(), 'See results');
  click(primary(card));
  assert.equal(card.dataset.phase, 'done');
  assert.match(card.querySelector('.quiz-score').textContent, /2 \/ 3/);
  assert.equal(card.querySelectorAll('.quiz-steps i.is-right').length, 2);
  assert.equal(card.querySelectorAll('.quiz-steps i.is-miss').length, 1);
  assert.deepEqual([...card.querySelectorAll('.quiz-misses li')].map((item) => item.textContent), ['Question 2Which are gases?']);
  // Redo only the missed question.
  click(primary(card));
  assert.equal(card.dataset.phase, 'answering');
  assert.equal(card.querySelector('.quiz-question').textContent, 'Which are gases?');
  assert.equal(card.querySelectorAll('.quiz-steps i').length, 1);
  click(optionByText(card, 'Oxygen')); click(optionByText(card, 'Nitrogen')); click(primary(card));
  assert.ok(card.querySelector('.quiz-band').classList.contains('is-correct'));
  click(primary(card));
  assert.match(card.querySelector('.quiz-score').textContent, /1 \/ 1/);
  assert.match(card.querySelector('.quiz-score').textContent, /All correct!/);
  assert.equal(card.querySelector('.quiz-misses'), null);
  assert.match(card.querySelector('.quiz-kicker').textContent, /Round 2/);
  // Start again: everything, a fresh bar.
  click(primary(card));
  assert.equal(card.dataset.phase, 'answering');
  assert.equal(card.querySelectorAll('.quiz-steps i').length, 3);
});

test('the keyboard: a letter chooses, Enter checks and goes on; a typed key outside the card is not taken', () => {
  memoryStore.clear();
  const { document } = page();
  hydrateQuizCards({ root: document, language: 'en' });
  const card = document.querySelector('.quiz-card');
  const first = card.querySelector('[data-option]');
  key(first, 'b');
  assert.equal(card.querySelectorAll('.is-selected').length, 1);
  assert.equal(card.querySelector('.is-selected .quiz-key').textContent, 'B');
  key(card.querySelector('.quiz-question'), 'Enter');
  assert.ok(card.querySelector('.quiz-band'), 'Enter checked the answer');
  key(card.querySelector('.quiz-question'), 'Enter');
  assert.equal(card.querySelector('.quiz-question').textContent, 'Which are gases?', 'and went on');
  key(card.querySelector('.quiz-question'), 'z');
  assert.equal(card.querySelectorAll('.is-selected').length, 0, 'a letter that is no option does nothing');
  const ctrl = new document.defaultView.KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true, cancelable: true });
  card.querySelector('[data-option]').dispatchEvent(ctrl);
  assert.equal(card.querySelectorAll('.is-selected').length, 0, 'a shortcut of the browser is left alone');
});

test('a card drawn again is where it was left, and what is answered goes to the store', () => {
  memoryStore.clear();
  const saved = [];
  const store = { get: (name) => memoryStore.get(name), set: (name, state) => { saved.push(name); memoryStore.set(name, state); } };
  const first = page();
  hydrateQuizCards({ root: first.document, language: 'en', storeFor: () => store });
  let card = first.document.querySelector('.quiz-card');
  click(optionByText(card, 'Glucose'));
  click(primary(card));
  assert.ok(saved.length >= 2);
  // The same block drawn again (a new placeholder): the answered question and the order of the options are back.
  const again = page();
  hydrateQuizCards({ root: again.document, language: 'en', storeFor: () => store });
  card = again.document.querySelector('.quiz-card');
  assert.ok(card.querySelector('.quiz-band.is-wrong'));
  assert.ok(optionByText(card, 'Glucose').closest('.quiz-option').classList.contains('is-wrong'));
  assert.equal(card.querySelector('.quiz-question').textContent, 'Where does the oxygen come from?');
});

test('a block still being written shows "preparing" and is made into a card once it is whole; a block that is not a quiz shows its text and why', () => {
  memoryStore.clear();
  const cut = page(`\`\`\`quiz\n${QUIZ.slice(0, 120)}\n\`\`\``);
  assert.equal(hydrateQuizCards({ root: cut.document, language: 'en' }), 1);
  let card = cut.document.querySelector('.quiz-card');
  assert.ok(card.classList.contains('is-preparing'));
  assert.match(card.textContent, /Preparing the quiz/);
  assert.equal(card.dataset.ready, undefined, 'tried again next time');
  card.dataset.quiz = encodeURIComponent(QUIZ);
  hydrateQuizCards({ root: cut.document, language: 'en' });
  assert.equal(card.classList.contains('is-preparing'), false);
  assert.ok(card.querySelector('.quiz-question'));

  const bad = page('```quiz\nsome questions here\n```');
  hydrateQuizCards({ root: bad.document, language: 'en' });
  card = bad.document.querySelector('.quiz-card');
  assert.ok(card.classList.contains('is-invalid'));
  assert.equal(card.querySelector('.quiz-raw').textContent, 'some questions here');
  assert.match(card.querySelector('.quiz-note').textContent, /not valid JSON/);
  assert.equal(card.dataset.ready, '1');

  const wrongAnswer = page(`\`\`\`quiz\n${JSON.stringify({ questions: [{ question: 'Q', options: [{ text: 'a' }, { text: 'b' }], answer: 5 }] })}\n\`\`\``);
  hydrateQuizCards({ root: wrongAnswer.document, language: 'zh-TW' });
  assert.match(wrongAnswer.document.querySelector('.quiz-note').textContent, /第 1 題的答案不對/);
});

test('the card is made by the watcher when a placeholder appears on the page, and not before', async () => {
  memoryStore.clear();
  const { window, document } = page('No quiz here.');
  const warnings = [];
  createQuizWatch({ document, getUiLanguage: () => 'fr', logger: { warn: (...args) => warnings.push(args) } });
  await tick();
  assert.equal(document.querySelectorAll('.quiz-card').length, 0);
  const holder = document.createElement('div');
  holder.innerHTML = `<div class="quiz-card" data-quiz="${encodeURIComponent(QUIZ)}"></div>`;
  document.body.append(holder);
  await tick(150);
  const card = document.querySelector('.quiz-card');
  assert.ok(card.querySelector('.quiz-question'), warnings.map(String).join());
  assert.equal(card.querySelector('.quiz-primary').textContent.trim(), 'Valider', 'in the language of the page');
  window.close?.();
});

test('the words are in all five languages with the same keys, and the placeholders are the same in each', () => {
  const english = Object.keys(QUIZ_TEXTS.en);
  for (const language of ['zh-TW', 'fr', 'ru', 'es']) {
    assert.deepEqual(Object.keys(QUIZ_TEXTS[language]), english, language);
    for (const name of english) {
      const holes = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort().join();
      assert.equal(holes(QUIZ_TEXTS[language][name]), holes(QUIZ_TEXTS.en[name]), `${language} ${name}`);
    }
  }
  assert.equal(quizText('zh-TW', 'quizOf', { n: 2, total: 5 }), '第 2 題，共 5 題');
  assert.equal(quizText('xx', 'quizNext'), 'Next', 'a language it does not know falls back to English');
});

test('the stylesheet writes no colour of its own: only the names of tokens.css', () => {
  const css = readFileSync(new URL('../src/app/ui/quiz/quiz-card.css', import.meta.url), 'utf8');
  assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(css), false, 'a hex colour');
  assert.equal(/\brgba?\(|\bhsla?\(/.test(css), false, 'rgb() or hsl()');
  assert.equal(/!important/.test(css), false);
  assert.match(css, /var\(--state-success\)/);
  assert.match(css, /var\(--gpt-primary-action-bg\)/);
});
