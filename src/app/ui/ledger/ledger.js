// A live step list for work the AI does in the background (Python runs, the
// visual check), shown inside the message it belongs to, the way chat
// products show tool use: one line per step with a status mark, the step in
// progress shimmering with its running time, finished steps folded to a line
// that opens to what happened. The same rows serve every kind of work.

import { setCollapsed, softChange } from '../motion/collapse-motion.js';
import { pinToEnd } from '../motion/reader-scroll-guard.js';

const element = (document, name, className, text) => {
  const node = document.createElement(name);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const MARKS = Object.freeze({ running: '', done: '✓', failed: '✕', pending: '' });

/** 4s, 1:05: nothing for the first seconds, so quick steps stay quiet. */
export function formatElapsed(milliseconds, { always = false } = {}) {
  const seconds = Math.floor(milliseconds / 1000);
  if (seconds < 3 && !always) return '';
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * `host` is the element the list is put into (the message); with `before` it
 * goes in front of that child.
 */
export function createLedger({ document, host, before = null }) {
  const window = document.defaultView;
  const root = element(document, 'div', 'ledger');
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');
  const list = element(document, 'div', 'ledger-list');
  root.append(list);
  if (before && before.parentNode === host) host.insertBefore(root, before);
  else host.append(root);

  const rows = [];
  // One clock for every running row.
  const tick = () => rows.forEach((row) => row.draw());
  const timer = window?.setInterval?.(tick, 1000);
  let gone = false;

  // `kind` (thought, code, file) gives the row its own icon in front of the label, the way chat products draw
  // each kind of step, instead of a tick.
  function addRow(label, { body = false, kind = '' } = {}) {
    const node = element(document, 'div', 'ledger-row is-running');
    const head = element(document, 'div', 'ledger-row-head');
    const mark = element(document, 'span', kind ? 'ledger-mark run-icon' : 'ledger-mark');
    if (kind) node.dataset.kind = kind;
    const text = element(document, 'span', 'ledger-label', label);
    const time = element(document, 'span', 'ledger-time');
    head.append(mark, text, time);
    const detail = element(document, 'div', 'ledger-detail');
    detail.hidden = true;
    const content = element(document, 'div', 'ledger-body');
    content.hidden = true;
    node.append(head, detail, content);
    list.append(node);

    const startedAt = Date.now();
    let state = 'running';
    let finishedAt = null;
    let expandable = body;
    let open = false;
    let bodyChosen = false;
    let bodyShown = false;
    let painted = false;
    // The clock redraws every second: only what changed is touched, so a tap on the row is not taken for a hover
    // on iPhone (see patch-html.js).
    const jumpToEnd = (part) => {
      const scrollToEnd = () => part.querySelectorAll('.ledger-thought, .ledger-code, .ledger-output').forEach(pinToEnd);
      scrollToEnd();
      window?.requestAnimationFrame?.(scrollToEnd);
    };
    const setText = (target, value) => { if (target.textContent !== value) target.textContent = value; };
    const draw = () => {
      setText(mark, kind ? '' : MARKS[state]);
      ['running', 'done', 'failed', 'pending'].forEach((name) => {
        if (node.classList.contains(`is-${name}`) !== (name === state)) node.classList.toggle(`is-${name}`, name === state);
      });
      setText(time, formatElapsed((finishedAt ?? Date.now()) - startedAt));
      if (head.classList.contains('is-expandable') !== expandable) head.classList.toggle('is-expandable', expandable);
      const expanded = expandable ? String(open) : 'false';
      if (head.getAttribute('aria-expanded') !== expanded) head.setAttribute('aria-expanded', expanded);
      // A body opens and closes with a short ease, once the row is on screen.
      const showBody = expandable && open;
      if (showBody !== bodyShown) {
        bodyShown = showBody;
        setCollapsed(content, showBody, { animate: painted });
        // Opened again, the thinking (or code) shows its newest end, not where it was left when it was folded.
        if (showBody && painted) jumpToEnd(content);
      }
      painted = true;
    };
    head.addEventListener('click', () => {
      if (!expandable) return;
      open = !open;
      draw();
    });

    const row = {
      node,
      body: content,
      draw,
      get state() { return state; },
      get label() { return text.textContent; },
      // A small button at the end of the row (stopping the work).
      addAction(labelText, handler) {
        const button = element(document, 'button', 'ledger-action', labelText);
        button.type = 'button';
        button.addEventListener('click', (event) => {
          event.stopPropagation();
          handler();
        });
        head.append(button);
      },
      setLabel(value) {
        if (text.textContent === value) return;
        text.textContent = value;
        softChange(text);
      },
      setDetail(value) {
        detail.textContent = value || '';
        detail.hidden = !value;
      },
      // A row with something to show opens to it; `open` says whether it starts open.
      // Only the first call chooses whether the body starts open; later calls (more content arriving in it) leave
      // whatever the reader has done with the row.
      enableBody(startOpen = true) {
        expandable = true;
        if (!bodyChosen) {
          bodyChosen = true;
          open = startOpen;
        }
        draw();
      },
      setOpen(value) {
        open = Boolean(value);
        draw();
      },
      // The row was for something that came to nothing (a search that found no pages).
      discard() {
        node.remove();
        const index = rows.indexOf(row);
        if (index >= 0) rows.splice(index, 1);
      },
      // The work went on after the row was called done: it runs again, its clock with it.
      resume() {
        if (state === 'running') return;
        state = 'running';
        finishedAt = null;
        draw();
      },
      finish(next = 'done') {
        if (state !== 'running') return;
        state = next;
        finishedAt = Date.now();
        detail.hidden = true;
        draw();
      }
    };
    rows.push(row);
    draw();
    return row;
  }

  return {
    element: root,
    list,
    addRow,
    get rows() { return rows; },
    // The row in progress, if any.
    get current() { return [...rows].reverse().find((row) => row.state === 'running') || null; },
    // Folds the rows that are done, so the newest is the one open.
    foldFinished() { rows.filter((row) => row.state !== 'running').forEach((row) => row.setOpen(false)); },
    remove() {
      if (gone) return;
      gone = true;
      if (timer) window.clearInterval(timer);
      root.remove();
    }
  };
}
