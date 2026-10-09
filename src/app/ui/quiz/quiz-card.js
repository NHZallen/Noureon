// The card of a quiz a model wrote (docs/superpowers/specs/2026-10-09-quiz-card-design.md): the quiz-maker skill has the model put choice questions in a ```quiz block, and the
// chat shows it as this card. One question at a time; the answer is chosen, then checked, and a band at the bottom of the card says what it was and why. The words come from
// quiz-texts.js, what happens from quiz-engine.js. A block that is not a good quiz (yet) is shown as the text it is, with the reason. Loaded when the first card is on the page.

import { parseQuiz } from '../../../data/quiz-schema.js';
import { createQuizSession } from '../../runtime/quiz/quiz-engine.js';
import { quizText } from './quiz-texts.js';

const svg = (body, fill = false) => `<svg class="quiz-ico${fill ? ' is-fill' : ''}" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
const ICONS = {
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  x: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  arrow: svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  bulb: svg('<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>')
};

/** The text a placeholder carries ('' when it cannot be read). */
export function quizOf(element) {
  try {
    return decodeURIComponent(element?.dataset?.quiz || '');
  } catch {
    return '';
  }
}

// What a person has answered, kept while the page is open so that a card drawn again (the chat is drawn again for many reasons) is where it was left.
const memory = new Map();
export const memoryStore = {
  get: (key) => memory.get(key) || null,
  set: (key, state) => { memory.set(key, state); },
  clear: () => memory.clear()
};

const hashOf = (text) => {
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) hash = ((hash * 33) ^ text.charCodeAt(index)) >>> 0;
  return `${hash.toString(36)}-${text.length}`;
};

function builder(document) {
  return (tag, className, content) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  };
}

/** Shows the card of a good quiz in `element` and keeps it going. `onChange(state)` hears every step (what a person has answered). */
function mountCard({ element, quiz, session, language, onChange = () => {} }) {
  const document = element.ownerDocument;
  const make = builder(document);
  const t = (key, values) => quizText(language, key, values);
  const joiner = language === 'zh-TW' ? '、' : ', ';
  let hintFor = '';
  let showOthers = false;
  let focusKey = '';

  const icon = (name) => {
    const holder = make('span', 'quiz-icon');
    holder.innerHTML = ICONS[name];
    return holder.firstElementChild || holder;
  };
  const withIcon = (node, name, before = true) => {
    if (before) node.prepend(icon(name));
    else node.append(icon(name));
    return node;
  };
  const button = (className, label, onClick, key) => {
    const node = make('button', className, label);
    node.type = 'button';
    if (key) node.dataset.focus = key;
    node.addEventListener('click', onClick);
    return node;
  };
  const changed = () => onChange(session.state());

  const steps = () => {
    const done = session.phase() === 'done';
    const box = make('div', 'quiz-steps');
    box.setAttribute('aria-hidden', 'true');
    for (const step of session.steps()) {
      let kind = '';
      if (done) kind = step === 'right' ? 'is-right' : 'is-miss';
      else if (step !== 'todo') kind = 'is-done';
      box.append(make('i', kind));
    }
    return box;
  };

  const reasons = (view, result, only = null) => {
    const list = make('ol', 'quiz-reasons');
    for (const option of view.options) {
      if (only && !only(option)) continue;
      const picked = result?.picked.includes(option.id);
      const item = make('li', option.correct ? 'is-correct' : (picked ? 'is-picked' : ''));
      const letter = make('b', '', option.letter);
      const text = make('span', '', option.why || option.text);
      if (option.correct) text.append(make('em', '', t('quizRight')));
      else if (picked) text.append(make('em', '', t('quizYou')));
      item.append(letter, text);
      list.append(item);
    }
    return list;
  };

  const optionsList = (view, result) => {
    const list = make('ul', 'quiz-options');
    const picked = result ? result.picked : session.picked();
    for (const option of view.options) {
      const item = make('li', 'quiz-option');
      const row = make('button');
      row.type = 'button';
      row.dataset.option = String(option.id);
      row.dataset.focus = `option-${option.id}`;
      row.append(make('span', 'quiz-key', option.letter), make('span', 'quiz-option-text', option.text));
      if (result) {
        item.classList.add('is-locked');
        if (option.correct) item.classList.add('is-correct');
        else if (picked.includes(option.id)) item.classList.add('is-wrong');
        row.setAttribute('aria-disabled', 'true');
      } else {
        if (picked.includes(option.id)) item.classList.add('is-selected');
        row.setAttribute('aria-pressed', String(picked.includes(option.id)));
        row.addEventListener('click', () => {
          session.toggle(option.id);
          focusKey = `option-${option.id}`;
          changed();
          paint();
        });
      }
      item.append(row);
      list.append(item);
    }
    return list;
  };

  const band = (view, result) => {
    const box = make('div', `quiz-band ${result.correct ? 'is-correct' : 'is-wrong'}`);
    box.setAttribute('role', 'status');
    const verdict = make('p', 'quiz-verdict');
    const badge = make('span', 'quiz-badge');
    badge.append(icon(result.correct ? 'check' : 'x'));
    verdict.append(badge, document.createTextNode(t(result.correct ? 'quizCorrect' : 'quizWrong')));
    if (!result.correct) {
      const letters = view.options.filter((option) => option.correct).map((option) => option.letter).join(joiner);
      verdict.append(document.createTextNode(' '), make('small', '', t('quizAnswerIs', { letters })));
    }
    box.append(verdict);
    if (result.correct) {
      // The reasons of the right option(s) first; the others are one tap away.
      const right = view.options.filter((option) => option.correct);
      if (right.length === 1) {
        if (right[0].why) box.append(make('p', 'quiz-text', right[0].why));
      } else {
        box.append(reasons(view, result, (option) => option.correct));
      }
    } else {
      box.append(reasons(view, result));
    }
    if (view.explanation) box.append(make('p', 'quiz-label', t('quizExtra')), make('p', 'quiz-text', view.explanation));
    if (result.correct) {
      if (showOthers) box.append(reasons(view, result, (option) => !option.correct));
      if (view.options.some((option) => !option.correct)) {
        box.append(button('quiz-more', t(showOthers ? 'quizHideOthers' : 'quizShowOthers'), () => { showOthers = !showOthers; focusKey = 'more'; paint(); }, 'more'));
      }
    }
    const actions = make('div', 'quiz-actions');
    const next = button('quiz-primary', t(session.isLast() ? 'quizSeeResults' : 'quizNext'), () => { session.next(); showOthers = false; focusKey = 'first'; changed(); paint(); }, 'primary');
    withIcon(next, 'arrow', false);
    actions.append(next);
    box.append(actions);
    return box;
  };

  const questionCard = () => {
    const view = session.current();
    const result = session.result();
    const parts = [];
    const head = make('div', 'quiz-head');
    head.append(make('span', 'quiz-kicker', quiz.title || t('quizTitle')));
    const tools = make('span', 'quiz-tools');
    const hintKey = `${session.round()}-${view.index}`;
    if (!result && view.hint) {
      tools.append(withIcon(button('quiz-tool', t('quizHint'), () => { hintFor = hintFor === hintKey ? '' : hintKey; focusKey = 'hint'; paint(); }, 'hint'), 'bulb'));
    }
    head.append(tools);
    parts.push(head, steps());
    const body = make('div', 'quiz-body');
    body.append(make('p', 'quiz-question', view.text));
    if (!result && view.hint && hintFor === hintKey) {
      const hint = make('p', 'quiz-hint');
      hint.append(make('b', '', t('quizHintLabel')), make('span', '', view.hint));
      body.append(hint);
    }
    body.append(optionsList(view, result));
    parts.push(body);
    if (!result) {
      const dock = make('div', 'quiz-dock');
      dock.append(make('p', '', view.multi ? t('quizPickMany', { count: view.correctCount }) : t('quizOf', { n: view.number, total: view.total })));
      const confirm = button('quiz-primary', t('quizConfirm'), () => {
        if (session.confirm()) { focusKey = 'primary'; changed(); paint(); }
      }, 'primary');
      confirm.disabled = !session.canConfirm();
      dock.append(confirm);
      parts.push(dock);
    } else {
      parts.push(band(view, result));
    }
    return parts;
  };

  const doneCard = () => {
    const score = session.score();
    const head = make('div', 'quiz-head');
    const round = session.round() > 1 ? ` · ${t('quizRound', { n: session.round() })}` : '';
    head.append(make('span', 'quiz-kicker', `${t('quizDone')}${round}${quiz.title ? ` · ${quiz.title}` : ''}`));
    const body = make('div', 'quiz-body');
    const line = make('p', 'quiz-score');
    line.append(make('strong', '', `${score.right} / ${score.total}`), make('span', '', score.perfect ? t('quizAllRight') : t('quizScoreLine', { right: score.right })));
    body.append(line);
    if (!score.perfect) {
      const block = make('div', 'quiz-missed');
      block.append(make('p', 'quiz-label', t('quizMissed')));
      const list = make('ul', 'quiz-misses');
      for (const index of score.missed) {
        const item = make('li');
        item.append(make('b', '', t('quizQuestionN', { n: index + 1 })), make('span', '', quiz.questions[index].question));
        list.append(item);
      }
      block.append(list);
      body.append(block);
    }
    const dock = make('div', 'quiz-dock is-wrap');
    if (!score.perfect) {
      dock.append(button('quiz-primary', t('quizRetryMissed'), () => { session.retryMissed(); focusKey = 'first'; changed(); paint(); }, 'primary'));
      dock.append(button('quiz-quiet', t('quizRestart'), () => { session.restart(); focusKey = 'first'; changed(); paint(); }, 'restart'));
    } else {
      dock.append(button('quiz-primary', t('quizRestart'), () => { session.restart(); focusKey = 'first'; changed(); paint(); }, 'primary'));
    }
    return [head, steps(), body, dock];
  };

  function paint() {
    element.replaceChildren(...(session.phase() === 'done' ? doneCard() : questionCard()));
    element.dataset.phase = session.phase();
    if (!focusKey) return;
    const wanted = focusKey === 'first' ? element.querySelector('[data-option]') : element.querySelector(`[data-focus="${focusKey}"]`);
    focusKey = '';
    try {
      wanted?.focus?.({ preventScroll: true });
    } catch {
      // nothing to focus (a detached card)
    }
  }

  // The keyboard: the letters choose an option, Enter checks the answer or goes on (a button that has the focus takes Enter by itself).
  element.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const phase = session.phase();
    if (event.key === 'Enter' && event.target?.tagName !== 'BUTTON') {
      if (phase === 'answering' && session.confirm()) { focusKey = 'primary'; changed(); paint(); event.preventDefault(); }
      else if (phase === 'checked') { session.next(); showOthers = false; focusKey = 'first'; changed(); paint(); event.preventDefault(); }
      return;
    }
    if (phase !== 'answering' || event.key.length !== 1) return;
    const option = session.current().options.find((item) => item.letter === event.key.toUpperCase());
    if (!option) return;
    session.toggle(option.id);
    focusKey = `option-${option.id}`;
    changed();
    paint();
    event.preventDefault();
  });

  element.removeAttribute('role');
  paint();
  return { paint };
}

function plainCard({ element, text, language, reason }) {
  const document = element.ownerDocument;
  const make = builder(document);
  element.classList.add('is-invalid');
  const pre = make('pre', 'quiz-raw');
  pre.append(make('code', '', text.trim()));
  element.replaceChildren(pre, make('p', 'quiz-note', quizText(language, 'quizInvalid', { reason })));
}

/**
 * Makes the cards of the placeholders on the page (`div.quiz-card[data-quiz]`). A block that is still being written (cut off) is shown as "preparing" and tried again the next time;
 * a block that is not a quiz is shown as its text with the reason. `store` keeps what a person has answered ({ get(key), set(key, state) }); `random` is for the tests.
 */
export function hydrateQuizCards({ root, language, store = memoryStore, random = Math.random }) {
  const cards = [...(root?.querySelectorAll?.('.quiz-card[data-quiz]:not([data-ready])') || [])];
  for (const element of cards) {
    const text = quizOf(element);
    const parsed = parseQuiz(text);
    if (!parsed.ok && parsed.error === 'incomplete') {
      if (!element.classList.contains('is-preparing')) {
        element.classList.add('is-preparing');
        element.replaceChildren(Object.assign(element.ownerDocument.createElement('p'), { className: 'quiz-note', textContent: quizText(language, 'quizPreparing') }));
      }
      continue;
    }
    element.dataset.ready = '1';
    element.classList.remove('is-preparing');
    if (!parsed.ok) {
      plainCard({ element, text, language, reason: quizText(language, `quizErr_${parsed.error}`, { n: parsed.question || 1 }) });
      continue;
    }
    const key = hashOf(text);
    const session = createQuizSession(parsed.quiz, { state: store.get(key), random });
    mountCard({ element, quiz: parsed.quiz, session, language, onChange: (state) => store.set(key, state) });
  }
  return cards.length;
}
