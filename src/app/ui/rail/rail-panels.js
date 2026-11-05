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

// The parts of the settings in groups, as the settings of the apps this one is modelled on have them (a small name above each group). A part that is not named here (one a later part adds) goes at the end of
// the first group. The order inside a group is the order of this list.
export const SETTINGS_GROUPS = Object.freeze([
  { key: 'railGroupPersonal', sections: ['user', 'personalization', 'accessibility', 'memory'] },
  { key: 'railGroupModels', sections: ['model-management', 'tool-models', 'permissions'] },
  { key: 'railGroupData', sections: ['data-management', 'privacy', 'trash', 'about'] }
]);

/** The group (its index) of a part of the settings. */
export const groupOfSection = (section) => {
  const at = SETTINGS_GROUPS.findIndex((group) => group.sections.includes(section));
  return at < 0 ? 0 : at;
};

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
  const list = nav.querySelector('#settings-nav') || nav.querySelector('ul');
  const headings = [];
  // The parts of the list in the order of the groups, with the name of each group above its first part. A part that comes later (a part adds itself to the list) is put in its place.
  const arrange = () => {
    if (!list) return;
    const items = [...list.querySelectorAll(':scope > .settings-nav-item[data-section]')];
    const rank = (item) => SETTINGS_GROUPS[groupOfSection(item.dataset.section)].sections.indexOf(item.dataset.section);
    const sorted = [...items].sort((left, right) => groupOfSection(left.dataset.section) - groupOfSection(right.dataset.section) || (rank(left) < 0 ? 99 : rank(left)) - (rank(right) < 0 ? 99 : rank(right)));
    const wanted = [];
    let last = -1;
    for (const item of sorted) {
      const group = groupOfSection(item.dataset.section);
      if (group !== last) {
        last = group;
        let heading = headings[group];
        if (!heading) {
          heading = document.createElement('li');
          heading.className = 'rail-panel-group';
          heading.setAttribute('role', 'presentation');
          headings[group] = heading;
        }
        heading.textContent = text(SETTINGS_GROUPS[group].key);
        wanted.push(heading);
      }
      wanted.push(item);
    }
    const now = [...list.children].filter((node) => wanted.includes(node) || node.classList.contains('rail-panel-group'));
    if (now.length === wanted.length && now.every((node, index) => node === wanted[index])) return;
    wanted.forEach((node, index) => { if (list.children[index] !== node) list.insertBefore(node, list.children[index] || null); });
  };
  const filter = () => {
    const needle = input.value.trim().toLowerCase();
    for (const item of nav.querySelectorAll('.settings-nav-item')) item.hidden = Boolean(needle) && !item.textContent.toLowerCase().includes(needle);
    // A group whose parts are all out of the way takes its name with it.
    for (const heading of headings.filter(Boolean)) {
      let shown = false;
      for (let node = heading.nextElementSibling; node && !node.classList.contains('rail-panel-group'); node = node.nextElementSibling) if (!node.hidden) shown = true;
      heading.hidden = !shown;
    }
  };
  input.addEventListener('input', filter);
  const win = document.defaultView;
  if (list && typeof win?.MutationObserver === 'function') new win.MutationObserver(() => { arrange(); filter(); }).observe(list, { childList: true });
  arrange();
  const labels = () => {
    title.textContent = text('settings');
    input.placeholder = text('search');
    input.setAttribute('aria-label', text('search'));
    headings.forEach((heading, group) => { if (heading) heading.textContent = text(SETTINGS_GROUPS[group].key); });
  };
  labels();
  return { labels, filter };
}
