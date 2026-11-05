// The little menu of the account that opens above the avatar at the foot of the rail: the name, then settings, the dashboard and logout. It lies beside the rail (fixed, to the right of its anchor,
// its foot in line with the anchor's), closes with a click outside it, Escape or a choice, and gives the focus back to the anchor. Words are put in with textContent.

const SVG_NS = 'http://www.w3.org/2000/svg';
const PATHS = Object.freeze({
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path><circle cx="12" cy="12" r="3"></circle>',
  dashboard: '<path d="M3 3v18h18"></path><path d="M7 16v-5"></path><path d="M12 16V8"></path><path d="M17 16v-3"></path>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line>'
});

function icon(document, name) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  for (const [key, value] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) svg.setAttribute(key, value);
  svg.innerHTML = PATHS[name] || '';
  return svg;
}

/**
 * deps: document, anchor (the button it opens from), title (the name), items [{ id, label, hint?, icon, danger?, action }], onClose().
 * Returns { close, element }.
 */
export function openRailMenu({ document, anchor, title = '', items, onClose = () => {} }) {
  const win = document.defaultView || globalThis;
  const menu = document.createElement('div');
  menu.className = 'rail-menu';
  menu.setAttribute('role', 'menu');
  if (title) {
    const head = document.createElement('div');
    head.className = 'rail-menu-title';
    head.textContent = title;
    menu.append(head);
  }
  let closed = false;
  const close = ({ refocus = true } = {}) => {
    if (closed) return;
    closed = true;
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', onKey, true);
    menu.remove();
    anchor?.setAttribute('aria-expanded', 'false');
    if (refocus) anchor?.focus?.();
    onClose();
  };
  function outside(event) { if (!menu.contains(event.target) && !anchor?.contains(event.target)) close({ refocus: false }); }
  function onKey(event) {
    if (event.key === 'Escape') { event.stopPropagation(); close(); return; }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const rows = [...menu.querySelectorAll('.rail-menu-item')];
    const at = rows.indexOf(document.activeElement);
    const next = event.key === 'ArrowDown' ? rows[(at + 1) % rows.length] : rows[(at <= 0 ? rows.length : at) - 1];
    event.preventDefault();
    next?.focus();
  }
  for (const item of items) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = `rail-menu-item${item.danger ? ' is-danger' : ''}`;
    row.setAttribute('role', 'menuitem');
    row.dataset.item = item.id;
    row.append(icon(document, item.icon));
    const label = document.createElement('span');
    label.className = 'rail-menu-label';
    label.textContent = item.label;
    row.append(label);
    if (item.hint) {
      const hint = document.createElement('span');
      hint.className = 'rail-menu-hint';
      hint.textContent = item.hint;
      row.append(hint);
    }
    row.addEventListener('click', () => { close({ refocus: false }); item.action(); });
    menu.append(row);
  }
  document.body.append(menu);
  anchor?.setAttribute('aria-expanded', 'true');
  const box = anchor?.getBoundingClientRect?.() || { right: 0, bottom: win.innerHeight || 0 };
  menu.style.left = `${Math.round(box.right + 8)}px`;
  menu.style.bottom = `${Math.max(8, Math.round((win.innerHeight || 0) - box.bottom))}px`;
  document.addEventListener('pointerdown', outside, true);
  document.addEventListener('keydown', onKey, true);
  menu.querySelector('.rail-menu-item')?.focus?.();
  return { close, element: menu };
}
