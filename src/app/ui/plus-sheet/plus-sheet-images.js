// The picture settings as pages of the "+" sheet: the shape, the size and the advanced ones. The controls of the old menu
// (runtime/images/image-mode-controls.js) stay in the page and are the truth: a page lists what its select offers (what the model
// supports is already hidden there), and choosing sets that select and tells it, so the same code keeps it on the conversation.

import { element, icon } from './plus-sheet-dom.js';

const RESOLUTION_PIXELS = Object.freeze({ 512: '512 px', 768: '768 px', '1K': '1024 px', '1.5K': '1536 px', '2K': '2048 px', '4K': '4096 px' });
// The values the sheet has a word for (plus-sheet-texts.js); any other value is shown as it is.
const WORDS = new Set(['auto', 'low', 'medium', 'high', 'xhigh', 'max', 'transparent', 'opaque']);
const LOSSY = Object.freeze(['jpeg', 'jpg', 'webp']);

/** The words next to a control of the old menu (its label), read from it so they are the ones used everywhere else. */
export const labelOfControl = (control) => control?.querySelector('span, summary')?.textContent?.trim() || '';

const resolutionHint = (value) => RESOLUTION_PIXELS[value] || value;

const optionsOf = (select) => [...(select?.options || [])].filter((option) => !option.hidden && !option.disabled).map((option) => ({ value: option.value, label: option.textContent }));

// Sets a select of the old menu and tells it, so its own handler keeps the choice.
function setField(field, value) {
  field.value = String(value);
  field.dispatchEvent(new field.ownerDocument.defaultView.Event('change', { bubbles: true }));
}

const mark = (container, selector, value) => {
  container.querySelectorAll(selector).forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.value === value)));
};

const checkBadge = (document) => {
  const badge = element(document, 'span', 'ps-check');
  badge.innerHTML = icon('check', 12);
  return badge;
};

// A drawing of the proportion in a box of fixed height, so the words under every tile sit on one line.
function glyphFor(document, value) {
  const box = element(document, 'span', 'ps-ratio-box');
  const glyph = element(document, 'span', `ps-ratio-glyph${value === 'auto' ? ' is-auto' : ''}`);
  box.append(glyph);
  const [w, h] = value.split(':').map(Number);
  if (w > 0 && h > 0) {
    const scale = 1.9 / Math.max(w, h);
    glyph.style.width = `${(w * scale).toFixed(2)}rem`;
    glyph.style.height = `${(h * scale).toFixed(2)}rem`;
  } else {
    glyph.style.width = '1.6rem';
    glyph.style.height = '1.6rem';
  }
  return box;
}

export function buildRatioPage({ document, text }, page) {
  const select = document.getElementById('image-aspect-ratio-select');
  page.append(element(document, 'p', 'ps-note', text('ratioNote')));
  const grid = element(document, 'div', 'ps-ratios');
  for (const option of optionsOf(select)) {
    const button = element(document, 'button', 'ps-ratio');
    button.type = 'button';
    button.dataset.value = option.value;
    button.append(glyphFor(document, option.value), option.value === 'auto' ? text('auto') : option.label, checkBadge(document));
    button.addEventListener('click', () => {
      setField(select, option.value);
      mark(grid, '.ps-ratio', option.value);
    });
    grid.append(button);
  }
  mark(grid, '.ps-ratio', select.value);
  page.append(grid);
}

export function buildResolutionPage({ document, text }, page) {
  const select = document.getElementById('image-resolution-select');
  page.append(element(document, 'p', 'ps-note', text('resolutionNote')));
  const grid = element(document, 'div', 'ps-resolutions');
  for (const option of optionsOf(select)) {
    const button = element(document, 'button', 'ps-chip');
    button.type = 'button';
    button.dataset.value = option.value;
    button.append(option.label, element(document, 'small', '', resolutionHint(option.value)), checkBadge(document));
    button.addEventListener('click', () => {
      setField(select, option.value);
      mark(grid, '.ps-chip', option.value);
    });
    grid.append(button);
  }
  mark(grid, '.ps-chip', select.value);
  page.append(grid);
}

// ---- the advanced page ----

const labelOfField = (field) => field?.closest?.('label')?.querySelector('span')?.textContent?.trim() || '';
// A setting the model does not have is hidden in the old menu (its label gets display none); a page leaves it out too.
const available = (field) => Boolean(field) && field.closest('label')?.style.display !== 'none';

export function buildAdvancedPage(context, page) {
  const { document, text } = context;
  const get = (id) => document.getElementById(id);
  const fields = {
    n: get('image-n-select'),
    quality: get('image-quality-select'),
    format: get('image-output-format-select'),
    background: get('image-background-select'),
    compression: get('image-output-compression-select'),
    frameCount: get('image-frame-count-select'),
    frameDuration: get('image-frame-duration-select'),
    seed: get('image-seed-input'),
    provider: get('image-provider-options-input')
  };
  const word = (value) => (WORDS.has(value) ? text(value) : value);
  // A change of one setting can change which others there are (the format decides compression, frames and the count), so the old
  // menu is brought up to date and the page is drawn again where it was.
  const again = () => {
    context.refresh?.();
    context.rebuild();
  };
  const choose = (field, value, redraw = false) => {
    setField(field, value);
    if (redraw) again();
  };

  const group = (captionKey) => {
    page.append(element(document, 'p', 'ps-caption', text(captionKey)));
    const box = element(document, 'div', 'ps-group');
    page.append(box);
    return box;
  };
  const fieldRow = (box, label, wide = false) => {
    const rowElement = element(document, 'div', `ps-field${wide ? ' is-wide' : ''}`);
    rowElement.append(element(document, 'span', 'ps-field-label', label));
    box.append(rowElement);
    return rowElement;
  };
  const segments = (rowElement, field, labelFor, redraw = false) => {
    const options = optionsOf(field);
    const bar = element(document, 'div', 'ps-segments');
    for (const option of options) {
      const button = element(document, 'button', 'ps-segment', labelFor(option));
      button.type = 'button';
      button.dataset.value = option.value;
      button.addEventListener('click', () => {
        choose(field, option.value, redraw);
        if (!redraw) mark(bar, '.ps-segment', option.value);
      });
      bar.append(button);
    }
    mark(bar, '.ps-segment', field.value);
    if (options.length > 3) rowElement.classList.add('is-wide');
    rowElement.append(bar);
  };

  const output = group('groupOutput');
  if (fields.n) {
    const rowElement = fieldRow(output, labelOfField(fields.n));
    const values = optionsOf(fields.n).map((option) => Number(option.value)).filter(Number.isFinite);
    const min = Math.min(...values, 1);
    const max = Math.max(...values, 1);
    const stepper = element(document, 'div', 'ps-stepper');
    const less = element(document, 'button', 'ps-step');
    const more = element(document, 'button', 'ps-step');
    const value = element(document, 'span', 'ps-step-value');
    less.type = 'button';
    more.type = 'button';
    less.innerHTML = icon('minus', 16);
    more.innerHTML = icon('plus', 16);
    less.setAttribute('aria-label', text('stepLess'));
    more.setAttribute('aria-label', text('stepMore'));
    const show = () => {
      const n = Math.min(Math.max(Number(fields.n.value) || 1, min), max);
      value.textContent = String(n);
      less.disabled = n <= min;
      more.disabled = n >= max;
    };
    const step = (delta) => {
      const n = Math.min(Math.max((Number(fields.n.value) || 1) + delta, min), max);
      setField(fields.n, n);
      show();
    };
    less.addEventListener('click', () => step(-1));
    more.addEventListener('click', () => step(1));
    stepper.append(less, value, more);
    rowElement.append(stepper);
    show();
  }
  if (available(fields.quality)) segments(fieldRow(output, labelOfField(fields.quality)), fields.quality, (option) => word(option.value));
  if (fields.format) segments(fieldRow(output, labelOfField(fields.format)), fields.format, (option) => option.value.toUpperCase(), true);
  if (available(fields.background)) segments(fieldRow(output, labelOfField(fields.background)), fields.background, (option) => word(option.value));
  const format = String(fields.format?.value || '').toLowerCase();
  if (available(fields.compression) && LOSSY.includes(format)) {
    const rowElement = fieldRow(output, labelOfField(fields.compression));
    const range = element(document, 'input', 'ps-range');
    const shownValue = element(document, 'span', 'ps-range-value', fields.compression.value);
    range.type = 'range';
    range.min = '0';
    range.max = '100';
    range.step = '10';
    range.value = fields.compression.value;
    range.setAttribute('aria-label', labelOfField(fields.compression));
    range.addEventListener('input', () => { shownValue.textContent = range.value; });
    range.addEventListener('change', () => setField(fields.compression, range.value));
    rowElement.append(range, shownValue);
  }
  if (format === 'gif') {
    if (available(fields.frameCount)) segments(fieldRow(output, labelOfField(fields.frameCount)), fields.frameCount, (option) => option.value);
    if (available(fields.frameDuration)) segments(fieldRow(output, labelOfField(fields.frameDuration)), fields.frameDuration, (option) => `${option.value} ms`);
  }

  const extra = group('groupMore');
  if (fields.seed) {
    const rowElement = fieldRow(extra, labelOfField(fields.seed));
    const input = element(document, 'input', 'ps-input');
    input.type = 'text';
    input.inputMode = 'numeric';
    input.placeholder = text('seedPlaceholder');
    input.value = fields.seed.value;
    input.setAttribute('aria-label', labelOfField(fields.seed));
    input.addEventListener('change', () => {
      input.value = input.value.replace(/\D/g, '');
      setField(fields.seed, input.value);
    });
    rowElement.append(input);
  }
  if (fields.provider) {
    const rowElement = fieldRow(extra, labelOfField(fields.provider));
    rowElement.classList.add('is-block');
    const input = element(document, 'textarea', 'ps-input');
    input.rows = 3;
    input.spellcheck = false;
    input.placeholder = fields.provider.placeholder;
    input.value = fields.provider.value;
    input.setAttribute('aria-label', labelOfField(fields.provider));
    const error = element(document, 'p', 'ps-error');
    error.hidden = true;
    input.addEventListener('change', () => {
      const valid = (() => { try { if (input.value.trim()) JSON.parse(input.value); return true; } catch { return false; } })();
      error.hidden = valid;
      input.setAttribute('aria-invalid', String(!valid));
      if (!valid) { error.textContent = text('jsonInvalid'); return; }
      setField(fields.provider, input.value);
    });
    rowElement.append(input, error);
  }
}
