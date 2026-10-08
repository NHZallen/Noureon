// Dictating in the composer, after ChatGPT's: the whole composer row gives way to a bar with the
// attach mark dimmed at the left, a waveform of how loud the voice is (a dotted line that bars grow
// along from the right as you speak), a cross to throw the dictation away and a tick to finish. The
// tick becomes a turning ring while the text is being made. Enter finishes, Escape cancels.

import { openMicLevel } from './mic-level.js';
import { dictationText } from './dictation-texts.js';

const STEP_MS = 55;
const BAR_WIDTH = 3;
const BAR_GAP = 3;
const DOT_GAP = 6;
const LEAVE_MS = 170;
const MAX_HISTORY = 400;

const ICONS = Object.freeze({
  plus: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>',
  cancel: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
  confirm: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>'
});

/** The loudness readings kept for the waveform: newest last, and only what can be drawn. */
export function createWaveformHistory(limit = MAX_HISTORY) {
  const levels = [];
  return {
    push(level) {
      const clean = Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 0;
      // A little smoothing, so the bars rise and fall instead of flickering.
      const previous = levels.length ? levels[levels.length - 1] : clean;
      levels.push(previous * 0.35 + clean * 0.65);
      if (levels.length > limit) levels.shift();
    },
    get levels() { return levels; },
    /** The bars that fit in `width`, newest at the right edge: [{ x, height }] with height 0..1. */
    bars(width) {
      const fit = Math.max(0, Math.floor(width / (BAR_WIDTH + BAR_GAP)));
      const shown = levels.slice(-fit);
      return shown.map((level, index) => ({ x: width - (shown.length - index) * (BAR_WIDTH + BAR_GAP) + BAR_GAP, height: level }));
    }
  };
}

const element = (document, tag, className) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
};

/**
 * Puts the dictation bar over `host` (the composer). `onConfirm` and `onCancel` are called from the
 * ✓ and ✕ buttons and from Enter and Escape. Returns { setBusy(bool), close() }.
 */
export function openDictation({ document, window, navigator, host, language = 'zh-TW', onConfirm = () => {}, onCancel = () => {} }) {
  if (!host || typeof host.append !== 'function') return null;
  const text = (key) => dictationText(language, key);
  const root = element(document, 'div', 'dictation-bar');
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', text('listening'));
  const plus = element(document, 'span', 'dictation-plus');
  plus.setAttribute('aria-hidden', 'true');
  plus.innerHTML = ICONS.plus;
  const canvas = element(document, 'canvas', 'dictation-wave');
  canvas.setAttribute('aria-hidden', 'true');
  const cancel = element(document, 'button', 'dictation-cancel');
  cancel.type = 'button';
  cancel.setAttribute('aria-label', text('cancel'));
  cancel.title = text('cancel');
  cancel.innerHTML = ICONS.cancel;
  const confirm = element(document, 'button', 'dictation-confirm');
  confirm.type = 'button';
  confirm.setAttribute('aria-label', text('confirm'));
  confirm.title = text('confirm');
  confirm.innerHTML = ICONS.confirm;
  root.append(plus, canvas, cancel, confirm);
  host.append(root);
  host.classList.add('is-dictating');

  let closed = false;
  let busy = false;
  let meter = null;
  let frame = 0;
  let lastStep = 0;
  const history = createWaveformHistory();
  const context = canvas.getContext?.('2d') || null;

  // No reading (the microphone is not shared, or is not offered): the bars rise and fall by themselves.
  const breathing = (now) => 0.3 + 0.22 * Math.sin(now / 210) + 0.12 * Math.sin(now / 97);
  // The loudest lately, which slowly settles: a quiet microphone still fills the height when its
  // owner speaks, and room noise below a floor stays flat.
  let peak = 0.25;
  const NOISE_FLOOR = 0.03;
  const fromMicrophone = () => {
    const raw = meter.read();
    peak = Math.max(0.25, raw, peak * 0.992);
    return raw < NOISE_FLOOR ? 0 : Math.min(1, (raw / peak) ** 0.7);
  };
  const readLevel = (now) => (meter ? fromMicrophone() : breathing(now));

  const size = () => {
    const ratio = window?.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(canvas.clientWidth || 0));
    const height = Math.max(1, Math.round(canvas.clientHeight || 0));
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    }
    return { width, height, ratio };
  };

  const draw = () => {
    if (!context) return;
    const { width, height, ratio } = size();
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    const colour = window?.getComputedStyle?.(canvas)?.color || 'currentColor';
    context.fillStyle = colour;
    // The dotted line the bars grow along.
    context.globalAlpha = 0.4;
    for (let x = DOT_GAP / 2; x < width; x += DOT_GAP) context.fillRect(x, height / 2 - 0.75, 1.5, 1.5);
    context.globalAlpha = 0.9;
    for (const bar of history.bars(width)) {
      const barHeight = Math.max(3, bar.height * height);
      context.fillRect(bar.x, (height - barHeight) / 2, BAR_WIDTH, barHeight);
    }
  };

  const tick = (now) => {
    if (closed) return;
    // One bar every STEP_MS whatever the frame rate (a slow or throttled page catches up).
    const due = lastStep === 0 ? 1 : Math.min(8, Math.floor((now - lastStep) / STEP_MS));
    if (due > 0) {
      lastStep = lastStep === 0 ? now : lastStep + due * STEP_MS;
      // Once the text is being made nothing new is heard; the bars hold still.
      if (!busy) for (let index = 0; index < due; index += 1) history.push(readLevel(now));
    }
    draw();
    frame = window.requestAnimationFrame(tick);
  };
  if (typeof window?.requestAnimationFrame === 'function') frame = window.requestAnimationFrame(tick);

  void openMicLevel({ navigator, window }).then((opened) => {
    if (!opened) return;
    if (closed) opened.stop();
    else meter = opened;
  });

  const keydown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      event.stopPropagation();
      if (!busy) onConfirm();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    }
  };
  // Ahead of the composer's own key handling, which would send or edit the message.
  document.addEventListener('keydown', keydown, true);
  cancel.addEventListener('click', () => onCancel());
  confirm.addEventListener('click', () => { if (!busy) onConfirm(); });

  return {
    element: root,
    setBusy(value) {
      busy = Boolean(value);
      confirm.classList.toggle('is-busy', busy);
      confirm.setAttribute('aria-busy', String(busy));
      confirm.disabled = busy;
      cancel.disabled = busy;
      root.setAttribute('aria-label', text(busy ? 'finishing' : 'listening'));
    },
    close() {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', keydown, true);
      window?.cancelAnimationFrame?.(frame);
      meter?.stop();
      root.classList.add('is-leaving');
      // The composer keeps its dictating class until the bar has faded, as the bar is placed by it.
      const remove = () => {
        root.remove();
        host.classList.remove('is-dictating');
      };
      if (typeof window?.setTimeout === 'function') window.setTimeout(remove, LEAVE_MS);
      else remove();
    }
  };
}
