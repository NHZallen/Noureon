// The "Keyboard shortcuts" tab of the settings (docs/superpowers/specs/2026-11-05-keyboard-shortcuts-design.md): every shortcut under its group, each with a switch (on or off), its name and its keys; a click on the
// keys asks for the new ones (Backspace clears them, Esc leaves them as they were), a small button gives a changed one back its first keys, and one button gives all of them back. A choice is saved as soon as it
// is made (it is a setting that goes to the cloud, so it is the same on every device). The tab is only for a computer: it is not shown on a phone or a touched screen (styles/shortcuts.css), and the list of the
// settings of a phone does not have it. Words are put in with textContent.

import { SHORTCUT_GROUPS, SHORTCUTS, FIXED_SHORTCUTS } from './shortcut-registry.js';
import { comboFromEvent, formatCombo, validateCombo } from './shortcut-combo.js';

const SECTION_ID = 'shortcuts-section';
const NAV_ID = 'shortcuts-section-nav';
const SVG_NS = 'http://www.w3.org/2000/svg';
const MESSAGE_MS = 4500;
const ERROR_KEYS = Object.freeze({ shape: 'scErrShape', modifier: 'scErrModifier', browser: 'scErrBrowser', editing: 'scErrEditing', fixed: 'scErrFixed' });

const resetIcon = (document) => {
  const svg = document.createElementNS(SVG_NS, 'svg');
  for (const [key, value] of Object.entries({ viewBox: '0 0 24 24', width: '16', height: '16', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) svg.setAttribute(key, value);
  svg.innerHTML = '<path d="M3 12a9 9 0 1 0 3-6.7"></path><path d="M3 4v5h5"></path>';
  return svg;
};

const fill = (template, values) => String(template).replace(/\{(\w+)\}/g, (_, name) => values[name] ?? '');

/**
 * deps: document, store (shortcut-store.js), platform, text(key). Adds the tab once (after "Accessibility") and draws it. Returns { refresh() } or null when the page has no list of settings parts.
 */
export function mountShortcutsSection({ document, store, platform = '', text }) {
  const nav = document.getElementById('settings-nav');
  const anchorNav = nav?.querySelector('[data-section="accessibility"]');
  const anchorSection = document.getElementById('accessibility-section');
  if (!nav || !anchorNav || !anchorSection) return null;
  if (!document.getElementById(NAV_ID)) {
    const item = document.createElement('li');
    item.className = 'settings-nav-item p-3 rounded-md sc-nav';
    item.id = NAV_ID;
    item.dataset.section = 'shortcuts';
    item.textContent = text('scNav');
    anchorNav.after(item);
  }
  let section = document.getElementById(SECTION_ID);
  if (!section) {
    section = document.createElement('div');
    section.className = 'settings-section';
    section.id = SECTION_ID;
    anchorSection.after(section);
  }
  const win = document.defaultView;
  let stopRecording = null;
  let timer = null;

  const el = (tag, className, content) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  };
  const keysOf = (combo) => (combo ? formatCombo(combo, platform) : text('scNone'));

  // ----- choosing new keys
  const startRecording = (shortcut, keyButton, message) => {
    stopRecording?.();
    store.setRecording(true);
    keyButton.classList.add('is-recording');
    keyButton.textContent = text('scPress');
    const say = (key, values = {}) => {
      message.textContent = fill(text(key), values);
      message.hidden = false;
      win?.clearTimeout?.(timer);
      timer = win?.setTimeout?.(() => { message.hidden = true; }, MESSAGE_MS);
    };
    const finish = () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onPointer, true);
      keyButton.classList.remove('is-recording');
      store.setRecording(false);
      stopRecording = null;
      draw();
    };
    const onKey = (event) => {
      // Everything pressed now is for the choice: nothing else reacts to it.
      event.preventDefault();
      event.stopPropagation();
      const plain = !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
      if (plain && event.key === 'Escape') { finish(); return; }
      if (plain && (event.key === 'Backspace' || event.key === 'Delete')) { store.set(shortcut.id, { combo: '' }); finish(); return; }
      const result = comboFromEvent(event, platform);
      if (result.empty) return;
      if (result.unsupported) { say('scErrUnsupported'); return; }
      const valid = validateCombo(result.combo);
      if (!valid.ok) { say(ERROR_KEYS[valid.reason] || 'scErrShape'); return; }
      const other = store.conflict(shortcut.id, result.combo);
      if (other) { say('scErrConflict', { name: text(other.textKey) }); return; }
      store.set(shortcut.id, { combo: result.combo });
      finish();
    };
    const onPointer = (event) => { if (!keyButton.contains(event.target)) finish(); };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onPointer, true);
    stopRecording = finish;
  };

  // ----- drawing
  const toggleFor = (shortcut, binding) => {
    const wrap = el('span', 'relative inline-block w-12 h-6 select-none transition duration-200 ease-in pz-toggle sc-toggle');
    const input = el('input', 'toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer');
    input.type = 'checkbox';
    input.id = `sc-toggle-${shortcut.id}`;
    input.checked = binding.enabled;
    input.setAttribute('aria-label', fill(text('scToggleAria'), { name: text(shortcut.textKey) }));
    input.addEventListener('change', () => store.set(shortcut.id, { enabled: input.checked }));
    const label = el('label', 'toggle-label block overflow-hidden h-6 rounded-full bg-gray-300 cursor-pointer');
    label.htmlFor = input.id;
    wrap.append(input, label);
    return wrap;
  };

  const rowFor = (shortcut) => {
    const binding = store.binding(shortcut.id);
    const row = el('li', `sc-row${binding.enabled ? '' : ' is-off'}${binding.changed ? ' is-changed' : ''}`);
    const message = el('span', 'sc-msg');
    message.hidden = true;
    message.setAttribute('role', 'status');
    const keyButton = el('button', 'sc-key', keysOf(binding.combo));
    keyButton.type = 'button';
    keyButton.disabled = !binding.enabled;
    keyButton.setAttribute('aria-label', fill(text('scKeyAria'), { name: text(shortcut.textKey), keys: keysOf(binding.combo) }));
    keyButton.addEventListener('click', () => startRecording(shortcut, keyButton, message));
    const reset = el('button', 'sc-reset');
    reset.type = 'button';
    reset.title = text('scReset');
    reset.setAttribute('aria-label', text('scReset'));
    reset.hidden = !binding.changed;
    reset.append(resetIcon(document));
    reset.addEventListener('click', () => store.reset(shortcut.id));
    // The name is a span (not a label): the page makes every label bold, and the settings search finds the names of the settings by `.pz-label`.
    const name = el('span', 'sc-label pz-label', text(shortcut.textKey));
    row.append(toggleFor(shortcut, binding), name, reset, keyButton, message);
    return row;
  };

  const fixedRowFor = (shortcut) => {
    const row = el('li', 'sc-row is-fixed');
    row.append(el('span', 'sc-switch-gap'), el('span', 'sc-label pz-label', text(shortcut.textKey)), el('span', 'sc-key is-static', formatCombo(shortcut.combo, platform)));
    return row;
  };

  function draw() {
    if (typeof section.replaceChildren !== 'function') return;
    // A change that comes while keys are being chosen waits: the list is drawn again when the choice is done.
    if (store.isRecording()) return;
    const root = el('div', 'sc');
    const head = el('div', 'sc-head');
    const title = el('div', 'sc-title', text('scTitle'));
    title.setAttribute('role', 'heading');
    title.setAttribute('aria-level', '2');
    const resetAll = el('button', 'sc-reset-all', text('scResetAll'));
    resetAll.type = 'button';
    resetAll.disabled = !store.bindings().some((binding) => binding.changed);
    resetAll.addEventListener('click', () => store.resetAll());
    head.append(title, resetAll);
    root.append(head, el('p', 'sc-hint', text('scHint')));
    for (const group of SHORTCUT_GROUPS) {
      const items = group.id === 'fixed' ? FIXED_SHORTCUTS : SHORTCUTS.filter((shortcut) => shortcut.group === group.id);
      if (!items.length) continue;
      const block = el('section', 'sc-group');
      const heading = el('div', 'sc-group-title', text(group.textKey));
      heading.setAttribute('role', 'heading');
      heading.setAttribute('aria-level', '3');
      const list = el('ul', 'sc-list');
      list.append(...items.map((shortcut) => (group.id === 'fixed' ? fixedRowFor(shortcut) : rowFor(shortcut))));
      block.append(heading, list);
      root.append(block);
    }
    section.replaceChildren(root);
    const navItem = document.getElementById(NAV_ID);
    if (navItem) navItem.textContent = text('scNav');
  }

  store.subscribe(draw);
  draw();
  return { refresh: () => { store.refresh(); draw(); }, draw };
}
