// The usage ring of an OpenRouter key, beside the OpenCode rings above the Extensions entry: one ring, as full as what is left of the spending limit the person set for
// the key in OpenRouter, with "OR" in the middle and no words (they are in the tip, with what was spent). A key with no limit has nothing to show, and no ring is there
// (Allen's decision, 2026-10-27); so it is when there is no key or the service does not answer. It asks when the page comes back into view, when the key is
// changed, and when it is tapped (a minute is kept, see openrouter-usage.js). Styles: styles/opencode-quota.css.

import { createOpenrouterUsage } from '../../runtime/shell/openrouter-usage.js';
import { quotaText } from '../opencode-quota/quota-texts.js';
import { openrouterText } from './openrouter-texts.js';
import { getQuotaRow } from './quota-row.js';

const ENTRY_ID = 'openrouter-quota-btn';
const KEY_INPUT_IDS = Object.freeze(['openrouter-api-key-input', 'openrouter-api-key-input-all']);
const SIZE = 100;
const STROKE = 5;
const RADIUS = SIZE / 2 - STROKE / 2;
const LOW_PERCENT = 20;

/** A sum of money for the tip: "$1.25" ("$12" from ten up, "$0.003" for the very small). */
export const formatMoney = (value) => {
  if (!Number.isFinite(value)) return '–';
  const digits = value >= 10 ? 0 : value >= 0.1 ? 2 : 3;
  return `$${value.toFixed(digits)}`;
};

export function startOpenrouterRing({ document, getApiKey, getLanguage = () => 'en', usage = createOpenrouterUsage(), setTimer = (callback, ms) => setTimeout(callback, ms) }) {
  const win = document.defaultView;
  const circumference = 2 * Math.PI * RADIUS;
  let element = null;
  let last = null;

  const ensureElement = () => {
    if (element) return element;
    element = document.createElement('button');
    element.id = ENTRY_ID;
    element.type = 'button';
    element.className = 'sidebar-item oq-entry oq-entry-openrouter';
    element.hidden = true;
    element.innerHTML = `<svg class="oq-rings" viewBox="0 0 ${SIZE} ${SIZE}" aria-hidden="true"><circle class="oq-track" cx="${SIZE / 2}" cy="${SIZE / 2}" r="${RADIUS}"></circle><circle class="oq-arc" cx="${SIZE / 2}" cy="${SIZE / 2}" r="${RADIUS}" transform="rotate(-90 ${SIZE / 2} ${SIZE / 2})" stroke-dasharray="0 ${circumference.toFixed(2)}"></circle><text class="oq-letters" x="${SIZE / 2}" y="${SIZE / 2}">OR</text></svg>`;
    element.addEventListener('click', () => { void sync({ force: true }); });
    return element;
  };

  const mount = () => {
    ensureElement();
    const row = getQuotaRow(document);
    if (row && element.parentNode !== row) row.append(element);
  };

  const render = () => {
    if (!element) return;
    if (!last?.ok) { element.hidden = true; return; }
    const language = getLanguage();
    const arc = element.querySelector('.oq-arc');
    arc.setAttribute('stroke-dasharray', `${((last.remainingPercent / 100) * circumference).toFixed(2)} ${circumference.toFixed(2)}`);
    arc.classList.toggle('is-low', last.remainingPercent < LOW_PERCENT && last.remainingPercent > 0);
    arc.classList.toggle('is-empty', last.remainingPercent <= 0);
    const reset = last.resetKind ? `, ${openrouterText(language, last.resetKind)}` : '';
    const tips = [
      openrouterText(language, 'title'),
      `${openrouterText(language, 'left', { percent: Math.round(last.remainingPercent), remaining: formatMoney(last.remaining), limit: formatMoney(last.limit) })}${reset}`
    ];
    const { daily, weekly, monthly } = last.spent;
    if ([daily, weekly, monthly].some((value) => value !== null)) tips.push(openrouterText(language, 'spent', { daily: formatMoney(daily), weekly: formatMoney(weekly), monthly: formatMoney(monthly) }));
    if (last.stale) tips.push(quotaText(language, 'stale'));
    tips.push(quotaText(language, 'refresh'));
    element.title = tips.join('\n');
    element.setAttribute('aria-label', tips.join('. '));
    element.classList.toggle('is-stale', Boolean(last.stale));
    element.hidden = false;
  };

  /** Asks (a minute is kept) and draws; `force` is a tap. Nothing is shown without a key, with a key that has no limit, or when the service does not answer. */
  const sync = async ({ force = false } = {}) => {
    const key = String(getApiKey() || '').trim();
    mount();
    if (!key) { last = null; render(); return; }
    const result = await usage.get(key, { force });
    // The key was changed (or removed) while the answer was on its way.
    if (String(getApiKey() || '').trim() !== key) return;
    last = result;
    render();
  };

  const onKeyInputLeft = (event) => {
    if (KEY_INPUT_IDS.includes(event.target?.id)) setTimer(() => { void sync(); }, 800);
  };
  const onVisible = () => { if (document.visibilityState !== 'hidden') void sync(); };

  document.addEventListener('visibilitychange', onVisible);
  document.addEventListener('focusout', onKeyInputLeft);
  win?.addEventListener?.('focus', onVisible);
  win?.addEventListener?.('astra:cloud-sensitive-config', () => { void sync(); });
  void sync();

  return { sync, render, element: () => element };
}
