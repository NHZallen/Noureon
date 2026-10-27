// The usage rings in the row above the Extensions entry of the left menu (the OpenRouter ring is beside them, provider-quota/): what is left of the OpenCode Go limits, three rings around the mark of OpenCode and no words, the 5 hour
// limit in the middle and the month on the outside (the week between them); the words are in the tip. Shown only when the person has an OpenCode Go key and the service answers;
// otherwise it is not there. It asks again when the page comes back into view, when the key is changed, and when it is tapped (a tap also opens the panel beside the
// rings with the words, a second tap closes it; a minute is kept, see opencode-usage.js). Words: quota-texts.js; styles: styles/opencode-quota.css.

import { createOpencodeUsage } from '../../runtime/shell/opencode-usage.js';
import { getQuotaPanel, getQuotaRow } from '../provider-quota/quota-row.js';
import { quotaText } from './quota-texts.js';

// From the inside out. (A ring is called by its window: rolling is the 5 hours.)
export const RING_ORDER = Object.freeze(['rolling', 'weekly', 'monthly']);
// The order of the lines of the tip.
const LINE_ORDER = Object.freeze(['rolling', 'weekly', 'monthly']);
const ENTRY_ID = 'opencode-quota-btn';
const KEY_INPUT_ID = 'opencode-go-api-key-input';
const SIZE = 100;
const STROKE = 5;
const GAP = 4;
const LOW_PERCENT = 20;

// The mark of OpenCode in the middle (a frame with a grey block in its lower part), 240 by 300 in its own units, centred and scaled to fit
// inside the inner ring.
const MARK_SCALE = 0.11;
const MARK = `<g class="oq-mark" transform="translate(${(SIZE / 2 - 120 * MARK_SCALE).toFixed(2)} ${(SIZE / 2 - 150 * MARK_SCALE).toFixed(2)}) scale(${MARK_SCALE})"><path class="oq-mark-frame" fill-rule="evenodd" d="M180 60H60V240H180V60ZM240 300H0V0H240V300Z"></path><path class="oq-mark-block" d="M180 240H60V120H180V240Z"></path></g>`;

const radiusOf = (position) => SIZE / 2 - STROKE / 2 - (RING_ORDER.length - 1 - position) * (STROKE + GAP);

/** "in 3 hours" in the language, for a time in the future (an empty text when the time is not known or has passed). */
export function relativeReset(language, resetsAt, now) {
  if (!Number.isFinite(resetsAt)) return '';
  const seconds = Math.round((resetsAt - now) / 1000);
  if (seconds <= 0) return '';
  let value = seconds / 60;
  let unit = 'minute';
  if (value >= 60 * 24) { value /= 60 * 24; unit = 'day'; } else if (value >= 60) { value /= 60; unit = 'hour'; }
  try {
    return new Intl.RelativeTimeFormat(language, { numeric: 'auto' }).format(Math.max(1, Math.round(value)), unit);
  } catch {
    return '';
  }
}

export function startQuotaRings({ document, getApiKey, getLanguage = () => 'en', usage = createOpencodeUsage(), now = () => Date.now(), setTimer = (callback, ms) => setTimeout(callback, ms) }) {
  const win = document.defaultView;
  let element = null;
  let last = null;

  const circles = () => RING_ORDER.map((name, position) => {
    const radius = radiusOf(position);
    return `<g data-window="${name}"><circle class="oq-track" cx="${SIZE / 2}" cy="${SIZE / 2}" r="${radius}"></circle><circle class="oq-arc" cx="${SIZE / 2}" cy="${SIZE / 2}" r="${radius}" transform="rotate(-90 ${SIZE / 2} ${SIZE / 2})" stroke-dasharray="0 ${(2 * Math.PI * radius).toFixed(2)}"></circle></g>`;
  }).join('');

  const ensureElement = () => {
    if (element) return element;
    element = document.createElement('button');
    element.id = ENTRY_ID;
    element.type = 'button';
    element.className = 'sidebar-item oq-entry';
    element.hidden = true;
    element.setAttribute('aria-expanded', 'false');
    element.setAttribute('aria-controls', 'provider-quota-panel');
    element.innerHTML = `<svg class="oq-rings" viewBox="0 0 ${SIZE} ${SIZE}" aria-hidden="true">${circles()}${MARK}</svg>`;
    element.addEventListener('click', () => {
      // A tap opens (and asks again) or closes the panel beside the rings.
      const panel = getQuotaPanel(document);
      if (panel?.toggle(ENTRY_ID, panelLines())) void sync({ force: true });
    });
    return element;
  };

  // The rings stand in the row above the Extensions entry (provider-quota/quota-row.js), the OpenRouter ring beside them.
  const mount = () => {
    ensureElement();
    const row = getQuotaRow(document);
    if (row && element.parentNode !== row) row.append(element);
  };

  // What the panel says: a line for each window, with what is left and when it starts again.
  const panelLines = () => {
    if (!last?.ok) return [];
    const language = getLanguage();
    const at = now();
    return LINE_ORDER.filter((name) => last.windows[name]).map((name) => {
      const part = last.windows[name];
      const reset = relativeReset(language, part.resetsAt, at);
      return { name: quotaText(language, name), value: quotaText(language, 'left', { percent: Math.round(part.remainingPercent) }), sub: reset ? quotaText(language, 'resets', { when: reset }) : '' };
    });
  };

  const hide = () => {
    last = null;
    if (element) element.hidden = true;
    getQuotaPanel(document)?.release(ENTRY_ID);
  };

  const render = () => {
    if (!element) return;
    if (!last?.ok) { element.hidden = true; getQuotaPanel(document)?.release(ENTRY_ID); return; }
    const language = getLanguage();
    const at = now();
    const tips = [quotaText(language, 'title')];
    for (const name of RING_ORDER) {
      const part = last.windows[name];
      const group = element.querySelector(`[data-window="${name}"]`);
      const arc = group?.querySelector('.oq-arc');
      if (!arc) continue;
      // A window the answer does not hold has no ring (an SVG group is hidden by its display, not by `hidden`).
      group.style.display = part ? '' : 'none';
      if (!part) continue;
      const radius = radiusOf(RING_ORDER.indexOf(name));
      const circumference = 2 * Math.PI * radius;
      arc.setAttribute('stroke-dasharray', `${((part.remainingPercent / 100) * circumference).toFixed(2)} ${circumference.toFixed(2)}`);
      arc.classList.toggle('is-low', part.remainingPercent < LOW_PERCENT && part.remainingPercent > 0);
      arc.classList.toggle('is-empty', part.remainingPercent <= 0);
    }
    for (const name of LINE_ORDER) {
      const part = last.windows[name];
      if (!part) continue;
      const percent = Math.round(part.remainingPercent);
      const reset = relativeReset(language, part.resetsAt, at);
      tips.push(`${quotaText(language, name)}: ${quotaText(language, 'left', { percent })}${reset ? `, ${quotaText(language, 'resets', { when: reset })}` : ''}`);
    }
    if (last.stale) tips.push(quotaText(language, 'stale'));
    tips.push(quotaText(language, 'toggle'));
    element.title = tips.join('\n');
    element.setAttribute('aria-label', tips.join('. '));
    element.classList.toggle('is-stale', Boolean(last.stale));
    element.hidden = false;
    getQuotaPanel(document)?.update(ENTRY_ID, panelLines());
  };

  /** Asks (a minute is kept) and draws; `force` is a tap. Nothing is shown without a key, or when the service does not answer. */
  const sync = async ({ force = false } = {}) => {
    const key = String(getApiKey() || '').trim();
    mount();
    if (!key) { hide(); return; }
    const result = await usage.get(key, { force });
    // The key was changed (or removed) while the answer was on its way.
    if (String(getApiKey() || '').trim() !== key) return;
    last = result;
    render();
  };

  const onKeyInputLeft = (event) => {
    if (event.target?.id === KEY_INPUT_ID) setTimer(() => { void sync(); }, 800);
  };
  const onVisible = () => { if (document.visibilityState !== 'hidden') void sync(); };

  document.addEventListener('visibilitychange', onVisible);
  document.addEventListener('focusout', onKeyInputLeft);
  win?.addEventListener?.('focus', onVisible);
  win?.addEventListener?.('astra:cloud-sensitive-config', () => { void sync(); });
  void sync();

  return { sync, render, element: () => element };
}
