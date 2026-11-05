// The small parts the pages of the projects are made of: elements, the icons (outline, 24 by 24, in the colour of the text), the mark of a project, a menu that opens at a button and the sheet
// that comes up from below on a phone and sits in the middle on a wide screen. Every text of a person (a name, a title) is put in with textContent.

import { FOLDER_SVGS } from '../../runtime/features/folder-metadata.js';
import { FOLDER_COLORS } from '../../runtime/shell/runtime-ui-colors.js';
import { resolveFolderColor } from '../../../utils/folder-colors.js';

export const make = (document, tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

const svg = (inner, size = 20) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

export const ICONS = {
  back: (size) => svg('<polyline points="15 18 9 12 15 6"></polyline>', size),
  plus: (size) => svg('<line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>', size),
  close: (size) => svg('<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>', size),
  dots: (size) => svg('<circle cx="5" cy="12" r="1.2"></circle><circle cx="12" cy="12" r="1.2"></circle><circle cx="19" cy="12" r="1.2"></circle>', size),
  search: (size) => svg('<circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>', size),
  send: (size) => svg('<line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline>', size),
  pin: (size) => svg('<path d="M12 17v5"></path><path d="M9 3h6l-1 6 3 3v2H7v-2l3-3z"></path>', size),
  rename: (size) => svg('<path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4z"></path>', size),
  remove: (size) => svg('<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="9" y1="13" x2="15" y2="19"></line><line x1="15" y1="13" x2="9" y2="19"></line>', size),
  archive: (size) => svg('<polyline points="21 8 21 21 3 21 3 8"></polyline><rect x="1" y="3" width="22" height="5"></rect><line x1="10" y1="12" x2="14" y2="12"></line>', size),
  trash: (size) => svg('<polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"></path>', size),
  edit: (size) => svg('<path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4z"></path>', size),
  sliders: (size) => svg('<line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line>', size),
  driveColor: (size = 22) => `<svg width="${size}" height="${size}" aria-hidden="true" viewBox="0 0 800 741.3696" fill="none" xmlns="http://www.w3.org/2000/svg"><mask id="gdrive-a" width="168" height="154" x="12" y="18" maskUnits="userSpaceOnUse"><path fill="#fff" d="M63.09 37c14.626-25.333 51.193-25.334 65.819 0l45.033 78c14.626 25.334-3.657 57.001-32.91 57.001H50.967c-29.253 0-47.536-31.667-32.91-57.001Z"/></mask><g mask="url(#gdrive-a)" transform="matrix(4.8140532,0,0,4.8140532,-62.146701,-86.652356)"><path fill="url(#gdrive-b)" d="M206.905 172.02h-91.888l-19.015-32.934 45.944-79.578Z"/><path fill="url(#gdrive-c)" d="M-14.919 172.006 50.04 59.494v.002L31.032 92.422h38.02L115 172.004l-129.918.001Z"/><path fill="url(#gdrive-d)" d="M96.007-20.085 141.954 59.5l-19.011 32.928H31.048Z"/></g><defs><linearGradient id="gdrive-b" x1="193.6" x2="103.09" y1="165.6" y2="111.21" gradientUnits="userSpaceOnUse"><stop offset=".09" stop-color="#ffe921"/><stop offset="1" stop-color="#fec700"/></linearGradient><linearGradient id="gdrive-c" x1="114.4" x2="15.53" y1="181.61" y2="121.8" gradientUnits="userSpaceOnUse"><stop offset=".15" stop-color="#a9a8ff"/><stop offset=".33" stop-color="#6d97ff"/><stop offset=".48" stop-color="#3186ff"/></linearGradient><linearGradient id="gdrive-d" x1="128.88" x2="28.7" y1="37.88" y2="84.64" gradientUnits="userSpaceOnUse"><stop offset=".55" stop-color="#0ebc5f"/><stop offset=".85" stop-color="#78c9ff"/></linearGradient></defs></svg>`,
  link: (size) => svg('<path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"></path>', size),
  globe: (size) => svg('<circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"></path>', size),
  text: (size) => svg('<polyline points="4 7 4 4 20 4 20 7"></polyline><line x1="9" y1="20" x2="15" y2="20"></line><line x1="12" y1="4" x2="12" y2="20"></line>', size),
  camera: (size) => svg('<path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"></path><circle cx="12" cy="13" r="4"></circle>', size),
  image: (size) => svg('<rect x="3" y="3" width="18" height="18" rx="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline>', size),
  attach: (size) => svg('<path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"></path>', size),
  file: (size) => svg('<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline>', size),
  notes: (size) => svg('<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="8" y1="13" x2="16" y2="13"></line><line x1="8" y1="17" x2="14" y2="17"></line>', size),
  chevron: (size) => svg('<polyline points="6 9 12 15 18 9"></polyline>', size),
  check: (size) => svg('<polyline points="20 6 9 17 4 12"></polyline>', size),
  list: (size) => svg('<line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line>', size),
  chat: (size) => svg('<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"></path>', size),
  folder: (size) => svg(FOLDER_SVGS.default, size)
};

// The colours of kinds of file (the colours the apps of those files wear: a PDF red, Word blue, Excel green, PowerPoint orange, Google's Slides yellow). They are given to a tile as --pj-tone,
// so the tile and its letters take them and the stylesheet has none of its own.
export const TONES = Object.freeze({ pdf: '#ea4335', word: '#4285f4', excel: '#0f9d58', powerpoint: '#e8710a', slides: '#f4b400', picture: '#a142f4' });
const EXTENSION_TONES = Object.freeze({ pdf: 'pdf', doc: 'word', docx: 'word', odt: 'word', xls: 'excel', xlsx: 'excel', csv: 'excel', ods: 'excel', ppt: 'powerpoint', pptx: 'powerpoint', odp: 'powerpoint', png: 'picture', jpg: 'picture', jpeg: 'picture', webp: 'picture', gif: 'picture', heic: 'picture' });

/** The tone key of a file name by its ending ('' when the kind has none). */
export const toneOfName = (name) => EXTENSION_TONES[String(name || '').includes('.') ? String(name).toLowerCase().split('.').pop() : ''] || '';

/** The tile at the left of a source or a Drive file: in the tone of its kind when it has one (the tile and its icon or letters), else neutral. `content` is an icon (svg) or letters. */
export function sourceTile(document, { tone = '', icon = '', label = '' } = {}) {
  const tile = make(document, 'span', `pj-source-tile${tone ? ' is-tone' : ''}${label ? ' is-label' : ''}`);
  if (tone && TONES[tone]) tile.style.setProperty('--pj-tone', TONES[tone]);
  if (label) tile.textContent = label; else tile.innerHTML = icon;
  return tile;
}

/** A wide screen (a computer): the sheets are dialogs in the middle and the icon is chosen in a small box at the name, as in the apps of a computer. */
export const isWide = (document) => document.defaultView?.matchMedia?.('(min-width: 768px)')?.matches === true;

/** The colour of a project as CSS (the colours of the folders, a gray one when it is not known). */
export const colorOf = (key) => resolveFolderColor(key, FOLDER_COLORS, FOLDER_COLORS.gray);

/** The mark of a project: its icon in its colour, on a square tinted with the same colour. `size` is the width of the square in rem. */
export function projectMark(document, { icon = 'default', color = 'gray' } = {}, className = '') {
  const mark = make(document, 'span', `pj-mark${className ? ` ${className}` : ''}`);
  mark.style.setProperty('--pj-color', colorOf(color));
  mark.innerHTML = svg(FOLDER_SVGS[icon] || FOLDER_SVGS.default, 22);
  return mark;
}

/** A menu at a button or a point: `items` are [{ label, icon, action, danger }]. Closes on a click outside, on Escape and when an item is chosen. Returns { close }. */
/** `align`: 'end' (default) puts the right edge of the menu at the right edge of the button, as the menus of the page do; 'start' puts the left edge at the button's, so that the menu opens toward the middle of the screen, as the menus of the left list of the app do. */
export function openMenu({ document, root, anchor, point = null, items, align = 'end', onClose = () => {} }) {
  const win = document.defaultView;
  const menu = make(document, 'div', 'pj-menu');
  menu.setAttribute('role', 'menu');
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    win.removeEventListener('pointerdown', onOutside, true);
    win.removeEventListener('keydown', onKey, true);
    menu.remove();
    onClose();
  };
  // A press on the button that opened the menu does not close it here: the click that follows is the button's own, which closes it (so a second press shuts the menu and does not open it again).
  const onOutside = (event) => { if (!menu.contains(event.target) && !anchor?.contains?.(event.target)) { event.stopPropagation(); close(); } };
  const onKey = (event) => { if (event.key === 'Escape') { event.stopPropagation(); event.preventDefault(); close(); } };
  for (const item of items) {
    const entry = make(document, 'button', `pj-menu-item${item.danger ? ' is-danger' : ''}`);
    entry.type = 'button';
    entry.setAttribute('role', 'menuitem');
    const icon = make(document, 'span', 'pj-menu-icon');
    if (item.icon) icon.innerHTML = ICONS[item.icon]?.(18) || '';
    entry.append(icon, make(document, 'span', 'pj-menu-label', item.label));
    entry.addEventListener('click', (event) => { event.stopPropagation(); close(); void item.action(); });
    menu.appendChild(entry);
  }
  root.appendChild(menu);
  const rect = anchor?.getBoundingClientRect?.() || { left: point?.x || 0, right: point?.x || 0, top: point?.y || 0, bottom: point?.y || 0 };
  const width = menu.offsetWidth || 220;
  const height = menu.offsetHeight || items.length * 44;
  const viewWidth = win.innerWidth || 800;
  const viewHeight = win.innerHeight || 600;
  const left = Math.max(8, Math.min(align === 'start' ? rect.left : rect.right - width, viewWidth - width - 8));
  const top = rect.bottom + 6 + height > viewHeight ? Math.max(8, rect.top - height - 6) : rect.bottom + 6;
  menu.style.left = `${Math.round(left)}px`;
  menu.style.top = `${Math.round(top)}px`;
  win.addEventListener('pointerdown', onOutside, true);
  win.addEventListener('keydown', onKey, true);
  menu.querySelector('button')?.focus();
  return { close, element: menu, anchor };
}

/**
 * A sheet that is a page over the page, as the Settings page is (`dialog: true` makes it a small dialog in the middle, for a question): a title, a button that closes it - or `action`,
 * { label, onClick }, a pill at the right of the head that takes its place - a body and, when given, a button at the foot.
 * `onClose` is told when it is gone. Returns { close, element, body, setError }.
 */
export function openSheet({ document, root, title, label, body, footer = null, action = null, close: closeLabel = '', onClose = () => {}, className = '', dialog = false }) {
  const win = document.defaultView;
  const backdrop = make(document, 'div', `pj-backdrop${dialog ? ' is-dialog' : ''}`);
  const sheet = make(document, 'div', `pj-sheet${className ? ` ${className}` : ''}`);
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', label || title || '');
  const head = make(document, 'div', 'pj-sheet-head');
  // A div, not a heading: the page forces every heading to the bold weight, and the style of the projects has none.
  const heading = make(document, 'div', 'pj-sheet-title', title || '');
  heading.setAttribute('role', 'heading');
  heading.setAttribute('aria-level', '2');
  head.appendChild(heading);
  const closeButton = action ? make(document, 'button', 'pj-pill', action.label) : make(document, 'button', 'pj-round');
  closeButton.type = 'button';
  if (!action) {
    closeButton.setAttribute('aria-label', closeLabel);
    closeButton.innerHTML = ICONS.close(18);
  }
  head.appendChild(closeButton);
  const content = make(document, 'div', 'pj-sheet-body');
  const error = make(document, 'p', 'pj-error');
  error.setAttribute('role', 'alert');
  error.hidden = true;
  sheet.append(head, content, error);
  if (footer) sheet.appendChild(footer);
  backdrop.appendChild(sheet);
  root.appendChild(backdrop);
  let closed = false;
  const opener = document.activeElement;
  const viewport = win.visualViewport || null;
  // The keyboard of a phone covers the foot of the page: the sheet is made as high as what is left above it, so the button stays above the keyboard.
  const fit = () => {
    if (!viewport) return;
    backdrop.style.top = `${Math.round(viewport.offsetTop)}px`;
    backdrop.style.height = `${Math.round(viewport.height)}px`;
    backdrop.style.bottom = 'auto';
  };
  const close = () => {
    if (closed) return;
    closed = true;
    win.removeEventListener('keydown', onKey, true);
    viewport?.removeEventListener('resize', fit);
    viewport?.removeEventListener('scroll', fit);
    backdrop.remove();
    try { opener?.focus?.(); } catch { /* the opener may be gone */ }
    onClose();
  };
  const onKey = (event) => {
    if (event.key !== 'Escape' || backdrop !== [...root.querySelectorAll('.pj-backdrop')].at(-1)) return;
    // A box open inside the dialog (the icons, the choice of memory) takes the key first and closes alone.
    if (backdrop.querySelector('.pj-popover, .pj-dropdown-list')) return;
    event.stopPropagation();
    event.preventDefault();
    close();
  };
  closeButton.addEventListener('click', () => { if (action) { close(); action.onClick(); } else close(); });
  if (dialog) backdrop.addEventListener('pointerdown', (event) => { if (event.target === backdrop) close(); });
  win.addEventListener('keydown', onKey, true);
  viewport?.addEventListener('resize', fit);
  viewport?.addEventListener('scroll', fit);
  fit();
  if (body) body(content, { close });
  const first = sheet.querySelector('input, textarea, button.pj-primary');
  first?.focus?.();
  return { close, element: sheet, body: content, setError: (message) => { error.textContent = message || ''; error.hidden = !message; } };
}

/**
 * A list of choices that comes up from below after an "add" button (the way the phone's own apps ask what to add): a title, and rows of an icon and a word. It is in the middle on a wide
 * screen. A tap outside, Escape or a choice closes it. `items` are [{ label, icon, action }]. Returns { close, element }.
 */
export function openActionSheet({ document, root, title, items, onClose = () => {} }) {
  const win = document.defaultView;
  const backdrop = make(document, 'div', 'pj-backdrop is-bottom');
  const sheet = make(document, 'div', 'pj-sheet pj-action-sheet');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', title || '');
  const heading = make(document, 'div', 'pj-action-title', title || '');
  heading.setAttribute('role', 'heading');
  heading.setAttribute('aria-level', '2');
  sheet.appendChild(heading);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    win.removeEventListener('keydown', onKey, true);
    backdrop.remove();
    onClose();
  };
  const onKey = (event) => {
    if (event.key !== 'Escape' || backdrop !== [...root.querySelectorAll('.pj-backdrop')].at(-1)) return;
    event.stopPropagation();
    event.preventDefault();
    close();
  };
  for (const item of items) {
    const row = make(document, 'button', 'pj-action-item');
    row.type = 'button';
    const icon = make(document, 'span', 'pj-menu-icon');
    icon.innerHTML = ICONS[item.icon]?.(22) || '';
    row.append(icon, make(document, 'span', 'pj-menu-label', item.label));
    row.addEventListener('click', () => { close(); void item.action(); });
    sheet.appendChild(row);
  }
  backdrop.appendChild(sheet);
  backdrop.addEventListener('pointerdown', (event) => { if (event.target === backdrop) close(); });
  win.addEventListener('keydown', onKey, true);
  root.appendChild(backdrop);
  sheet.querySelector('button')?.focus();
  return { close, element: sheet };
}
