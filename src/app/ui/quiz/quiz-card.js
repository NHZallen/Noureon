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
  bulb: svg('<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>'),
  expand: svg('<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>'),
  shrink: svg('<path d="M20 10h-6V4M4 14h6v6M14 10l7-7M3 21l7-7"/>'),
  more: svg('<circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/>', true),
  down: svg('<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>')
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
function mountCard({ element, quiz, session, language, onChange = () => {}, download = null }) {
  const document = element.ownerDocument;
  const make = builder(document);
  const t = (key, values) => quizText(language, key, values);
  const joiner = language === 'zh-TW' ? '、' : ', ';
  let hintFor = '';
  let showOthers = false;
  let focusKey = '';
  let menuOpen = ''; // '' (closed), 'head' or 'dock': where the menu of the files is open
  let expanded = false;
  let toast = '';
  let toastTimer = null;

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

  const showToast = (text, keepMs = 0) => {
    toast = text;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = keepMs ? setTimeout(() => { toast = ''; toastTimer = null; paint(); }, keepMs) : null;
    paint();
  };
  const runDownload = async (kindId) => {
    menuOpen = '';
    showToast(t('quizDownloading'));
    try {
      const { name, result } = await (download || ((options) => import('./quiz-export.js').then((module) => module.downloadQuizFile(options))))({ quiz, language, kindId, window: document.defaultView, document });
      showToast(result === 'needs-tap' ? t('quizTapAgain', { name }) : '', result === 'needs-tap' ? 6000 : 0);
    } catch (error) {
      showToast(t('quizDownloadFailed', { reason: String(error?.message || error) }), 8000);
    }
  };
  const menu = (place) => {
    const box = make('div', `quiz-menu is-${place}`);
    box.setAttribute('role', 'menu');
    const group = (title, hint, items) => {
      const heading = make('h4', '', title);
      if (hint) heading.append(document.createTextNode(' '), make('span', '', hint));
      box.append(heading);
      for (const [label, extension, kindId] of items) {
        const item = make('button');
        item.type = 'button';
        item.setAttribute('role', 'menuitem');
        item.append(make('span', '', label), make('small', '', extension));
        item.addEventListener('click', () => { void runDownload(kindId); });
        box.append(item);
      }
    };
    group(t('quizMenuPaper'), t('quizMenuPaperHint'), [['Word', '.docx', 'paper-docx'], ['PDF', '.pdf', 'paper-pdf']]);
    group(t('quizMenuKey'), t('quizMenuKeyHint'), [['Word', '.docx', 'key-docx'], ['PDF', '.pdf', 'key-pdf']]);
    group(t('quizMenuData'), t('quizMenuDataHint'), [['Excel', '.xlsx', 'sheet-xlsx'], ['CSV', '.csv', 'sheet-csv'], [t('quizFmtJson'), '.json', 'quiz-json']]);
    return box;
  };
  const toolsBox = (hintButton = null) => {
    const tools = make('span', 'quiz-tools');
    if (hintButton) tools.append(hintButton);
    const size = button('quiz-tool', '', () => { setExpanded(!expanded); }, 'expand');
    size.setAttribute('aria-label', t(expanded ? 'quizCollapse' : 'quizExpand'));
    size.setAttribute('aria-pressed', String(expanded));
    size.append(icon(expanded ? 'shrink' : 'expand'));
    const more = button('quiz-tool', '', () => { menuOpen = menuOpen === 'head' ? '' : 'head'; focusKey = 'more-tool'; paint(); }, 'more-tool');
    more.setAttribute('aria-label', t('quizMore'));
    more.setAttribute('aria-haspopup', 'menu');
    more.setAttribute('aria-expanded', String(menuOpen === 'head'));
    more.append(icon('more'));
    tools.append(size, more);
    if (menuOpen === 'head') tools.append(menu('head'));
    return tools;
  };

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
    const hintKey = `${session.round()}-${view.index}`;
    const hintButton = !result && view.hint
      ? withIcon(button('quiz-tool', t('quizHint'), () => { hintFor = hintFor === hintKey ? '' : hintKey; focusKey = 'hint'; paint(); }, 'hint'), 'bulb')
      : null;
    head.append(toolsBox(hintButton));
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
    head.append(make('span', 'quiz-kicker', `${t('quizDone')}${round}${quiz.title ? ` · ${quiz.title}` : ''}`), toolsBox());
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
    const wrap = make('span', 'quiz-menu-wrap');
    const downloadButton = button('quiz-quiet', t('quizDownload'), () => { menuOpen = menuOpen === 'dock' ? '' : 'dock'; focusKey = 'download'; paint(); }, 'download');
    downloadButton.setAttribute('aria-haspopup', 'menu');
    downloadButton.setAttribute('aria-expanded', String(menuOpen === 'dock'));
    downloadButton.prepend(icon('down'));
    if (menuOpen === 'dock') wrap.append(menu('dock'));
    wrap.append(downloadButton);
    dock.append(wrap);
    return [head, steps(), body, dock];
  };

  // The enlarged card is a copy of the card in a layer of its own on the page (a card inside the chat cannot cover the window itself); both show the same session.
  let overlay = null;
  const roots = () => (overlay ? [element, overlay.card] : [element]);

  function paintInto(root) {
    const parts = session.phase() === 'done' ? doneCard() : questionCard();
    if (toast) {
      const note = make('p', 'quiz-toast', toast);
      note.setAttribute('role', 'status');
      parts.push(note);
    }
    root.replaceChildren(...parts);
    root.dataset.phase = session.phase();
  }

  function paint() {
    for (const root of roots()) paintInto(root);
    if (!focusKey) return;
    const top = overlay ? overlay.card : element;
    const wanted = focusKey === 'first' ? top.querySelector('[data-option]') : top.querySelector(`[data-focus="${focusKey}"]`);
    focusKey = '';
    try {
      wanted?.focus?.({ preventScroll: true });
    } catch {
      // nothing to focus (a detached card)
    }
  }

  function setExpanded(value) {
    if (value === expanded) return;
    expanded = value;
    menuOpen = '';
    if (expanded) {
      const layer = make('div', 'quiz-overlay');
      const card = make('div', 'quiz-card is-expanded');
      card.setAttribute('role', 'dialog');
      card.setAttribute('aria-modal', 'true');
      card.setAttribute('aria-label', quiz.title || t('quizTitle'));
      card.addEventListener('keydown', onKey);
      layer.append(card);
      document.body.append(layer);
      overlay = { layer, card };
    } else {
      overlay?.layer.remove();
      overlay = null;
    }
    focusKey = 'expand';
    paint();
  }

  // The keyboard: the letters choose an option, Enter checks the answer or goes on (a button that has the focus takes Enter by itself), Escape closes the menu and then the enlarged card.
  function onKey(event) {
    if (event.key === 'Escape' && (menuOpen || expanded)) {
      if (menuOpen) {
        menuOpen = '';
        focusKey = 'expand';
        paint();
      } else {
        setExpanded(false);
      }
      event.preventDefault();
      return;
    }
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
  }
  element.addEventListener('keydown', onKey);

  // A tap outside the menu of the files closes it.
  document.addEventListener('pointerdown', (event) => {
    if (!menuOpen || !roots().some((root) => root.isConnected)) return;
    if (event.target?.closest?.('.quiz-menu, [data-focus="more-tool"], [data-focus="download"]')) return;
    menuOpen = '';
    paint();
  }, true);
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
 * a block that is not a quiz is shown as its text with the reason. `storeFor(element)` gives the store that keeps what a person has answered ({ get(key), set(key, state) }) for the
 * card in `element`, or null when the message it is in is not on the page yet (the card is left for the next time); `random` is for the tests.
 * `download` makes a file of the quiz and hands it over (the tests give their own; the page's own is in quiz-export.js).
 * Returns the number of cards that were looked at and are not waiting.
 */
export function hydrateQuizCards({ root, language, storeFor = () => memoryStore, random = Math.random, download = null }) {
  const cards = [...(root?.querySelectorAll?.('.quiz-card[data-quiz]:not([data-ready])') || [])];
  const skipped = new Set();
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
    element.classList.remove('is-preparing');
    if (!parsed.ok) {
      element.dataset.ready = '1';
      plainCard({ element, text, language, reason: quizText(language, `quizErr_${parsed.error}`, { n: parsed.question || 1 }) });
      continue;
    }
    element.dataset.ready = '1';
    const store = storeFor(element);
    if (!store) {
      delete element.dataset.ready;
      skipped.add(element);
      continue;
    }
    const key = hashOf(text);
    const session = createQuizSession(parsed.quiz, { state: store.get(key), random });
    mountCard({ element, quiz: parsed.quiz, session, language, onChange: (state) => store.set(key, state), download });
  }
  return cards.length - skipped.size;
}
