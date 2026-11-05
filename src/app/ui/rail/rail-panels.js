// The panel is one place with different contents (docs/superpowers/specs/2026-11-05-desktop-rail-sidebar-design.md): the chats, the Extensions, the settings. The chats' is the left menu itself; the
// Extensions' is the list at the left of its page (ui/cli/cli-store.js, which draws its own title and the installed things); the settings' is the list of its parts, which gets here the title and the
// search that the other two have. Styles are in styles/rail.css; this makes the markup that is not in the settings' list yet. Words are put in with textContent.

const SVG_NS = 'http://www.w3.org/2000/svg';

function searchIcon(document) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  for (const [key, value] of Object.entries({ viewBox: '0 0 24 24', width: '16', height: '16', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) svg.setAttribute(key, value);
  svg.innerHTML = '<circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>';
  return svg;
}

/**
 * The title and the search above the list of the settings' parts. The search narrows the list to the parts whose name holds the words.
 * deps: document, text(key). Returns { labels() } or null when the page has no list of settings parts.
 */
export function mountSettingsHead({ document, text }) {
  const nav = document.querySelector('#settings-modal nav.settings-sidebar');
  if (!nav || nav.querySelector('.rail-panel-head')) return null;
  const head = document.createElement('div');
  head.className = 'rail-panel-head';
  const title = document.createElement('span');
  title.className = 'rail-panel-title';
  head.append(title);
  const search = document.createElement('label');
  search.className = 'rail-panel-search';
  const input = document.createElement('input');
  input.type = 'search';
  input.className = 'rail-panel-search-input';
  input.autocomplete = 'off';
  search.append(searchIcon(document), input);
  nav.prepend(head, search);
  const filter = () => {
    const needle = input.value.trim().toLowerCase();
    for (const item of nav.querySelectorAll('.settings-nav-item')) item.hidden = Boolean(needle) && !item.textContent.toLowerCase().includes(needle);
  };
  input.addEventListener('input', filter);
  const labels = () => {
    title.textContent = text('settings');
    input.placeholder = text('search');
    input.setAttribute('aria-label', text('search'));
  };
  labels();
  return { labels, filter };
}
