// The Extensions page (擴充; it began as the CLI tools' store, 命令工具, docs/superpowers/specs/2026-10-04-cli-store-design.md): a page over the chat
// with a back button and two parts, skills and CLI tools. On a wide screen the parts are a list at the left; on a phone they are a switch in the
// header, to the right of the title (docs/superpowers/specs/2026-10-04-cli-store-design.md, §15). Each part has a search box, the tabs All | Mine
// and its rows. The CLI part shows the tools as rows (the tool's mark, its name and words, a "+" to add it, a "…" to manage it once added). The look
// follows the directories of ChatGPT (Apps) and Claude (Connectors): one row for each, the action on the right, black and white.
// A tool is added by a record in the settings (nothing is downloaded: the server fetches the program when a message first uses it).

import { OFFICIAL_CLI_CATALOG, cliDescription, cliDetails, isCliReady } from '../../../data/cli-catalog.js';
import { addCli, canModelUseCli, isCliEnabled, removeCli, setCliModelUse } from '../../runtime/cli/cli-state.js';
import { cliText } from '../../runtime/cli/cli-texts.js';
import { permissionText } from '../../runtime/cli/permission-texts.js';
import { extensionsIcon, skillIcon, terminalIcon, toolIconMarkup, watchToolIcons } from './cli-icons.js';
import { DEFAULT_STORE_KIND, STORE_KINDS, storeKindFromPath, storePath } from './store-path.js';

const ICONS = {
  back: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg>',
  search: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7.5"/><path d="m20.5 20.5-4.2-4.2"/></svg>',
  plus: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  check: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  more: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><circle cx="5.5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="18.5" cy="12" r="1.7"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>'
};

const make = (document, tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const button = (document, className, label, icon) => {
  const node = make(document, 'button', className);
  node.type = 'button';
  node.setAttribute('aria-label', label);
  node.title = label;
  node.innerHTML = icon;
  return node;
};

let current = null;

export const closeCliStore = () => current?.close();

/**
 * Opens the page (once; opened again it only turns to `kind`). Returns { close, element, setKind }. `kind` is the part to show ('skills', the
 * first, or 'cli'); when the page is opened by its address the address says which. `onChange` is told when the tools the person has changed.
 */
export function openCliStore({ document = globalThis.document, kind = DEFAULT_STORE_KIND, getConfig, saveConfig = async () => {}, getLanguage, showNotification = () => {}, getAccountReady = () => true, onChange = () => {} }) {
  if (current) {
    current.setKind(kind);
    return current;
  }
  const win = document.defaultView;
  const t = (key, values) => cliText(getLanguage(), key, values);
  const opener = document.activeElement;
  const addressKind = storeKindFromPath(win.location?.pathname);
  // Each part keeps its own tab and its own search while the page is open.
  const state = {
    kind: addressKind || (STORE_KINDS.includes(kind) ? kind : DEFAULT_STORE_KIND),
    views: { skills: { tab: 'all', query: '' }, cli: { tab: 'all', query: '' } },
    expanded: new Set(),
    menuFor: null
  };
  const view = () => state.views[state.kind];

  const root = make(document, 'div', 'cs');
  watchToolIcons(root, 22);
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', t('storeTitle'));

  const head = make(document, 'header', 'cs-head');
  const back = button(document, 'cs-back', t('back'), ICONS.back);
  const title = make(document, 'h1', 'cs-title');
  title.innerHTML = `${extensionsIcon(22, 'cs-title-icon')}<span></span>`;
  title.querySelector('span').textContent = t('storeTitle');
  // The two parts: a switch in the header on a phone, a list at the left on a wide screen (the style shows one of them).
  const kindLabel = (id) => t(id === 'skills' ? 'kindSkills' : 'kindCli');
  const switcher = make(document, 'div', 'cs-switch');
  switcher.setAttribute('role', 'tablist');
  switcher.setAttribute('aria-label', t('switchLabel'));
  const nav = make(document, 'nav', 'cs-nav');
  nav.setAttribute('role', 'tablist');
  nav.setAttribute('aria-orientation', 'vertical');
  nav.setAttribute('aria-label', t('switchLabel'));
  for (const id of STORE_KINDS) {
    const choose = make(document, 'button', 'cs-switch-item', kindLabel(id));
    choose.type = 'button';
    choose.dataset.kind = id;
    choose.setAttribute('role', 'tab');
    switcher.append(choose);
    const side = make(document, 'button', 'cs-nav-item');
    side.type = 'button';
    side.dataset.kind = id;
    side.setAttribute('role', 'tab');
    side.innerHTML = id === 'skills' ? skillIcon(18) : terminalIcon(18);
    side.append(make(document, 'span', '', kindLabel(id)));
    nav.append(side);
  }
  head.append(back, title, switcher);

  const split = make(document, 'div', 'cs-split');
  const body = make(document, 'main', 'cs-body');
  const column = make(document, 'div', 'cs-column');
  const note = make(document, 'div', 'cs-note');
  const search = make(document, 'label', 'cs-search');
  const searchInput = make(document, 'input', 'cs-search-input');
  searchInput.type = 'search';
  searchInput.autocomplete = 'off';
  const searchIcon = make(document, 'span', 'cs-search-icon');
  searchIcon.innerHTML = ICONS.search;
  search.append(searchIcon, searchInput);
  const tabs = make(document, 'div', 'history-tabs cs-tabs');
  tabs.setAttribute('role', 'tablist');
  const list = make(document, 'div', 'cs-list');
  // The page of third-party software and licences (the tools' licences are there too).
  const licenses = make(document, 'button', 'cs-link cs-footer-link', permissionText(getLanguage(), 'licensesLink'));
  licenses.type = 'button';
  licenses.addEventListener('click', async () => {
    const { openLicenses } = await import('./licenses-view.js');
    openLicenses({ document, getLanguage });
  });
  column.append(note, search, tabs, list, licenses);
  body.append(column);
  split.append(nav, body);
  const edgeBottom = make(document, 'div', 'cs-edge-bottom');
  root.append(head, split, edgeBottom);

  // ----- the menu of a row (a bottom sheet on a phone)
  let menu = null;
  const closeMenu = () => {
    menu?.remove();
    menu = null;
    state.menuFor = null;
    root.querySelector('.cs-sheet-backdrop')?.remove();
  };
  const openMenu = (tool, anchor) => {
    closeMenu();
    state.menuFor = tool.id;
    const config = getConfig();
    menu = make(document, 'div', 'cs-menu');
    menu.setAttribute('role', 'menu');
    const item = (label, action, { check = null, danger = false } = {}) => {
      const entry = make(document, 'button', `cs-menu-item${danger ? ' is-danger' : ''}`);
      entry.type = 'button';
      entry.setAttribute('role', check === null ? 'menuitem' : 'menuitemcheckbox');
      if (check !== null) entry.setAttribute('aria-checked', String(check));
      entry.append(make(document, 'span', 'cs-menu-label', label));
      if (check !== null) {
        const mark = make(document, 'span', 'cs-menu-check');
        mark.innerHTML = check ? ICONS.check : '';
        entry.append(mark);
      }
      entry.addEventListener('click', (event) => {
        event.stopPropagation();
        closeMenu();
        void action();
      });
      menu.append(entry);
    };
    item(state.expanded.has(tool.id) ? t('hideDetails') : t('details'), () => {
      if (state.expanded.has(tool.id)) state.expanded.delete(tool.id);
      else state.expanded.add(tool.id);
      draw();
    });
    item(t('allowModel'), () => change(() => setCliModelUse(getConfig(), tool.id, !canModelUseCli(getConfig(), tool.id))), { check: canModelUseCli(config, tool.id) });
    item(t('remove'), () => change(() => removeCli(getConfig(), tool.id), t('removed_notice', { name: tool.name })), { danger: true });
    if (win.matchMedia?.('(max-width: 640px)').matches) {
      const backdrop = make(document, 'div', 'cs-sheet-backdrop');
      backdrop.addEventListener('click', closeMenu);
      root.append(backdrop, menu);
      menu.classList.add('is-sheet');
    } else {
      const rect = anchor.getBoundingClientRect();
      menu.style.top = `${Math.min(rect.bottom + 6, win.innerHeight - 190)}px`;
      menu.style.right = `${Math.max(12, win.innerWidth - rect.right)}px`;
      root.append(menu);
    }
  };

  // ----- changing what the person has
  let saving = Promise.resolve();
  const change = (mutate, notice = '') => {
    const changed = mutate();
    if (!changed) return Promise.resolve();
    draw();
    onChange();
    if (notice) showNotification(notice, 'success');
    saving = saving.then(() => saveConfig()).catch((error) => console.warn('Saving the CLI tools failed.', error));
    return saving;
  };

  // ----- drawing
  const matches = (tool) => {
    const needle = view().query.trim().toLowerCase();
    return !needle || `${tool.name} ${tool.id} ${tool.author} ${cliDescription(tool, getLanguage())}`.toLowerCase().includes(needle);
  };

  const row = (tool) => {
    const config = getConfig();
    const added = isCliEnabled(config, tool.id);
    const element = make(document, 'div', `cs-row${added ? ' is-added' : ''}`);
    element.dataset.cliId = tool.id;
    // The picture is made once per tool and moved into each new row: drawing the list again (opening the details, a search) must not load the logos again.
    let mark = marks.get(tool.id);
    if (!mark) {
      mark = make(document, 'div', 'cs-mark');
      mark.innerHTML = toolIconMarkup(tool, 30);
      marks.set(tool.id, mark);
    }
    const text = make(document, 'button', 'cs-text');
    text.type = 'button';
    text.setAttribute('aria-expanded', String(state.expanded.has(tool.id)));
    const name = make(document, 'span', 'cs-name');
    name.append(make(document, 'span', 'cs-name-text', tool.name), make(document, 'span', 'cs-badge', t('official')));
    text.append(name, make(document, 'span', 'cs-desc', cliDescription(tool, getLanguage())));
    text.addEventListener('click', () => {
      if (state.expanded.has(tool.id)) state.expanded.delete(tool.id);
      else state.expanded.add(tool.id);
      draw();
    });
    const action = make(document, 'div', 'cs-action');
    if (added) {
      action.append(make(document, 'span', 'cs-added', t('added')));
      const more = button(document, 'cs-icon-button', t('more'), ICONS.more);
      more.setAttribute('aria-haspopup', 'menu');
      more.addEventListener('click', (event) => {
        event.stopPropagation();
        if (state.menuFor === tool.id) closeMenu();
        else openMenu(tool, more);
      });
      action.append(more);
    } else if (!isCliReady(tool)) {
      // Listed, but it needs what a later stage brings (the sandbox's network, the person's credentials).
      action.append(make(document, 'span', 'cs-soon', t('soon')));
    } else {
      const add = button(document, 'cs-add', `${t('add')}: ${tool.name}`, ICONS.plus);
      add.addEventListener('click', () => change(() => addCli(getConfig(), tool.id), t('added_notice', { name: tool.name })));
      action.append(add);
    }
    element.append(mark, text, action);
    if (state.expanded.has(tool.id)) {
      const about = cliDetails(tool, getLanguage());
      if (about) element.append(make(document, 'p', 'cs-about', about));
      const details = make(document, 'dl', 'cs-details');
      const entries = [[t('author'), tool.author], [t('license'), tool.license], [t('version'), tool.version]].filter(([, value]) => value);
      for (const [label, value] of entries) details.append(make(document, 'dt', '', label), make(document, 'dd', '', value));
      const link = make(document, 'a', 'cs-link', tool.homepage.replace(/^https?:\/\//, ''));
      link.href = tool.homepage;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      const site = make(document, 'dd');
      site.append(link);
      details.append(make(document, 'dt', '', t('website')), site);
      element.append(details);
    }
    return element;
  };

  const section = (label, rows) => {
    if (!rows.length) return null;
    const box = make(document, 'section', 'cs-section');
    box.append(make(document, 'h2', 'cs-section-title', label), ...rows);
    return box;
  };

  // Whether the account is ready is known a little after the page starts (when the page is opened by its address, or right after signing in): it is looked at again while the page is open.
  const marks = new Map();
  // The note about the account is for the CLI tools (they run on the server); the skills have nothing to say about it yet.
  const syncNote = () => { note.hidden = state.kind !== 'cli' || Boolean(getAccountReady()); };
  const noteTimer = win.setInterval(syncNote, 400);

  // The parts: which one is chosen shows on the switch (a phone) and on the list (a wide screen), and the search box follows it.
  const drawKinds = () => {
    for (const choose of root.querySelectorAll('[data-kind]')) choose.setAttribute('aria-selected', String(choose.dataset.kind === state.kind));
    const placeholder = t(state.kind === 'skills' ? 'skillsSearchPlaceholder' : 'searchPlaceholder');
    searchInput.placeholder = placeholder;
    searchInput.setAttribute('aria-label', placeholder);
    if (searchInput.value !== view().query) searchInput.value = view().query;
    licenses.hidden = state.kind !== 'cli';
  };

  const drawTabs = () => {
    tabs.replaceChildren(...[['all', t('tabAll')], ['mine', t('tabMine')]].map(([id, label]) => {
      const tab = make(document, 'button', 'history-tab', label);
      tab.type = 'button';
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', String(view().tab === id));
      tab.addEventListener('click', () => {
        view().tab = id;
        closeMenu();
        draw();
      });
      return tab;
    }));
  };

  // No skill is on offer yet: the part is there, its list says so.
  const drawSkills = () => {
    const empty = make(document, 'div', 'cs-empty');
    if (view().tab === 'all') {
      empty.classList.add('cs-empty-soon');
      empty.append(make(document, 'strong', 'cs-empty-title', t('skillsSoon')), make(document, 'p', 'cs-empty-note', t('skillsSoonNote')));
    } else {
      empty.textContent = t('skillsNoneMine');
    }
    list.replaceChildren(empty);
  };

  const draw = () => {
    drawKinds();
    syncNote();
    note.textContent = t('needAccount');
    drawTabs();
    if (state.kind === 'skills') {
      drawSkills();
      return;
    }
    const config = getConfig();
    const mine = OFFICIAL_CLI_CATALOG.filter((tool) => isCliEnabled(config, tool.id) && matches(tool));
    // The tools that can be added come first, the ones that are coming after them.
    const official = OFFICIAL_CLI_CATALOG.filter((tool) => !isCliEnabled(config, tool.id) && matches(tool)).sort((a, b) => Number(isCliReady(b)) - Number(isCliReady(a)));
    const parts = [];
    if (view().tab !== 'all' || mine.length) parts.push(section(t('sectionMine'), mine.map((tool) => row(tool))) || make(document, 'div', 'cs-empty', view().query ? t('noResults') : t('noneMine')));
    if (view().tab === 'all') {
      const box = section(t('sectionOfficial'), official.map((tool) => row(tool)));
      if (box) parts.push(box);
      if (!mine.length && !official.length) parts.push(make(document, 'div', 'cs-empty', t('noResults')));
    }
    list.replaceChildren(...parts.filter(Boolean));
  };

  // ----- closing
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    closeMenu();
    win.removeEventListener('keydown', onKey, true);
    win.removeEventListener('click', onClick, true);
    win.removeEventListener('popstate', onPopState);
    win.clearInterval(noteTimer);
    leaveAddress();
    root.remove();
    document.documentElement.classList.remove('cs-open');
    current = null;
    try {
      opener?.focus?.({ preventScroll: true });
    } catch { /* the opener is gone */ }
  };
  let lastKey = null;
  function onKey(event) {
    if (event.key !== 'Escape' || event === lastKey) return;
    lastKey = event;
    event.preventDefault();
    event.stopPropagation();
    if (menu) closeMenu();
    else close();
  }
  function onClick(event) {
    if (menu && !menu.contains(event.target) && !event.target.closest('.cs-icon-button')) closeMenu();
  }
  win.addEventListener('keydown', onKey, true);
  win.addEventListener('click', onClick, true);
  back.addEventListener('click', close);
  // The address: opening adds /skill or /cli to the history (the browser's back button closes the page); when the page was opened by the address
  // itself there is nothing to go back to, so closing puts / in its place. Turning to the other part changes the address in place (no new
  // history entry).
  let pushed = false;
  const history = win.history;
  const atStore = () => storeKindFromPath(win.location?.pathname) !== null;
  const showAddress = () => {
    try {
      if (!history || !win.location) return;
      if (atStore()) {
        if (win.location.pathname !== storePath(state.kind)) history.replaceState(history.state, '', storePath(state.kind));
      } else {
        history.pushState({ cliStore: true }, '', storePath(state.kind));
        pushed = true;
      }
    } catch { /* the address cannot be changed here: the page works without it */ }
  };
  showAddress();
  const setKind = (next) => {
    if (!STORE_KINDS.includes(next) || next === state.kind || closed) return;
    closeMenu();
    state.kind = next;
    showAddress();
    draw();
  };
  for (const choose of root.querySelectorAll('[data-kind]')) choose.addEventListener('click', () => setKind(choose.dataset.kind));
  function onPopState() {
    if (!atStore()) close();
  }
  function leaveAddress() {
    try {
      if (!history || !win.location || !atStore()) return;
      if (pushed && history.state?.cliStore) history.back();
      else history.replaceState(history.state, '', '/');
    } catch { /* the address stays */ }
  }
  win.addEventListener('popstate', onPopState);
  searchInput.addEventListener('input', () => {
    view().query = searchInput.value;
    draw();
  });

  document.body.append(root);
  document.documentElement.classList.add('cs-open');
  draw();
  back.focus?.({ preventScroll: true });
  current = { close, element: root, setKind, get kind() { return state.kind; } };
  return current;
}
