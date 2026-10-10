// The Permissions tab of the settings (docs/superpowers/specs/2026-10-04-cli-store-design.md, §2.3): the default for the network access of the CLI
// tools, and the permissions to manage under it, one row each with a count: the CLI tools (may the model use one by itself), the sites (allow,
// ask, refuse), and the secure credentials (add, show, replace, delete). Black and white, in the manner of the permission pages of Claude and ChatGPT.
// Everything is saved at once (not with the Save button of the settings), like the privacy tab.

import { cliCredentialInfo, cliDescription } from '../../../data/cli-catalog.js';
import { listNetSites, normalizeNetHost, normalizeNetRules, NET_DEFAULT_ALLOW } from '../../../data/cli-net.js';
import { enabledCliTools, canModelUseCli, setCliModelUse } from '../../runtime/cli/cli-state.js';
import { getNetMode, netRuleFor, removeNetSite, setNetMode, setNetRule } from '../../runtime/cli/net-state.js';
import { CREDENTIAL_NAME } from '../../runtime/cli/credentials-client.js';
import { permissionText } from '../../runtime/cli/permission-texts.js';
import { connectorText } from '../../runtime/connector/connector-texts.js';
import { toolIconMarkup, watchToolIcons } from './cli-icons.js';

const ICONS = {
  chevron: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>',
  back: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
  check: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>'
};
const RULES = ['allow', 'ask', 'deny'];
const RULE_KEYS = { allow: 'ruleAllow', ask: 'ruleAsk', deny: 'ruleDeny' };
const MASK = '••••••••••••';

const views = new WeakMap();

/** The tab opens at its first page again (the settings were closed and opened). */
export const resetPermissionsView = (root) => { const state = views.get(root); if (state) { state.view = 'home'; state.editing = state.adding = state.confirming = null; state.siteError = false; state.creds.status = 'idle'; state.connectors = null; } };

/** Goes back one page of the tab (to its first page) and says whether it did: false when it is already on the first page. */
export const goBackInPermissionsView = (root) => { const state = views.get(root); return state?.goBack ? state.goBack() : false; };

/** The credentials changed somewhere else (a window saved one): the list is read again the next time it is drawn. */
export const invalidatePermissionsCredentials = (root) => { const state = views.get(root); if (state) state.creds.status = 'idle'; };

const make = (document, tag, className = '', text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/**
 * Draws the tab into `root` (and again when something changes). `getLanguage()`, `getConfig()`, `saveConfig()` are the settings'; `credentials` is
 * { list, save, remove } (runtime/cli/credentials-client.js) and `hasAccount()` whether a cloud account is signed in (credentials need one);
 * `openStore()` opens the CLI store, `openLicenses()` the page of third-party software.
 */
const TYPE_KEYS = Object.freeze({ token: 'credTypeToken', cookie: 'credTypeCookie', password: 'credTypePassword' });

export function renderPermissionsView({ document, root, getLanguage, getConfig, saveConfig = async () => {}, credentials, hasAccount = () => true, openStore = () => {}, openLicenses = () => {}, showNotification = () => {} }) {
  const t = (key, values) => permissionText(getLanguage(), key, values);
  let state = views.get(root);
  if (!state) {
    state = { view: 'home', creds: { status: 'idle', items: [] }, shown: new Set(), editing: null, adding: null, confirming: null, siteError: false, menu: null };
    views.set(root, state);
  }
  const win = document.defaultView;
  const redraw = () => renderPermissionsView({ document, root, getLanguage, getConfig, saveConfig, credentials, hasAccount, openStore, openLicenses, showNotification });
  state.goBack = () => {
    if (state.view === 'home') return false;
    state.view = 'home';
    state.editing = state.adding = state.confirming = null;
    redraw();
    return true;
  };

  let saving = Promise.resolve();
  const save = () => {
    saving = saving.then(() => saveConfig()).catch((error) => console.warn('Saving the permissions failed.', error));
    return saving;
  };
  const change = (mutate) => {
    if (!mutate()) return;
    redraw();
    void save();
  };

  // ----- the secure credentials come from the server, once when they are first needed
  const loadCredentials = async (force = false) => {
    if (state.creds.status === 'loading' || (state.creds.status === 'ready' && !force)) return;
    if (!hasAccount()) {
      state.creds = { status: 'no-account', items: [] };
      return;
    }
    state.creds = { ...state.creds, status: 'loading' };
    const result = await credentials.list();
    state.creds = result.ok ? { status: 'ready', items: result.credentials } : { status: result.code === 'unavailable' ? 'no-account' : 'error', items: [] };
    redraw();
  };

  const closeMenu = () => {
    state.menu?.close();
    state.menu = null;
  };

  const backButton = () => {
    const back = make(document, 'button', 'pm-back');
    back.type = 'button';
    back.innerHTML = `${ICONS.back}<span></span>`;
    back.querySelector('span').textContent = t('back');
    back.addEventListener('click', () => { state.goBack(); });
    return back;
  };

  // ----- home: the default for the network, and the rows to manage
  const drawHome = () => {
    const config = getConfig();
    const block = make(document, 'div', 'pm-block pm-card');
    const netHead = make(document, 'div', 'pm-card-head');
    netHead.append(make(document, 'h4', 'pm-sub', t('netTitle')), make(document, 'p', 'pm-desc', t('netDesc')));
    block.append(netHead);
    const group = make(document, 'div', 'pm-options');
    group.setAttribute('role', 'radiogroup');
    for (const [value, label, description] of [['new', t('netNew'), t('netNewDesc')], ['always', t('netAlways'), t('netAlwaysDesc')]]) {
      const option = make(document, 'label', 'pm-option');
      const input = make(document, 'input');
      input.type = 'radio';
      input.name = 'cli-net-mode';
      input.value = value;
      input.checked = getNetMode(config) === value;
      input.addEventListener('change', () => { if (input.checked) change(() => setNetMode(getConfig(), value)); });
      const text = make(document, 'span', 'pm-option-text');
      text.append(make(document, 'span', 'pm-option-label', label), make(document, 'span', 'pm-option-desc', description));
      option.append(input, text);
      group.append(option);
    }
    block.append(group);

    const manage = make(document, 'div', 'pm-block pm-card');
    const manageHead = make(document, 'div', 'pm-card-head');
    manageHead.append(make(document, 'h4', 'pm-sub', t('manageTitle')));
    manage.append(manageHead);
    const list = make(document, 'div', 'pm-list');
    const credentialCount = state.creds.status === 'ready' ? String(state.creds.items.length) : '';
    for (const [view, label, count] of [['tools', t('rowTools'), String(enabledCliTools(config).length)], ['sites', t('rowSites'), String(listNetSites(config.netRules).length)], ['credentials', t('rowCredentials'), credentialCount], ['connectors', connectorText(getLanguage(), 'connectorRowTitle'), '']]) {
      const row = make(document, 'button', 'pm-row');
      row.type = 'button';
      row.dataset.view = view;
      row.append(make(document, 'span', 'pm-row-label', label), make(document, 'span', 'pm-count', count));
      const chevron = make(document, 'span', 'pm-chevron');
      chevron.innerHTML = ICONS.chevron;
      row.append(chevron);
      row.addEventListener('click', () => {
        state.view = view;
        if (view === 'credentials') void loadCredentials(true);
        redraw();
      });
      list.append(row);
    }
    manage.append(list);
    // The page of third-party software is one more row, in a card of its own.
    const licensesCard = make(document, 'div', 'pm-block pm-card');
    const licenses = make(document, 'button', 'pm-link', '');
    licenses.type = 'button';
    const licensesChevron = make(document, 'span', 'pm-chevron');
    licensesChevron.innerHTML = ICONS.chevron;
    licenses.append(make(document, 'span', 'pm-row-label', t('licensesLink')), licensesChevron);
    licenses.addEventListener('click', openLicenses);
    licensesCard.append(licenses);
    root.append(block, manage, licensesCard);
    // The number of credentials is known once they are loaded (a person with an account sees it without opening the row).
    if (state.creds.status === 'idle') void loadCredentials();
  };

  // ----- the CLI tools: may the model use one by itself
  const drawTools = () => {
    const config = getConfig();
    root.append(backButton(), make(document, 'h4', 'pm-sub', t('rowTools')), make(document, 'p', 'pm-desc', t('toolsDesc')));
    const tools = enabledCliTools(config);
    if (!tools.length) {
      root.append(make(document, 'p', 'pm-empty', t('toolsNone')));
      const open = make(document, 'button', 'pm-button', t('toolsOpenStore'));
      open.type = 'button';
      open.addEventListener('click', openStore);
      root.append(open);
      return;
    }
    const list = make(document, 'div', 'pm-list');
    for (const tool of tools) {
      const on = canModelUseCli(config, tool.id);
      const row = make(document, 'div', 'pm-row pm-row-static');
      const mark = make(document, 'span', 'pm-mark');
      mark.innerHTML = toolIconMarkup(tool, 24);
      const text = make(document, 'span', 'pm-row-text');
      text.append(make(document, 'span', 'pm-row-label', tool.name), make(document, 'span', 'pm-row-desc', t('modelUse')));
      // The very same switch as the other settings (the blue one, with its markup and classes as in the shell template), so it looks and answers alike.
      const toggle = make(document, 'div', 'pm-switch relative inline-block w-12 h-6 mr-2 align-middle select-none transition duration-200 ease-in');
      const input = make(document, 'input', 'toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer');
      input.type = 'checkbox';
      input.id = `pm-model-use-${tool.id}`;
      input.checked = on;
      input.setAttribute('role', 'switch');
      input.setAttribute('aria-label', `${tool.name}: ${t('modelUse')}`);
      const track = make(document, 'label', 'toggle-label block overflow-hidden h-6 rounded-full bg-gray-300 cursor-pointer');
      track.htmlFor = input.id;
      toggle.append(input, track);
      // Like the switches of Auxiliary features it slides where it is: the page is not drawn again (a new switch would show no motion), the choice is only saved.
      input.addEventListener('change', () => {
        if (!setCliModelUse(getConfig(), tool.id, input.checked)) input.checked = canModelUseCli(getConfig(), tool.id);
        else void save();
      });
      row.append(mark, text, toggle);
      list.append(row);
      row.title = cliDescription(tool, getLanguage());
    }
    watchToolIcons(list, 24);
    root.append(list);
  };

  // ----- the connectors: what each tool of a connection may do (the part and its style are loaded when this page is first opened)
  const drawConnectors = () => {
    root.append(backButton(), make(document, 'h4', 'pm-sub', connectorText(getLanguage(), 'connectorRowTitle')), make(document, 'p', 'pm-desc', connectorText(getLanguage(), 'connectorSettingsDesc')));
    const box = make(document, 'div', 'pm-connectors');
    root.append(box);
    state.connectorsBox = box;
    const show = () => { if (state.connectorsBox === box && state.connectors) box.replaceChildren(...state.connectors.permissionNodes()); };
    if (state.connectors) {
      show();
      return;
    }
    Promise.all([import('./connectors-part.js'), import('./cli-store.css').catch(() => {})]).then(([{ createConnectorsPart }]) => {
      state.connectors = createConnectorsPart({
        document,
        win,
        t: (key, values) => connectorText(getLanguage(), key, values),
        getLanguage,
        getAccountReady: hasAccount,
        redraw: () => { if (state.connectorsBox?.isConnected && state.view === 'connectors') state.connectorsBox.replaceChildren(...state.connectors.permissionNodes()); },
        showNotification
      });
      show();
    }).catch((error) => console.warn('Loading the connectors failed.', error));
  };

  // ----- the sites
  const openRuleMenu = (host, anchor) => {
    closeMenu();
    const config = getConfig();
    const current = netRuleFor(config, host);
    const menu = make(document, 'div', 'pm-menu');
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', t('siteMenu', { host }));
    const item = (label, action, { checked = false, danger = false } = {}) => {
      const entry = make(document, 'button', `pm-menu-item${danger ? ' is-danger' : ''}`);
      entry.type = 'button';
      entry.setAttribute('role', 'menuitem');
      entry.append(make(document, 'span', '', label));
      const mark = make(document, 'span', 'pm-menu-check');
      mark.innerHTML = checked ? ICONS.check : '';
      entry.append(mark);
      entry.addEventListener('click', (event) => {
        event.stopPropagation();
        closeMenu();
        action();
      });
      menu.append(entry);
    };
    for (const rule of RULES) item(t(RULE_KEYS[rule]), () => change(() => setNetRule(getConfig(), host, rule)), { checked: current === rule });
    const builtin = NET_DEFAULT_ALLOW.includes(host);
    const listed = Object.prototype.hasOwnProperty.call(normalizeNetRules(config.netRules), host);
    if (builtin && listed) item(t('siteReset'), () => change(() => removeNetSite(getConfig(), host)));
    if (!builtin) item(t('siteRemove'), () => change(() => removeNetSite(getConfig(), host)), { danger: true });
    const phone = win.matchMedia?.('(max-width: 768px)').matches;
    const backdrop = make(document, 'div', phone ? 'pm-backdrop is-sheet' : 'pm-backdrop');
    if (phone) menu.classList.add('is-sheet');
    else {
      const rect = anchor.getBoundingClientRect();
      menu.style.top = `${Math.min(rect.bottom + 4, win.innerHeight - 190)}px`;
      menu.style.left = `${Math.max(12, Math.min(rect.right - 190, win.innerWidth - 202))}px`;
    }
    const onKey = (event) => { if (event.key === 'Escape') { event.stopPropagation(); closeMenu(); } };
    backdrop.addEventListener('click', closeMenu);
    document.addEventListener('keydown', onKey, true);
    document.body.append(backdrop, menu);
    state.menu = { close: () => { document.removeEventListener('keydown', onKey, true); backdrop.remove(); menu.remove(); } };
    menu.querySelector('button')?.focus();
  };

  const drawSites = () => {
    const config = getConfig();
    root.append(backButton(), make(document, 'h4', 'pm-sub', t('rowSites')), make(document, 'p', 'pm-desc', t('sitesDesc')));
    const form = make(document, 'form', 'pm-add');
    const input = make(document, 'input', 'pm-input');
    input.type = 'text';
    input.placeholder = t('siteAddPlaceholder');
    input.setAttribute('aria-label', t('siteAddPlaceholder'));
    input.autocomplete = 'off';
    input.autocapitalize = 'off';
    input.spellcheck = false;
    const add = make(document, 'button', 'pm-button', t('siteAdd'));
    add.type = 'submit';
    form.append(input, add);
    const error = make(document, 'p', 'pm-error', t('siteBad'));
    error.hidden = !state.siteError;
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const host = normalizeNetHost(input.value);
      if (!host) {
        state.siteError = true;
        error.hidden = false;
        return;
      }
      state.siteError = false;
      // A site added by hand is one the person means to allow.
      if (setNetRule(getConfig(), host, 'allow')) void save();
      redraw();
    });
    root.append(form, error);
    const list = make(document, 'div', 'pm-list');
    for (const site of listNetSites(config.netRules)) {
      const row = make(document, 'div', 'pm-row pm-row-static');
      row.dataset.host = site.host;
      const text = make(document, 'span', 'pm-row-text');
      const label = make(document, 'span', 'pm-row-label pm-host', site.host);
      text.append(label);
      if (site.builtin) text.append(make(document, 'span', 'pm-row-desc', t('siteDefault')));
      const rule = make(document, 'button', 'pm-rule');
      rule.type = 'button';
      rule.setAttribute('aria-haspopup', 'menu');
      rule.setAttribute('aria-label', `${site.host}: ${t(RULE_KEYS[site.rule])}`);
      rule.append(make(document, 'span', '', t(RULE_KEYS[site.rule])));
      const down = make(document, 'span', 'pm-rule-icon');
      down.innerHTML = ICONS.down;
      rule.append(down);
      rule.addEventListener('click', (event) => {
        event.stopPropagation();
        openRuleMenu(site.host, rule);
      });
      row.append(text, rule);
      list.append(row);
    }
    root.append(list);
  };

  // ----- the secure credentials
  const saveCredentialFrom = async (name, value, { replacing }) => {
    if (!CREDENTIAL_NAME.test(name)) return t('credBadName');
    const result = await credentials.save(name, value);
    if (!result.ok) {
      if (result.reason === 'bad_value') return t('credBadValue');
      if (result.reason === 'too_many') return t('credTooMany');
      return result.code === 'unreachable' ? t('credUnreachable') : t('credFailed');
    }
    showNotification(t('credSaved', { name }), 'success');
    state.adding = null;
    state.editing = null;
    if (!replacing) state.shown.delete(name);
    await loadCredentials(true);
    return '';
  };

  const valueForm = ({ name, fixedName, replacing, initial = '' }) => {
    const form = make(document, 'form', 'pm-form');
    const nameInput = make(document, 'input', 'pm-input pm-mono');
    nameInput.type = 'text';
    nameInput.value = name || '';
    nameInput.placeholder = t('credName');
    nameInput.setAttribute('aria-label', t('credName'));
    nameInput.autocomplete = 'off';
    nameInput.spellcheck = false;
    nameInput.readOnly = Boolean(fixedName);
    const valueInput = make(document, 'input', 'pm-input pm-mono');
    valueInput.type = 'password';
    valueInput.value = initial;
    valueInput.placeholder = t('credValue');
    valueInput.setAttribute('aria-label', t('credValue'));
    valueInput.autocomplete = 'off';
    valueInput.spellcheck = false;
    const error = make(document, 'p', 'pm-error');
    error.hidden = true;
    const actions = make(document, 'div', 'pm-actions');
    const submit = make(document, 'button', 'pm-button is-primary btn-primary', t('credSave'));
    submit.type = 'submit';
    const cancel = make(document, 'button', 'pm-button', t('credCancel'));
    cancel.type = 'button';
    cancel.addEventListener('click', () => { state.adding = null; state.editing = null; redraw(); });
    actions.append(submit, cancel);
    form.append(...(fixedName ? [] : [nameInput]), valueInput, error, actions);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      submit.disabled = true;
      const problem = await saveCredentialFrom((fixedName || nameInput.value).trim(), valueInput.value, { replacing });
      if (problem) {
        error.textContent = problem;
        error.hidden = false;
        submit.disabled = false;
      }
    });
    return form;
  };

  const credentialRow = (item) => {
    const row = make(document, 'div', 'pm-cred');
    row.dataset.name = item.name;
    const head = make(document, 'div', 'pm-cred-head');
    const shown = state.shown.has(item.name);
    const info = cliCredentialInfo(item.name);
    if (info) {
      const label = make(document, 'span', 'pm-row-text');
      label.append(make(document, 'span', 'pm-row-label', `${info.tool.name} · ${t(TYPE_KEYS[info.type] || 'credTypeToken')}`), make(document, 'span', 'pm-row-desc pm-mono', info.label));
      head.append(label);
    } else head.append(make(document, 'span', 'pm-row-label pm-mono', item.name));
    const value = make(document, 'span', 'pm-cred-value pm-mono', shown ? item.value : MASK);
    const actions = make(document, 'div', 'pm-cred-actions');
    const action = (label, handler, danger = false) => {
      const button = make(document, 'button', `pm-chip${danger ? ' is-danger' : ''}`, label);
      button.type = 'button';
      button.addEventListener('click', handler);
      actions.append(button);
    };
    action(shown ? t('credHide') : t('credShow'), () => { if (shown) state.shown.delete(item.name); else state.shown.add(item.name); redraw(); });
    action(t('credReplace'), () => { state.editing = item.name; state.adding = null; redraw(); });
    if (state.confirming === item.name) {
      action(t('credDeleteConfirm'), async () => {
        const result = await credentials.remove(item.name);
        state.confirming = null;
        if (result.ok) {
          showNotification(t('credDeleted', { name: item.name }), 'success');
          await loadCredentials(true);
        } else {
          showNotification(result.code === 'unreachable' ? t('credUnreachable') : t('credFailed'), 'error');
          redraw();
        }
      }, true);
      action(t('credCancel'), () => { state.confirming = null; redraw(); });
    } else action(t('credDelete'), () => { state.confirming = item.name; redraw(); }, true);
    row.append(head, value, actions);
    if (state.editing === item.name) row.append(valueForm({ name: item.name, fixedName: item.name, replacing: true }));
    return row;
  };

  const drawCredentials = () => {
    if (state.creds.status === 'idle') void loadCredentials();
    root.append(backButton(), make(document, 'h4', 'pm-sub', t('rowCredentials')), make(document, 'p', 'pm-desc', t('credDesc')));
    if (state.creds.status === 'no-account') {
      root.append(make(document, 'p', 'pm-empty', t('credNeedAccount')));
      return;
    }
    if (state.creds.status === 'error') {
      root.append(make(document, 'p', 'pm-error', t('credUnreachable')));
      return;
    }
    if (state.creds.status !== 'ready') {
      root.append(make(document, 'p', 'pm-empty', t('credLoading')));
      return;
    }
    if (state.creds.items.length) {
      const list = make(document, 'div', 'pm-list');
      for (const item of state.creds.items) list.append(credentialRow(item));
      root.append(list);
    } else root.append(make(document, 'p', 'pm-empty', t('credNone')));
    // A credential of any name (for a tool that is not in the store yet).
    root.append(make(document, 'h5', 'pm-minor', t('credAddTitle')));
    if (state.adding === '') root.append(valueForm({ name: '', fixedName: '', replacing: false }));
    else {
      const open = make(document, 'button', 'pm-button', t('credAddTitle'));
      open.type = 'button';
      open.addEventListener('click', () => { state.adding = ''; state.editing = null; redraw(); });
      root.append(open);
    }
  };

  // ----- draw
  closeMenu();
  root.replaceChildren();
  // (The title of the tab is drawn by the settings themselves from the tab's name.)
  root.classList.add('pm');
  if (state.view === 'tools') drawTools();
  else if (state.view === 'sites') drawSites();
  else if (state.view === 'credentials') drawCredentials();
  else if (state.view === 'connectors') drawConnectors();
  else drawHome();
  return {};
}
