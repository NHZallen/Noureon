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

// What the search lists: the names of the settings (the labels of the lines of a part), at most this many.
const SETTING_NAMES = '.pz-label';
// The parts whose lines are buttons (export, import, send feedback) as well: the names of those buttons are searched too.
const ACTION_SECTIONS = new Set(['data-management', 'about']);
const MAX_RESULTS = 10;

/** The group (its index) of a part of the settings. */
export const groupOfSection = (section) => {
  const at = SETTINGS_GROUPS.findIndex((group) => group.sections.includes(section));
  return at < 0 ? 0 : at;
};

/**
 * The title, the search and the groups of the list of the settings' parts. The search looks into the parts as well as at their names.
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
  // The search finds settings, not every word of the page. A setting is a label of the page (the name of a line: "Interface language", "Accent colour") and the small text under it; the name of a part is found
  // too. What is listed is the name of the setting and the part it is in, the best matches first: the name of a part, a name that begins with the words, a name that has them, and last a setting whose small
  // text has them. Headings of cards, buttons and long texts are not listed (they are not settings), and a name that comes twice is listed once. A part that builds itself when it is first opened is
  // searched once it has been opened. The list is short: ten.
  const results = document.createElement('ul');
  results.className = 'rail-panel-results';
  results.hidden = true;
  nav.append(results);
  const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
  const find = (needle) => {
    const found = [];
    for (const item of list ? list.querySelectorAll(':scope > .settings-nav-item[data-section]') : []) {
      const name = normalize(item.textContent);
      const lower = name.toLowerCase();
      if (lower.includes(needle)) found.push({ label: name, section: name, item, node: null, rank: lower.startsWith(needle) ? 0 : 1 });
      const page = document.getElementById(`${item.dataset.section}-section`);
      if (!page) continue;
      const nodes = [...page.querySelectorAll(SETTING_NAMES), ...(ACTION_SECTIONS.has(item.dataset.section) ? [...page.querySelectorAll('button')].filter((button) => normalize(button.textContent).length >= 3) : [])];
      for (const node of nodes) {
        const label = normalize(node.textContent);
        if (!label || label.length > 60) continue;
        const hint = normalize(node.closest('.pz-row, .pz-key, .pz-text')?.querySelector('.pz-sub')?.textContent).toLowerCase();
        const own = label.toLowerCase();
        let rank = 9;
        if (own.startsWith(needle)) rank = 2;
        else if (own.includes(needle)) rank = 3;
        else if (hint.includes(needle)) rank = 4;
        if (rank < 9) found.push({ label, section: name, item, node, rank });
      }
    }
    const seen = new Set();
    return found.sort((left, right) => left.rank - right.rank).filter((result) => {
      const key = `${result.section}\u0000${result.label}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, MAX_RESULTS);
  };
  const flash = (node) => {
    const row = node.closest('.pz-row, .pz-key, .pz-card') || node;
    row.classList.add('rail-flash');
    document.defaultView?.setTimeout(() => row.classList.remove('rail-flash'), 1500);
  };
  const go = (result) => {
    result.item.click();
    if (!result.node) return;
    document.defaultView?.setTimeout(() => { result.node.scrollIntoView?.({ block: 'center' }); flash(result.node); }, 60);
  };
  const runSearch = () => {
    const needle = normalize(input.value).toLowerCase();
    if (list) list.hidden = Boolean(needle);
    results.hidden = !needle;
    if (!needle) { results.replaceChildren(); return; }
    const found = find(needle);
    results.replaceChildren(...(found.length ? found.map((result) => {
      const row = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'rail-panel-result';
      const label = document.createElement('span');
      label.className = 'rail-panel-result-label';
      label.textContent = result.label;
      const section = document.createElement('span');
      section.className = 'rail-panel-result-section';
      section.textContent = result.section;
      button.append(label, section);
      button.addEventListener('click', () => go(result));
      row.append(button);
      return row;
    }) : (() => { const empty = document.createElement('li'); empty.className = 'rail-panel-empty'; empty.textContent = text('railSearchEmpty'); return [empty]; })()));
  };
  input.addEventListener('input', runSearch);
  const win = document.defaultView;
  if (list && typeof win?.MutationObserver === 'function') new win.MutationObserver(() => { arrange(); }).observe(list, { childList: true });
  arrange();
  const labels = () => {
    title.textContent = text('settings');
    input.placeholder = text('search');
    input.setAttribute('aria-label', text('search'));
    headings.forEach((heading, group) => { if (heading) heading.textContent = text(SETTINGS_GROUPS[group].key); });
  };
  labels();
  return { labels, search: runSearch };
}
