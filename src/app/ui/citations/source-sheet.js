// The sheet that rises from the bottom with a list of sources: from a label that cites several ("2 sources", with a
// close button) and from the "Sources" button under a reply on a phone (all of them, headed "Sources", which can be
// pulled up to nearly the whole screen). It closes with its button, a tap outside it, the Escape key or by pulling it down.

import { sandboxText } from '../../runtime/sandbox/sandbox-texts.js';
import { trackPointedRow } from '../scroll/pointed-row.js';
import { fillSourceList } from './source-list.js';

const CLOSE_DISTANCE = 110;
const EXPAND_DISTANCE = 60;
const FAST = 0.6;

/**
 * What a drag of the sheet's handle ends in. `dy` is how far it went down (negative: up), `speed` how fast (px per ms,
 * the same sign). 'large' and 'medium' are the two heights of a sheet that can be pulled up; a sheet that cannot is only
 * ever closed or left.
 */
export function decideSheetDrag({ state = 'medium', dy = 0, speed = 0, expandable = false }) {
  const down = dy > CLOSE_DISTANCE || speed > FAST;
  const up = dy < -EXPAND_DISTANCE || speed < -FAST;
  if (down) return expandable && state === 'large' ? 'medium' : 'close';
  if (up && expandable) return 'large';
  return state;
}

let current = null;

/** Closes the sheet that is open, if any. */
export function closeSourceSheet() {
  current?.close();
}

/**
 * Opens a sheet. `all`: the "Sources" sheet of a whole reply (otherwise the sheet of one label: its count and a close button).
 * Returns { close, element }.
 */
export function openSourceSheet({ document, sources, all = false, language = 'zh-TW', onClose = () => {} }) {
  closeSourceSheet();
  const win = document.defaultView;
  const opener = document.activeElement;
  const root = document.createElement('div');
  root.className = 'source-sheet-root';
  const backdrop = document.createElement('div');
  backdrop.className = 'source-sheet-backdrop';
  const sheet = document.createElement('div');
  sheet.className = `source-sheet${all ? ' is-all' : ''}`;
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  const title = all ? sandboxText(language, 'sourcesTab') : sandboxText(language, 'citeSources', { n: sources.length });
  sheet.setAttribute('aria-label', title);
  const grip = document.createElement('div');
  grip.className = 'source-sheet-grip';
  const head = document.createElement('div');
  head.className = 'source-sheet-head';
  const heading = document.createElement('div');
  heading.className = 'source-sheet-title';
  heading.textContent = title;
  head.append(heading);
  let closeButton = null;
  if (!all) {
    closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'source-sheet-close';
    closeButton.setAttribute('aria-label', sandboxText(language, 'closePanel'));
    closeButton.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    head.append(closeButton);
  }
  const list = document.createElement('div');
  list.className = 'source-sheet-list';
  fillSourceList(list, sources, { language });
  trackPointedRow(list, '.source-item');
  sheet.append(grip, head, list);
  root.append(backdrop, sheet);
  document.body.append(root);
  document.documentElement.classList.add('source-sheet-open');

  let closed = false;
  let state = 'medium';
  const setState = (next) => {
    state = next;
    sheet.classList.toggle('is-large', state === 'large');
  };
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey, true);
    document.documentElement.classList.remove('source-sheet-open');
    root.classList.remove('is-open');
    const remove = () => root.remove();
    // Let it sink before it goes (no transition: it goes at once).
    if (win?.matchMedia?.('(prefers-reduced-motion: reduce)').matches) remove();
    else { sheet.addEventListener('transitionend', remove, { once: true }); win?.setTimeout?.(remove, 320); }
    if (current === api) current = null;
    try { opener?.focus?.({ preventScroll: true }); } catch { /* the opener is gone */ }
    onClose();
  };
  const onKey = (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
    }
  };
  document.addEventListener('keydown', onKey, true);
  backdrop.addEventListener('click', close);
  closeButton?.addEventListener('click', close);

  // Pulling the handle or the heading: the sheet follows the finger (only moved, never laid out again), and settles where
  // `decideSheetDrag` says. The whole-reply sheet cannot be pulled higher than its large height.
  let drag = null;
  let frame = 0;
  const paint = () => {
    frame = 0;
    if (drag) sheet.style.setProperty('--sheet-drag', `${drag.shown}px`);
  };
  const pointerDown = (event) => {
    if (event.button !== undefined && event.button > 0) return;
    const rest = all ? Math.max(0, sheet.getBoundingClientRect().top - (root.getBoundingClientRect().height - sheet.offsetHeight)) : 0;
    drag = { y: event.clientY, at: Date.now(), dy: 0, shown: 0, rest, pointer: event.pointerId };
    sheet.classList.add('is-dragging');
    try { event.target.setPointerCapture?.(event.pointerId); } catch { /* no capture */ }
  };
  const pointerMove = (event) => {
    if (!drag || event.pointerId !== drag.pointer) return;
    drag.dy = event.clientY - drag.y;
    // Up is stopped where the large sheet ends (a little give past it); a sheet that does not grow does not go up.
    const limit = all ? -drag.rest : 0;
    drag.shown = drag.dy < limit ? limit + (drag.dy - limit) * 0.15 : drag.dy;
    if (win?.requestAnimationFrame) { if (!frame) frame = win.requestAnimationFrame(paint); } else paint();
  };
  const pointerUp = (event) => {
    if (!drag || (event.pointerId !== undefined && event.pointerId !== drag.pointer)) return;
    const elapsed = Math.max(1, Date.now() - drag.at);
    const outcome = decideSheetDrag({ state, dy: drag.dy, speed: drag.dy / elapsed, expandable: all });
    drag = null;
    if (frame) { win?.cancelAnimationFrame?.(frame); frame = 0; }
    sheet.classList.remove('is-dragging');
    sheet.style.removeProperty('--sheet-drag');
    if (outcome === 'close') close();
    else setState(outcome);
  };
  for (const handle of [grip, head]) {
    handle.addEventListener('pointerdown', pointerDown);
    handle.addEventListener('pointermove', pointerMove);
    handle.addEventListener('pointerup', pointerUp);
    handle.addEventListener('pointercancel', pointerUp);
  }

  const api = { close, element: root };
  current = api;
  // One frame later, so it rises instead of appearing.
  (win?.requestAnimationFrame || ((callback) => callback()))(() => {
    root.classList.add('is-open');
    (closeButton || sheet).focus?.({ preventScroll: true });
  });
  sheet.tabIndex = -1;
  return api;
}
