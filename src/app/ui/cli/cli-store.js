// The Extensions page (擴充; it began as the CLI tools' store, 命令工具, docs/superpowers/specs/2026-10-04-cli-store-design.md): a page over the chat
// with a back button and two parts, skills and CLI tools. On a wide screen the parts are a list at the left; on a phone they are a switch in the
// header, to the right of the title (docs/superpowers/specs/2026-10-04-cli-store-design.md, §15). Each part has a search box, the tabs All | Mine
// and its rows. The CLI part shows the tools as rows (the tool's mark, its name and words, a "+" to add it, a "…" to manage it once added). The look
// follows the directories of ChatGPT (Apps) and Claude (Connectors): one row for each, the action on the right, black and white.
// A tool is added by a record in the settings (nothing is downloaded: the server fetches the program when a message first uses it).

import { OFFICIAL_CLI_CATALOG, cliDescription, cliDetails, isCliReady } from '../../../data/cli-catalog.js';
import { OFFICIAL_SKILL_CATALOG, skillDescription, skillTitle } from '../../../data/skill-catalog.js';
import { addCli, canModelUseCli, isCliEnabled, removeCli, setCliModelUse } from '../../runtime/cli/cli-state.js';
import { cliText } from '../../runtime/cli/cli-texts.js';
import { skillText } from '../../runtime/skill/skill-texts.js';
import { formatFileSize } from '../skill/skill-file-size.js';
import { activeSkills, addSkill, canModelUseSkill, isSkillEnabled, removeSkill, setSkillModelUse } from '../../runtime/skill/skill-state.js';
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
export function openCliStore({ document = globalThis.document, kind = DEFAULT_STORE_KIND, getConfig, saveConfig = async () => {}, getLanguage, showNotification = () => {}, getAccountReady = () => true, onChange = () => {}, skillStore = null }) {
  if (current) {
    current.setKind(kind);
    return current;
  }
  const win = document.defaultView;
  // The words of the skills are in their own table (they are only needed here); every other word is the CLI part's.
  const t = (key, values) => (/^skill/.test(key) ? skillText(getLanguage(), key, values) : cliText(getLanguage(), key, values));
  const opener = document.activeElement;
  const addressKind = storeKindFromPath(win.location?.pathname);
  // Each part keeps its own tab and its own search while the page is open.
  const state = {
    kind: addressKind || (STORE_KINDS.includes(kind) ? kind : DEFAULT_STORE_KIND),
    views: { skills: { tab: 'all', query: '' }, cli: { tab: 'all', query: '' } },
    expanded: new Set(),
    // The files of skills with files that are open for reading: 'skill-name/path' -> { status: 'loading' | 'ready' | 'failed', text?, cut? }.
    openFiles: new Map(),
    // The text of the official skills whose details were opened (it is a file of its own, loaded then): name -> text.
    officialBodies: new Map(),
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
  const bar = make(document, 'div', 'cs-bar');
  const tabs = make(document, 'div', 'history-tabs cs-tabs');
  tabs.setAttribute('role', 'tablist');
  // Skills only: adding one by pasting its text.
  const paste = make(document, 'button', 'cs-button cs-paste', t('skillPaste'));
  paste.type = 'button';
  // Skills only: adding one as a zip with files (a hidden file box the button opens).
  const upload = make(document, 'button', 'cs-button cs-upload', t('skillUpload'));
  upload.type = 'button';
  const uploadInput = make(document, 'input', 'cs-upload-input');
  uploadInput.type = 'file';
  uploadInput.accept = '.zip,application/zip,application/x-zip-compressed';
  uploadInput.hidden = true;
  const barActions = make(document, 'div', 'cs-bar-actions');
  barActions.append(upload, paste);
  bar.append(tabs, barActions, uploadInput);
  const list = make(document, 'div', 'cs-list');
  // The page of third-party software and licences (the tools' licences are there too).
  const licenses = make(document, 'button', 'cs-link cs-footer-link', permissionText(getLanguage(), 'licensesLink'));
  licenses.type = 'button';
  licenses.addEventListener('click', async () => {
    const { openLicenses } = await import('./licenses-view.js');
    openLicenses({ document, getLanguage });
  });
  column.append(note, search, bar, list, licenses);
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
  // `owner` is the id of the row the menu belongs to; `items` are [{ label, action, check?, danger? }].
  const showMenu = (owner, anchor, items) => {
    closeMenu();
    state.menuFor = owner;
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
    for (const entry of items) item(entry.label, entry.action, { check: entry.check ?? null, danger: Boolean(entry.danger) });
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

  const toggleDetails = (id) => {
    if (state.expanded.has(id)) state.expanded.delete(id);
    else state.expanded.add(id);
    draw();
  };
  const openMenu = (tool, anchor) => {
    const config = getConfig();
    showMenu(tool.id, anchor, [
      { label: state.expanded.has(tool.id) ? t('hideDetails') : t('details'), action: () => toggleDetails(tool.id) },
      { label: t('allowModel'), action: () => change(() => setCliModelUse(getConfig(), tool.id, !canModelUseCli(getConfig(), tool.id))), check: canModelUseCli(config, tool.id) },
      { label: t('remove'), action: () => change(() => removeCli(getConfig(), tool.id), t('removed_notice', { name: tool.name })), danger: true }
    ]);
  };
  const openSkillMenu = (skill, anchor) => {
    const config = getConfig();
    showMenu(skill.name, anchor, [
      { label: state.expanded.has(skill.name) ? t('hideDetails') : t('details'), action: () => toggleDetails(skill.name) },
      { label: t('allowModel'), action: () => change(() => setSkillModelUse(getConfig(), skill.name, !canModelUseSkill(getConfig(), skill.name))), check: canModelUseSkill(config, skill.name) },
      { label: t('remove'), action: () => removeOwnSkill(skill), danger: true }
    ]);
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
    paste.hidden = state.kind !== 'skills';
    upload.hidden = state.kind !== 'skills';
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

  // ----- the skills: the official ones the person may add, and the ones they have (their own pasted ones come from the cloud, skill-store.js)
  const skillMatches = (skill) => {
    const needle = state.views.skills.query.trim().toLowerCase();
    return !needle || `${skill.name} ${skillTitle(skill, getLanguage())} ${skillDescription(skill, getLanguage())}`.toLowerCase().includes(needle);
  };
  const ownSkills = () => (skillStore ? skillStore.cached() : []);

  const skillRow = (skill) => {
    const config = getConfig();
    const added = skill.source === 'user' || isSkillEnabled(config, skill.name);
    const element = make(document, 'div', `cs-row cs-skill${added ? ' is-added' : ''}`);
    element.dataset.skillName = skill.name;
    const mark = make(document, 'div', 'cs-mark');
    mark.innerHTML = skillIcon(22);
    const text = make(document, 'button', 'cs-text');
    text.type = 'button';
    text.setAttribute('aria-expanded', String(state.expanded.has(skill.name)));
    const name = make(document, 'span', 'cs-name');
    name.append(make(document, 'span', 'cs-name-text', skillTitle(skill, getLanguage())));
    if (skill.source === 'official') name.append(make(document, 'span', 'cs-badge', t('official')));
    if ((skill.files || []).some((file) => file.kind === 'script')) name.append(make(document, 'span', 'cs-badge cs-badge-scripts', t('skillKindScript')));
    text.append(name, make(document, 'span', 'cs-desc', skillDescription(skill, getLanguage())));
    text.addEventListener('click', () => toggleDetails(skill.name));
    const action = make(document, 'div', 'cs-action');
    if (added) {
      action.append(make(document, 'span', 'cs-added', t('added')));
      const more = button(document, 'cs-icon-button', t('more'), ICONS.more);
      more.setAttribute('aria-haspopup', 'menu');
      more.addEventListener('click', (event) => {
        event.stopPropagation();
        if (state.menuFor === skill.name) closeMenu();
        else openSkillMenu(skill, more);
      });
      action.append(more);
    } else {
      const add = button(document, 'cs-add', `${t('add')}: ${skillTitle(skill, getLanguage())}`, ICONS.plus);
      add.addEventListener('click', () => change(() => addSkill(getConfig(), skill.name), t('skillAdded_notice', { name: skillTitle(skill, getLanguage()) })));
      action.append(add);
    }
    element.append(mark, text, action);
    if (state.expanded.has(skill.name)) {
      element.append(make(document, 'p', 'cs-about', skillDescription(skill, getLanguage())));
      // What the model is given, in full: a skill is read before it is trusted.
      const body = skill.body || state.officialBodies.get(skill.name) || '';
      if (!body && skill.source === 'official') loadOfficialBody(skill.name);
      element.append(make(document, 'pre', 'cs-skill-text', body || t('skillFileLoading')));
      const details = make(document, 'dl', 'cs-details');
      details.append(make(document, 'dt', '', t('skillDetailsSource')), make(document, 'dd', '', t(skill.source === 'official' ? 'skillSourceOfficial' : 'skillSourceYours')));
      if (skill.version) details.append(make(document, 'dt', '', t('version')), make(document, 'dd', '', skill.version));
      if (body) details.append(make(document, 'dt', '', t('skillDetailsSize')), make(document, 'dd', '', t('skillSizeChars', { count: body.length })));
      element.append(details);
      if (skill.files?.length) element.append(skillFiles(skill));
    }
    return element;
  };

  const askedBodies = new Set();
  const loadOfficialBody = (name) => {
    if (askedBodies.has(name)) return;
    askedBodies.add(name);
    import('../../../data/skill-catalog.js').then(({ loadOfficialSkillBody }) => loadOfficialSkillBody(name)).then((text) => {
      state.officialBodies.set(name, text || '');
      draw();
    }).catch(() => { askedBodies.delete(name); });
  };

  // The files of a skill that came as a zip: their names, and the text of one when it is clicked (the zip is opened from the cloud the first time).
  const fileKey = (skill, path) => `${skill.name}/${path}`;
  const toggleFile = async (skill, path) => {
    const key = fileKey(skill, path);
    if (state.openFiles.has(key)) {
      state.openFiles.delete(key);
      draw();
      return;
    }
    state.openFiles.set(key, { status: 'loading' });
    draw();
    let entry = { status: 'failed' };
    try {
      const opened = await skillStore?.openBundle(skill.name);
      if (opened?.ok) {
        const { bundleFileText } = await import('../../../data/skill-bundle.js');
        const text = bundleFileText(opened.files, path);
        entry = text ? { status: 'ready', text: text.text, cut: text.cut } : { status: 'ready', binary: true };
      }
    } catch {
      entry = { status: 'failed' };
    }
    if (state.openFiles.has(key)) state.openFiles.set(key, entry);
    draw();
  };
  const skillFiles = (skill) => {
    const box = make(document, 'div', 'cs-skill-files');
    box.append(make(document, 'strong', 'cs-skill-files-title', t('skillBundleFiles', { count: skill.files.length })));
    const listing = make(document, 'ul', 'cs-skill-file-list');
    for (const file of skill.files) {
      const item = make(document, 'li', 'cs-skill-file');
      const open = state.openFiles.get(fileKey(skill, file.path));
      const choose = make(document, 'button', 'cs-skill-file-button');
      choose.type = 'button';
      choose.setAttribute('aria-expanded', String(Boolean(open)));
      choose.append(make(document, 'span', 'cs-skill-file-path', file.path));
      if (file.kind === 'script') choose.append(make(document, 'span', 'cs-badge cs-badge-scripts', t('skillKindScript')));
      choose.append(make(document, 'span', 'cs-skill-file-size', formatFileSize(file.size)));
      choose.addEventListener('click', () => toggleFile(skill, file.path));
      item.append(choose);
      if (open) {
        if (open.status === 'loading') item.append(make(document, 'p', 'cs-skill-file-note', t('skillFileLoading')));
        else if (open.status === 'failed') item.append(make(document, 'p', 'cs-skill-file-note', t('skillFileFailed')));
        else if (open.binary) item.append(make(document, 'p', 'cs-skill-file-note', t('skillFileNoPreview')));
        else {
          item.append(make(document, 'pre', 'cs-skill-text cs-skill-file-text', open.text));
          if (open.cut) item.append(make(document, 'p', 'cs-skill-file-note', t('skillFileCut', { count: open.text.length })));
        }
      }
      listing.append(item);
    }
    box.append(listing);
    return box;
  };

  // A skill the person has is taken off the list; one they pasted is also deleted from the cloud (a failure leaves it as it was).
  const removeOwnSkill = async (skill) => {
    if (skill.source === 'user' && skillStore) {
      const result = await skillStore.remove(skill.name);
      if (!result.ok) {
        showNotification(t(`skillErr_${result.error}`), 'error');
        return;
      }
    }
    await change(() => removeSkill(getConfig(), skill.name), t('skillRemoved_notice', { name: skillTitle(skill, getLanguage()) }));
    draw();
  };

  // The person's own skills are read from the cloud once while the skills are on show; one that is in the cloud but not on the list (a save that
  // stopped half way) is put on it.
  let skillsAsked = false;
  const loadOwnSkills = () => {
    if (skillsAsked || !skillStore) return;
    skillsAsked = true;
    skillStore.list().then((result) => {
      if (closed || !result.ok) return;
      const config = getConfig();
      const missing = result.skills.filter((skill) => !isSkillEnabled(config, skill.name));
      if (missing.length) void change(() => missing.map((skill) => addSkill(getConfig(), skill.name)).some(Boolean));
      else draw();
    }).catch(() => {});
  };

  paste.addEventListener('click', async () => {
    if (!skillStore || !getAccountReady()) {
      showNotification(t('skillsNeedAccount'), 'error');
      return;
    }
    await skillStore.list().catch(() => {});
    const { openSkillPasteModal } = await import('../skill/skill-paste-modal.js');
    openSkillPasteModal({
      document,
      language: getLanguage(),
      existing: (name) => ownSkills().some((skill) => skill.name === name),
      onSubmit: async (text, { replace }) => {
        const result = await skillStore.add(text, { replace });
        if (!result.ok) return result;
        await change(() => addSkill(getConfig(), result.skill.name), t('skillAdded_notice', { name: result.skill.name }));
        draw();
        return result;
      }
    });
  });

  upload.addEventListener('click', () => {
    if (!skillStore || !getAccountReady()) {
      showNotification(t('skillsNeedAccount'), 'error');
      return;
    }
    uploadInput.value = '';
    uploadInput.click();
  });
  uploadInput.addEventListener('change', async () => {
    const file = uploadInput.files?.[0];
    uploadInput.value = '';
    if (!file || !skillStore) return;
    // The zip is read and every file in it checked before anything is shown; a pack that fails says why.
    const [{ readSkillBundle, SKILL_BUNDLE_LIMITS }, { openSkillBundleModal }] = await Promise.all([import('../../../data/skill-bundle.js'), import('../skill/skill-bundle-modal.js'), import('../skill/skill-bundle-modal.css').catch(() => {})]);
    if (file.size > SKILL_BUNDLE_LIMITS.zipBytes) {
      showNotification(t('skillErr_zip_too_large'), 'error');
      return;
    }
    const read = await readSkillBundle(new Uint8Array(await file.arrayBuffer())).catch(() => ({ ok: false, error: 'not_a_zip' }));
    if (!read.ok) {
      showNotification(`${t(`skillErr_${read.error}`)}${read.detail ? ` (${read.detail})` : ''}`, 'error');
      return;
    }
    await skillStore.list().catch(() => {});
    openSkillBundleModal({
      document,
      language: getLanguage(),
      read,
      existing: (name) => ownSkills().some((skill) => skill.name === name),
      onSubmit: async (pack, { replace }) => {
        const result = await skillStore.addBundle(pack, { replace });
        if (!result.ok) return result;
        state.openFiles.clear();
        await change(() => addSkill(getConfig(), result.skill.name), t('skillAdded_notice', { name: result.skill.name }));
        draw();
        return result;
      }
    });
  });

  const drawSkills = () => {
    loadOwnSkills();
    const config = getConfig();
    const mine = activeSkills(config, ownSkills()).filter(skillMatches);
    const official = OFFICIAL_SKILL_CATALOG.filter((skill) => !isSkillEnabled(config, skill.name)).map((skill) => ({ ...skill, source: 'official' })).filter(skillMatches);
    const parts = [];
    const query = state.views.skills.query.trim();
    if (view().tab === 'all') {
      const mineBox = section(t('skillsSectionMine'), mine.map((skill) => skillRow(skill)));
      const officialBox = section(t('sectionOfficial'), official.map((skill) => skillRow(skill)));
      if (mineBox) parts.push(mineBox);
      if (officialBox) parts.push(officialBox);
      if (!parts.length) {
        if (query) parts.push(make(document, 'div', 'cs-empty', t('skillsNoResults')));
        else {
          // No skill is on offer yet and the person has none: the part is there, its list says so.
          const empty = make(document, 'div', 'cs-empty cs-empty-soon');
          empty.append(make(document, 'strong', 'cs-empty-title', t('skillsSoon')), make(document, 'p', 'cs-empty-note', t('skillsSoonNote')));
          parts.push(empty);
        }
      }
    } else {
      parts.push(section(t('skillsSectionMine'), mine.map((skill) => skillRow(skill))) || make(document, 'div', 'cs-empty', query ? t('skillsNoResults') : t('skillsNoneMine')));
    }
    list.replaceChildren(...parts);
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
    // A window over the page (the one that takes a pasted skill) has the key first: it closes, and the page stays.
    if (document.querySelector('.skill-paste')) return;
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
