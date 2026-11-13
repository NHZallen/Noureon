// The "+" sheet on a phone. It rises from the bottom instead of the small menu above the button, and holds what that menu had:
// camera, photos and files as three tiles (grey when the model cannot take them, so they keep their place), Google Drive, the tools
// (search, council, deep research, learning) and, for a picture model, the picture settings; "Design" and each of those settings open as
// a page inside the same sheet, with the button on the left going back to the first page.
//
// The sheet owns no state. The buttons and controls of the old menu stay in the page (hidden on a phone) and are the truth: a row asks
// whether its button is shown and active, and pressing it presses that button, so what the menu did still does (the same handlers,
// the same saving). It is loaded when the "+" is first touched (runtime/features/plus-sheet-entry.js).

import { decideSheetDrag } from '../citations/sheet-drag.js';
import { renderComposerToolIcon } from '../../composer-tool-icons.js';
import { getFileText } from '../files/file-texts.js';
import { normalizeDeckDesign, normalizeDocumentChoice, DECK_DESIGN_AUTO } from '../../runtime/features/deck-design-control.js';
import { plusSheetText } from './plus-sheet-texts.js';
import { buildDesignPage } from './plus-sheet-design.js';
import { buildAdvancedPage, buildRatioPage, buildResolutionPage, labelOfControl } from './plus-sheet-images.js';
import { element, icon } from './plus-sheet-dom.js';

const TOOLS = Object.freeze([
  ['web-search-popover-btn', 'webSearch'],
  ['model-council-menu-btn', 'modelCouncil'],
  ['research-mode-menu-btn', 'deepResearch'],
  ['learning-mode-btn', 'learning']
]);
const PAGE_SIZES = Object.freeze({ home: 'medium', design: 'large', ratio: 'medium', resolution: 'medium', advanced: 'large' });

let current = null;

/** Closes the sheet that is open, if any. */
export function closePlusSheet(options) {
  current?.close(options);
}

const shown = (button) => Boolean(button) && button.style.display !== 'none';
const labelOf = (button) => button?.querySelector('.composer-menu-label, .composer-menu-copy > span:first-child')?.textContent?.trim() || button?.textContent?.trim() || '';

/**
 * Opens the sheet. `ctx`: { document, window, getActiveConversation, getConfig, saveAppData, refresh, closeAllPopovers,
 * normalizeConversationModel, isCouncilEnabled }. Returns { close, element, go } (null where a sheet is already open).
 */
export function openPlusSheet(ctx) {
  if (current) return null;
  const { document, window } = ctx;
  const language = ctx.getConfig?.().uiLanguage || 'zh-TW';
  const text = (key) => plusSheetText(language, key);
  ctx.closeAllPopovers?.();
  ctx.refresh?.();

  // The keyboard yields to the sheet and comes back after it if it was up.
  const editor = document.getElementById('message-input');
  const wasFocused = Boolean(editor) && (document.activeElement === editor || editor.contains(document.activeElement));
  if (wasFocused) editor.blur?.();
  const opener = document.getElementById('add-file-btn');
  opener?.setAttribute('aria-expanded', 'true');

  const root = element(document, 'div', 'ps-root');
  const backdrop = element(document, 'div', 'ps-backdrop');
  const sheet = element(document, 'div', 'ps-sheet');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.tabIndex = -1;
  const head = element(document, 'div', 'ps-head');
  const grip = element(document, 'div', 'ps-grip');
  const lead = element(document, 'button', 'ps-lead');
  lead.type = 'button';
  const title = element(document, 'h2', 'ps-title');
  head.append(grip, lead, title);
  const body = element(document, 'div', 'ps-body');
  sheet.append(head, body);
  root.append(backdrop, sheet);
  document.body.append(root);
  document.documentElement.classList.add('source-sheet-open');

  let page = 'home';
  let size = 'medium';
  let closed = false;
  let building = 0;

  const press = (button, { keepFocus = false } = {}) => {
    // Pressed inside this click, so a file chooser, the camera or Google's window still counts as opened by the person.
    button.click();
    close({ restoreFocus: keepFocus });
  };

  const tile = (id, iconName, label) => {
    const button = element(document, 'button', 'ps-tile');
    button.type = 'button';
    button.disabled = !shown(document.getElementById(id));
    button.innerHTML = renderComposerToolIcon(iconName, 'ps-icon');
    button.append(label);
    button.addEventListener('click', () => press(document.getElementById(id)));
    return button;
  };

  // `chevron`: the row opens a page (with `summary`, what is chosen there, before the arrow); a tool row only shows a tick while it is on.
  const row = (iconMarkup, label, { onClick, on = false, disabled = false, summary = '', chevron = false } = {}) => {
    const button = element(document, 'button', `ps-row${on ? ' is-on' : ''}`);
    button.type = 'button';
    button.disabled = disabled;
    button.innerHTML = iconMarkup;
    button.append(element(document, 'span', 'ps-row-name', label));
    if (onClick) button.addEventListener('click', onClick);
    if (summary || chevron) {
      const end = element(document, 'span', 'ps-row-end');
      if (summary) end.append(summary);
      if (chevron) end.insertAdjacentHTML('beforeend', icon('right', 18));
      button.append(end);
    }
    return button;
  };

  const designSummary = () => {
    const conversation = ctx.getActiveConversation?.();
    const auto = normalizeDeckDesign(conversation?.deckDesign) === DECK_DESIGN_AUTO && normalizeDocumentChoice(conversation?.documentDesign) === DECK_DESIGN_AUTO;
    return auto ? getFileText(language, 'deckDesignAuto') : text('designTemplate');
  };

  const buildHome = () => {
    const fragment = document.createDocumentFragment();
    const tiles = element(document, 'div', 'ps-tiles');
    tiles.append(tile('camera-btn', 'camera', text('camera')), tile('upload-image-btn', 'media', text('photos')), tile('upload-file-btn', 'file', text('files')));
    const list = element(document, 'div', 'ps-list');
    const drive = document.getElementById('upload-drive-btn');
    list.append(row(renderComposerToolIcon('drive', 'ps-icon'), labelOf(drive) || 'Google Drive', { disabled: !shown(drive), onClick: () => press(drive) }));

    const ratio = document.getElementById('image-aspect-ratio-control');
    const resolution = document.getElementById('image-resolution-control');
    const advanced = document.getElementById('image-advanced-control');
    const imageMode = advanced?.style.display === 'block';
    if (imageMode) {
      const value = (id) => document.getElementById(id)?.value || '';
      if (shown(ratio)) {
        const v = value('image-aspect-ratio-select');
        list.append(row(icon('ratio'), labelOfControl(ratio) || 'Aspect ratio', { onClick: () => go('ratio'), chevron: true, summary: v === 'auto' ? text('auto') : v }));
      }
      if (shown(resolution)) list.append(row(icon('resolution'), labelOfControl(resolution) || 'Resolution', { onClick: () => go('resolution'), chevron: true, summary: value('image-resolution-select') }));
      list.append(row(icon('sliders'), labelOfControl(advanced) || 'Advanced', { onClick: () => go('advanced'), chevron: true }));
    } else {
      for (const [id, iconName] of TOOLS) {
        const button = document.getElementById(id);
        if (!shown(button)) continue;
        list.append(row(renderComposerToolIcon(iconName, 'ps-icon'), labelOf(button), { on: button.classList.contains('is-active'), onClick: () => press(button, { keepFocus: true }) }));
      }
      const design = document.getElementById('deck-design-control');
      if (design && design.style.display !== 'none') {
        const designButton = document.getElementById('deck-design-btn');
        list.append(row(icon('design'), getFileText(language, 'design'), { disabled: Boolean(designButton?.disabled), onClick: () => go('design'), chevron: true, summary: designSummary() }));
      }
    }
    fragment.append(tiles, list);
    return fragment;
  };

  const TITLES = {
    home: () => text('title'),
    design: () => getFileText(language, 'design'),
    ratio: () => labelOfControl(document.getElementById('image-aspect-ratio-control')) || 'Aspect ratio',
    resolution: () => labelOfControl(document.getElementById('image-resolution-control')) || 'Resolution',
    advanced: () => labelOfControl(document.getElementById('image-advanced-control')) || 'Advanced'
  };

  const buildPage = (name, pageElement) => {
    const run = ++building;
    const pageContext = { ...ctx, document, window, language, text, rebuild: () => { if (page === name && run === building) paint(name, null); } };
    if (name === 'home') pageElement.append(buildHome());
    else if (name === 'design') void buildDesignPage(pageContext, pageElement);
    else if (name === 'ratio') buildRatioPage(pageContext, pageElement);
    else if (name === 'resolution') buildResolutionPage(pageContext, pageElement);
    else if (name === 'advanced') buildAdvancedPage(pageContext, pageElement);
  };

  // Shows a page: the title and the button on the left change at once, the new page slides in from the side it belongs to.
  function paint(name, direction) {
    const pageElement = element(document, 'div', `ps-page${direction ? ` is-in-${direction}` : ''}`);
    pageElement.dataset.page = name;
    if (name === 'design') pageElement.classList.add('ps-design');
    const top = body.scrollTop;
    page = name;
    sheet.dataset.page = name;
    title.textContent = TITLES[name]();
    lead.innerHTML = icon(name === 'home' ? 'close' : 'back', 20);
    lead.setAttribute('aria-label', text(name === 'home' ? 'close' : 'back'));
    sheet.setAttribute('aria-label', title.textContent);
    buildPage(name, pageElement);
    body.replaceChildren(pageElement);
    body.scrollTop = direction ? 0 : top;
    // The first page is as tall as what it holds (up to the large height), so every row shows without scrolling.
    if (name === 'home') {
      const style = window.getComputedStyle(body);
      const padding = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
      sheet.style.setProperty('--ps-home-h', `${Math.ceil(head.offsetHeight + padding + pageElement.offsetHeight)}px`);
    }
  }

  function setSize(next) {
    size = next;
    sheet.dataset.size = next;
  }

  function go(name) {
    if (name === page) return;
    const direction = name === 'home' ? 'l' : 'r';
    setSize(PAGE_SIZES[name]);
    paint(name, direction);
  }

  function close({ restoreFocus = true } = {}) {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey, true);
    root.classList.remove('is-open');
    opener?.setAttribute('aria-expanded', 'false');
    document.documentElement.classList.remove('source-sheet-open');
    const remove = () => root.remove();
    // Let it sink before it goes (with reduced motion it goes at once).
    if (window?.matchMedia?.('(prefers-reduced-motion: reduce)').matches) remove();
    else { sheet.addEventListener('transitionend', remove, { once: true }); window?.setTimeout?.(remove, 360); }
    if (current === api) current = null;
    if (restoreFocus && wasFocused) {
      try { editor.focus?.({ preventScroll: true }); } catch { /* the editor is gone */ }
    }
  }
  const onKey = (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
    }
  };
  document.addEventListener('keydown', onKey, true);
  backdrop.addEventListener('click', () => close());
  lead.addEventListener('click', () => (page === 'home' ? close() : go('home')));

  // Pulling the bar: the sheet follows the finger (only moved, never laid out again) and settles where `decideSheetDrag` says,
  // as the sources sheet does: down closes (or goes back to the medium height from the large one), up makes it large.
  let drag = null;
  let frame = 0;
  const paintDrag = () => {
    frame = 0;
    if (drag) sheet.style.translate = `0 ${drag.shown}px`;
  };
  head.addEventListener('pointerdown', (event) => {
    if ((event.button !== undefined && event.button > 0) || event.target.closest('button')) return;
    drag = { y: event.clientY, at: Date.now(), dy: 0, shown: 0, pointer: event.pointerId };
    sheet.classList.add('is-dragging');
    try { head.setPointerCapture?.(event.pointerId); } catch { /* no capture */ }
  });
  head.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.pointer) return;
    drag.dy = event.clientY - drag.y;
    drag.shown = drag.dy < 0 ? drag.dy * 0.25 : drag.dy;
    if (window?.requestAnimationFrame) { if (!frame) frame = window.requestAnimationFrame(paintDrag); } else paintDrag();
  });
  const release = (event) => {
    if (!drag || (event.pointerId !== undefined && event.pointerId !== drag.pointer)) return;
    const elapsed = Math.max(1, Date.now() - drag.at);
    const outcome = decideSheetDrag({ state: size, dy: drag.dy, speed: drag.dy / elapsed, expandable: true });
    drag = null;
    if (frame) { window?.cancelAnimationFrame?.(frame); frame = 0; }
    sheet.classList.remove('is-dragging');
    sheet.style.removeProperty('translate');
    if (outcome === 'close') close();
    else setSize(outcome);
  };
  head.addEventListener('pointerup', release);
  head.addEventListener('pointercancel', release);

  const api = { close, element: root, go };
  current = api;
  setSize('medium');
  paint('home', null);
  // One frame later, so it rises instead of appearing.
  (window?.requestAnimationFrame || ((callback) => callback()))(() => {
    root.classList.add('is-open');
    sheet.focus?.({ preventScroll: true });
  });
  return api;
}
