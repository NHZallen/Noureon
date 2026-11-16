// The focus mode of the browser agent on a phone (design section 16): the page is the browser. At the top: a cross (back to the pill), the site, a menu. Under it
// the tabs, like a real browser's (a press switches, the cross of a tab closes it, the plus opens one; the person and the model can both do it). Then the
// screen, then, while the model works, empty room and two buttons (Stop, Take over). When the person has taken over the room becomes a trackpad, a row of
// tools (keyboard, paste, refresh) is over it, and one button gives the browser back to the model. The menu holds back, a screenshot for the model, copying the
// address, the downloaded files and the ratio of the screen. What it asks of the browser it asks of a `controller`; it draws from the `state` it is told.
//   state: { domain, url, tabs: [{ id, title, active }], control: 'model' | 'user', ratio, over, zoomed }
// On a computer (`layout: 'panel'`) it is the side panel (and, with `zoomed`, the big one): the tabs are the top row with Enlarge, the menu and the cross beside them; there is no
// trackpad: the person points and types on the screen itself (the mouse, the wheel, the keys); with the browser in their hands there is a row for the address, and under
// the screen Paste and Screenshot are on the left and Give back on the right.
//   controller: { onClose, onExpand, onStop, onTakeOver, onGiveBack, onNewTab, onSwitchTab(id), onCloseTab(id), onBack, onScreenshot, onCopyUrl, onRefresh, onDownloads, onRatio(key), onZoom(bool), onNavigate(url) }

import { sandboxText } from '../../runtime/sandbox/sandbox-texts.js';
import { createLiveView } from './live-view.js';
import { createTrackpad } from './trackpad.js';
import { DEFAULT_RATIO, ratioOf, RATIO_KEYS } from './ratios.js';

const SVG = 'http://www.w3.org/2000/svg';
const PATHS = {
  x: 'M6 6l12 12M18 6L6 18',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  plus: 'M12 5v14M5 12h14',
  expand: 'M4 10V4h6M20 14v6h-6M4 4l6 6M20 20l-6-6',
  hand: 'M8 13V6.5a1.5 1.5 0 013 0V12M11 11V4.5a1.5 1.5 0 013 0V12M14 11.5V6.5a1.5 1.5 0 013 0V14a6 6 0 01-6 6h-.5a5 5 0 01-4.2-2.3L4 14.5a1.6 1.6 0 012.5-2L8 14',
  keyboard: 'M3 7h18v10H3zM7 11h.01M11 11h.01M15 11h.01M7 14h10',
  paste: 'M9 4h6v3H9zM7 5.5H6a1 1 0 00-1 1V20a1 1 0 001 1h12a1 1 0 001-1V6.5a1 1 0 00-1-1h-1',
  refresh: 'M20 12a8 8 0 11-2.6-5.9M20 4v5h-5',
  back: 'M15 5l-7 7 7 7',
  shot: 'M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3M8 12h8',
  link: 'M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3A4 4 0 0010 18.7l1-1',
  file: 'M7 3h7l4 4v14H7zM14 3v4h4',
  stop: 'M7 7h10v10H7z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  zoom: 'M4 10V4h6M20 14v6h-6M4 4l6 6M20 20l-6-6',
  zoomOut: 'M10 4v6H4M14 20v-6h6M10 10L3.5 3.5M14 14l6.5 6.5'
};
const icon = (document, name, size = 18) => {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', PATHS[name]);
  svg.append(path);
  return svg;
};

const PAD_GAIN = 1.5; // a slide across the pad moves the circle one and a half screens
const KEYS = [['Escape', 'Esc'], ['Tab', 'Tab'], ['ArrowLeft', '←'], ['ArrowUp', '↑'], ['ArrowDown', '↓'], ['ArrowRight', '→'], ['Enter', '↵']];

export function createFocusMode({ document, host = document.body, language = 'zh-TW', layout = 'phone', source = null, state: initial = {}, controller = {}, readClipboard = null }) {
  const panel = layout === 'panel';
  const t = (key) => sandboxText(language, key);
  let state = { domain: '', url: '', tabs: [], control: 'model', ratio: DEFAULT_RATIO, over: false, zoomed: false, ...initial };
  const ask = (name, ...args) => controller[name]?.(...args);

  const make = (tag, className, attrs = {}) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    return node;
  };
  const button = (className, label, onClick, child, text = '') => {
    const node = make('button', className, { type: 'button', 'aria-label': label, title: label });
    if (child) node.append(child);
    if (text) node.append(Object.assign(make('span'), { textContent: text }));
    node.addEventListener('click', onClick);
    return node;
  };

  const root = make('div', `bf${panel ? ' is-panel' : ''}`, { role: 'dialog', 'aria-label': t('browserCardLabel') });
  // The top.
  const top = make('div', 'bf-top');
  const dot = make('i', 'bf-dot');
  const site = make('span', 'bf-site');
  const menuButton = button('bf-icon', t('browserMore'), () => toggleMenu(), icon(document, 'more'));
  top.append(button('bf-icon', t('browserFocusClose'), () => ask('onClose'), icon(document, 'x')), Object.assign(make('div', 'bf-domain'), {}), menuButton);
  top.querySelector('.bf-domain').append(dot, site);
  // The tabs.
  const tabs = make('div', 'bf-tabs', { role: 'tablist', 'aria-label': t('browserTabs') });
  // The screen.
  const screen = make('div', 'bf-screen');
  const view = createLiveView({ document, host: screen, ratio: state.ratio, source });
  const expand = button('bf-expand', t('browserExpand'), () => ask(state.zoomed ? 'onZoom' : 'onExpand', false), icon(document, 'expand', 14), t('browserExpand'));
  screen.append(expand);
  const status = make('div', 'bf-status');
  const pad = make('div', 'bf-pad', { 'aria-label': t('browserPadHint') });
  pad.append(Object.assign(make('div', 'bf-pad-hint'), { textContent: t('browserPadHint') }));
  const tools = make('div', 'bf-tools');
  const keyboardButton = button('bf-tool', t('browserKeyboard'), () => setKeyboard(!keyboardOpen), icon(document, 'keyboard', 17), t('browserKeyboard'));
  const pasteButton = button('bf-tool', t('browserPaste'), () => void paste(), icon(document, 'paste', 17), t('browserPaste'));
  const refreshButton = button('bf-tool', t('browserRefresh'), () => ask('onRefresh'), icon(document, 'refresh', 17), t('browserRefresh'));
  tools.append(keyboardButton, pasteButton, refreshButton);
  // The keyboard of the person: long text is written here first and sent in one go; the keys that a phone keyboard does not have are in a row over it.
  const keyboard = make('div', 'bf-kb');
  const keyRow = make('div', 'bf-kb-keys');
  KEYS.forEach(([name, label]) => keyRow.append(button('bf-key', label, () => { source?.input?.key?.(name, true); source?.input?.key?.(name, false); }, null, label)));
  const field = make('textarea', 'bf-kb-field', { rows: '2', placeholder: t('browserTypeHere'), 'aria-label': t('browserKeyboard') });
  const send = button('bf-kb-send', t('browserSendText'), () => sendText(), null, t('browserSendText'));
  const typing = make('div', 'bf-kb-type');
  typing.append(field, send);
  keyboard.append(keyRow, typing);
  const actions = make('div', 'bf-actions');
  const stopButton = button('bf-act', t('browserStop'), () => ask('onStop'), icon(document, 'stop', 15), t('browserStop'));
  const takeButton = button('bf-act is-primary', t('browserTakeOver'), () => ask('onTakeOver'), icon(document, 'hand', 17), t('browserTakeOver'));
  const giveButton = button('bf-act is-primary', t('browserGiveBack'), () => ask('onGiveBack'), icon(document, 'check', 17), t('browserGiveBack'));
  actions.append(stopButton, takeButton, giveButton);
  // The side panel of a computer: the tabs are the top row, with Enlarge, the menu and the cross; the address row is there when the browser is in the person's hands.
  const zoomButton = button('bf-icon', t('browserZoom'), () => ask('onZoom', !state.zoomed), icon(document, 'zoom'));
  const closeButton = top.firstChild;
  const head = make('div', 'bf-head');
  const urlRow = make('div', 'bf-url');
  const urlField = make('input', 'bf-url-field', { type: 'text', spellcheck: 'false', autocapitalize: 'none', autocomplete: 'off', 'aria-label': t('browserUrl'), placeholder: t('browserUrl') });
  urlField.addEventListener('keydown', (event) => { if (event.key === 'Enter') ask('onNavigate', urlField.value.trim()); });
  urlRow.append(urlField);
  // Under the screen: while the model works, Stop and Take over; in the person's hands, Paste and Screenshot on the left and Give back on the right.
  const bar = make('div', 'bf-bar');
  const barTools = make('div', 'bf-bar-tools');
  barTools.append(
    button('bf-tool', t('browserPaste'), () => void paste(), icon(document, 'paste', 17), t('browserPaste')),
    button('bf-tool', t('browserScreenshotToModel'), () => ask('onScreenshot'), icon(document, 'shot', 17), t('browserScreenshotToModel'))
  );
  if (panel) {
    head.append(tabs, zoomButton, menuButton, closeButton);
    bar.append(barTools, actions);
    root.append(head, urlRow, screen, bar);
  } else {
    root.append(top, tabs, screen, status, pad, tools, keyboard, actions);
  }
  host.append(root);

  // The cursor of the person.
  let cursor = { x: 0.5, y: 0.5 };
  const screenAspect = () => {
    const { width, height } = ratioOf(state.ratio);
    return width / height;
  };
  const input = () => source?.input;
  const place = (down) => {
    view.moveCursor(cursor.x, cursor.y, 'user');
    input()?.pointer?.(cursor.x, cursor.y, down ? 'drag' : 'move');
  };
  const trackpad = createTrackpad({
    width: () => pad.clientWidth || 1,
    onMove: (dx, dy) => {
      cursor = { x: Math.min(1, Math.max(0, cursor.x + dx * PAD_GAIN)), y: Math.min(1, Math.max(0, cursor.y + dy * PAD_GAIN * screenAspect())) };
      place(trackpad.dragging);
    },
    onClick: () => {
      view.moveCursor(cursor.x, cursor.y, 'user');
      view.press(true);
      input()?.pointer?.(cursor.x, cursor.y, 'down');
      input()?.pointer?.(cursor.x, cursor.y, 'up');
      setTimeout(() => view.press(false), 120);
    },
    onDragStart: () => { view.press(true); input()?.pointer?.(cursor.x, cursor.y, 'down'); },
    onDragEnd: () => { view.press(false); input()?.pointer?.(cursor.x, cursor.y, 'up'); },
    onScroll: (dx, dy) => {
      const { width, height } = ratioOf(state.ratio);
      input()?.wheel?.(-dx * width * PAD_GAIN, -dy * height * PAD_GAIN, cursor.x, cursor.y);
    }
  });
  pad.addEventListener('pointerdown', (event) => { pad.setPointerCapture?.(event.pointerId); trackpad.down(event.pointerId, event.clientX, event.clientY, event.timeStamp); });
  pad.addEventListener('pointermove', (event) => trackpad.move(event.pointerId, event.clientX, event.clientY, event.timeStamp));
  pad.addEventListener('pointerup', (event) => trackpad.up(event.pointerId, event.timeStamp));
  pad.addEventListener('pointercancel', () => trackpad.cancel());

  // On a computer the person points at the screen itself: the mouse, the wheel, the keys and what they paste go into the browser while it is in their hands.
  const pointOf = (event) => {
    const rect = view.element.getBoundingClientRect();
    return { x: rect.width ? (event.clientX - rect.left) / rect.width : 0, y: rect.height ? (event.clientY - rect.top) / rect.height : 0 };
  };
  const mine = () => panel && state.control === 'user';
  if (panel) {
    const surface = view.element;
    surface.tabIndex = 0;
    surface.addEventListener('pointermove', (event) => { if (!mine()) return; const { x, y } = pointOf(event); view.moveCursor(x, y, 'user'); input()?.pointer?.(x, y, event.buttons ? 'drag' : 'move'); });
    surface.addEventListener('pointerdown', (event) => { if (!mine()) return; surface.focus?.(); const { x, y } = pointOf(event); view.press(true); input()?.pointer?.(x, y, 'down'); });
    surface.addEventListener('pointerup', (event) => { if (!mine()) return; const { x, y } = pointOf(event); view.press(false); input()?.pointer?.(x, y, 'up'); });
    surface.addEventListener('wheel', (event) => { if (!mine()) return; event.preventDefault?.(); const { x, y } = pointOf(event); input()?.wheel?.(event.deltaX, event.deltaY, x, y); }, { passive: false });
    surface.addEventListener('keydown', (event) => { if (!mine() || event.metaKey || event.ctrlKey) return; event.preventDefault?.(); input()?.key?.(event.key, true); });
    surface.addEventListener('keyup', (event) => { if (!mine() || event.metaKey || event.ctrlKey) return; event.preventDefault?.(); input()?.key?.(event.key, false); });
    surface.addEventListener('paste', (event) => { if (!mine()) return; event.preventDefault?.(); const text = event.clipboardData?.getData?.('text') || ''; if (text) input()?.text?.(text); });
  }

  let keyboardOpen = false;
  const setKeyboard = (open) => {
    keyboardOpen = open;
    keyboard.hidden = !open;
    keyboardButton.classList.toggle('is-on', open);
    if (open) field.focus?.();
  };
  const sendText = () => {
    const value = field.value;
    if (!value) return;
    input()?.text?.(value);
    field.value = '';
  };
  const paste = async () => {
    let value = '';
    try {
      value = await (readClipboard ? readClipboard() : document.defaultView?.navigator?.clipboard?.readText?.());
    } catch {
      value = '';
    }
    // The phone did not give the clipboard: the keyboard of the page opens, and the person pastes there.
    if (value) input()?.text?.(value);
    else setKeyboard(true);
  };

  // The menu at the top right.
  let menu = null;
  const closeMenu = () => {
    menu?.remove();
    menu = null;
  };
  const toggleMenu = () => {
    if (menu) { closeMenu(); return; }
    menu = make('div', 'bf-menu', { role: 'menu' });
    const item = (name, label, run, extra = '') => {
      const node = button(`bf-menu-item ${extra}`.trim(), label, () => { closeMenu(); run(); }, icon(document, name, 17), label);
      node.setAttribute('role', 'menuitem');
      return node;
    };
    menu.append(
      item('back', t('browserBackPage'), () => ask('onBack')),
      item('shot', t('browserScreenshotToModel'), () => ask('onScreenshot')),
      item('link', t('browserCopyUrl'), () => ask('onCopyUrl')),
      item('file', t('browserDownloads'), () => ask('onDownloads')),
      Object.assign(make('div', 'bf-menu-group'), { textContent: t('browserRatioTitle') })
    );
    const labels = { '4:3': t('browserRatio43'), '16:9': t('browserRatio169'), portrait: t('browserRatioPortrait') };
    RATIO_KEYS.forEach((key) => {
      const row = button(`bf-menu-item bf-menu-ratio${state.ratio === key ? ' is-on' : ''}`, labels[key], () => { closeMenu(); ask('onRatio', key); }, state.ratio === key ? icon(document, 'check', 17) : make('span', 'bf-menu-gap'), labels[key]);
      row.setAttribute('role', 'menuitemradio');
      row.setAttribute('aria-checked', String(state.ratio === key));
      menu.append(row);
    });
    root.append(menu);
  };
  root.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeMenu(); });

  const render = () => {
    const user = state.control === 'user';
    root.dataset.control = state.control;
    root.dataset.over = String(Boolean(state.over));
    site.textContent = state.domain || t('browserCardLabel');
    dot.classList.toggle('is-user', user);
    status.textContent = state.over ? t('browserDone') : user ? t('browserYouDoing') : t('browserModelDoing');
    pad.hidden = !user;
    tools.hidden = !user;
    keyboard.hidden = !user || !keyboardOpen;
    stopButton.hidden = user || state.over;
    takeButton.hidden = user || state.over;
    giveButton.hidden = !user;
    view.setRatio(state.ratio);
    screen.style.setProperty('--bl-ratio', view.element.style.getPropertyValue('--bl-ratio'));
    root.classList.toggle('is-zoomed', Boolean(state.zoomed));
    zoomButton.setAttribute('aria-label', state.zoomed ? t('browserZoomOut') : t('browserZoom'));
    zoomButton.title = zoomButton.getAttribute('aria-label');
    zoomButton.replaceChildren(icon(document, state.zoomed ? 'zoomOut' : 'zoom'));
    urlRow.hidden = !(panel && user);
    if (panel && document.activeElement !== urlField) urlField.value = state.url || '';
    barTools.hidden = !user;
    expand.querySelector('span').textContent = state.zoomed ? t('browserZoomOut') : t('browserExpand');
    expand.setAttribute('aria-label', expand.querySelector('span').textContent);
    tabs.replaceChildren(...state.tabs.map((tab) => {
      const node = make('div', `bf-tab${tab.active ? ' is-active' : ''}`, { role: 'tab', 'aria-selected': String(Boolean(tab.active)) });
      const label = button('bf-tab-label', tab.title || state.domain, () => ask('onSwitchTab', tab.id), null, tab.title || state.domain);
      node.append(label, button('bf-tab-close', t('browserCloseTab'), () => ask('onCloseTab', tab.id), icon(document, 'x', 12)));
      return node;
    }), button('bf-tab-new', t('browserNewTab'), () => ask('onNewTab'), icon(document, 'plus', 16)));
  };
  render();

  return {
    get element() { return root; },
    get view() { return view; },
    get state() { return { ...state }; },
    /** Draws again from a new state (the parts of it that are given). */
    update(next) {
      state = { ...state, ...next };
      if (state.control !== 'user') setKeyboard(false);
      render();
    },
    destroy() {
      closeMenu();
      trackpad.cancel();
      view.destroy();
      root.remove();
    }
  };
}
