// The connectors part (連接器) of the Extensions page (docs/superpowers/specs/2026-10-10-mcp-connectors-design.md; the look is set C of the owner's choice): the list is grouped
// (notes and projects, development), each row with the connector's mark, its words and, at the right, "Connected" or "Connect ›". Choosing a connector that is not
// connected opens a sheet that says what will happen (and, where the service allows it, lets the person choose a read-only login), then the whole page goes to the
// service's login (not a pop-up: a phone blocks them) and comes back to /connectors. A connected connector is shown under Mine: its access, and its tools in two
// groups, reading and writing, each with one setting for the group (allow, ask, refuse) and a list that sets each tool apart. Whatever the person sets stands.
// Everything a service says (a tool's description) is put in as text, never as markup.

import { CONNECTORS, CONNECTOR_CATEGORIES, connectorDescription, hasReadonlyLogin } from '../../../data/connector-catalog.js';
import { connectorMark } from './connector-mark.js';
import { disconnectConnector, listConnectors, refreshConnector, saveToolStates, startConnector } from '../../runtime/connector/connectors-client.js';

const STATES = Object.freeze(['allow', 'ask', 'deny']);
const STATE_KEYS = Object.freeze({ allow: 'connectorStateAllow', ask: 'connectorStateAsk', deny: 'connectorStateDeny' });
const DEFAULT_STATE = Object.freeze({ read: 'allow', write: 'ask' });
const CHEVRON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';

/**
 * `t(key, values)` gives the words; `getLanguage()` the language; `redraw()` asks the page to draw its list again; `showNotification(text, kind)` says something.
 * Returns { draw(view) -> nodes, load(), handleReturn(search) -> { goMine }, state }.
 */
export function createConnectorsPart({ document, win, t, getLanguage, getAccountReady = () => true, redraw = () => {}, showNotification = () => {} }) {
  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  // What the server says: { status: 'idle' | 'loading' | 'ready' | 'failed', byId: Map(id -> { id, status, mode, tools, error }) }.
  // `closedPerms`: the permissions of a connection the person folded under Mine; `openPerms`: the ones opened in the settings (folded at first); `expanded`: the rows of the list opened in place.
  const state = { status: 'idle', byId: new Map(), openGroups: new Set(), closedPerms: new Set(), openPerms: new Set(), expanded: new Set(), confirming: null, sheet: null };
  const connectionOf = (id) => state.byId.get(id) || { id, status: 'none', mode: 'readwrite', tools: [], error: '' };

  const load = async () => {
    if (state.status === 'loading' || !getAccountReady()) return;
    // The page is drawing (it asked for this): it shows "Loading" itself, and draws again when the answer is here.
    state.status = 'loading';
    const result = await listConnectors();
    if (result.ok) {
      state.byId = new Map(result.connectors.map((entry) => [entry.id, entry]));
      state.status = 'ready';
    } else state.status = 'failed';
    redraw();
  };

  // ----- coming back from the service's login: /connectors?connector=linear&connected=1, or &connector_error=denied
  const handleReturn = (search = '') => {
    const params = new URLSearchParams(search);
    const id = params.get('connector') || '';
    const error = params.get('connector_error') || '';
    const connected = params.get('connected') === '1';
    if (!id && !error) return { goMine: false };
    const connector = CONNECTORS.find((entry) => entry.id === id);
    if (connected && connector) showNotification(t('connectorConnected_notice', { name: connector.name }), 'success');
    else if (error) showNotification(t(['denied', 'expired', 'bad_state', 'busy'].includes(error) ? `connectorErr_${error}` : 'connectorErr_failed'), 'error');
    try {
      win.history?.replaceState(win.history.state, '', '/connectors');
    } catch { /* the address stays */ }
    // The list is read again: the connection is new.
    state.status = 'idle';
    return { goMine: connected };
  };

  // ----- the sheet that begins a login
  let leavePageshow = null;
  const closeSheet = () => {
    state.sheet?.remove();
    state.sheet = null;
    leavePageshow?.();
    leavePageshow = null;
  };
  const segmented = (options, current, onPick, label) => {
    const box = make('div', 'cs-seg');
    box.setAttribute('role', 'group');
    if (label) box.setAttribute('aria-label', label);
    for (const [value, text] of options) {
      const item = make('button', 'cs-seg-item', text);
      item.type = 'button';
      item.setAttribute('aria-pressed', String(value === current));
      item.addEventListener('click', () => { if (value !== current) onPick(value); });
      box.append(item);
    }
    return box;
  };
  const openSheet = (connector, { mode = 'readwrite', switching = false } = {}) => {
    closeSheet();
    let chosen = mode;
    const backdrop = make('div', 'cs-dialog-backdrop');
    const dialog = make('div', 'cs-dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', t('connectorSheetTitle', { name: connector.name }));
    const body = make('div', 'cs-dialog-body');
    const failure = make('p', 'cs-dialog-error');
    failure.hidden = true;
    const go = make('button', 'cs-button cs-button-primary', t('connectorSheetGo'));
    go.type = 'button';
    const cancel = make('button', 'cs-button', t('connectorCancel'));
    cancel.type = 'button';
    const drawBody = () => {
      const nodes = [make('h2', 'cs-dialog-title', t('connectorSheetTitle', { name: connector.name })), make('p', 'cs-dialog-text', connectorDescription(connector, getLanguage()))];
      if (hasReadonlyLogin(connector)) {
        nodes.push(make('strong', 'cs-dialog-label', t('connectorScopeTitle')));
        nodes.push(segmented([['readonly', t('connectorScopeReadonly')], ['readwrite', t('connectorScopeReadwrite')]], chosen, (value) => { chosen = value; drawBody(); }));
        nodes.push(make('p', 'cs-dialog-note', t(chosen === 'readonly' ? 'connectorScopeNoteReadonly' : 'connectorScopeNoteReadwrite', { name: connector.name })));
      } else nodes.push(make('p', 'cs-dialog-note', t('connectorScopeFixed')));
      nodes.push(make('p', 'cs-dialog-note', switching ? t('connectorScopeSwitch', { name: connector.name }) : t('connectorSheetNote', { name: connector.name })));
      nodes.push(make('p', 'cs-dialog-note', t('connectorSheetPrivacy')));
      body.replaceChildren(...nodes);
    };
    drawBody();
    const actions = make('div', 'cs-dialog-actions');
    actions.append(cancel, go);
    dialog.append(body, failure, actions);
    backdrop.append(dialog);
    backdrop.addEventListener('click', (event) => { if (event.target === backdrop) closeSheet(); });
    cancel.addEventListener('click', closeSheet);
    // The person may come back from the service's page with the browser's back button: the page is then shown as it was left (a "Going there…" button that
    // cannot be pressed). It is put back, and "Cancel" is never disabled, so the sheet can always be closed.
    const reset = () => {
      go.disabled = false;
      go.textContent = t('connectorSheetGo');
    };
    win.addEventListener?.('pageshow', reset);
    leavePageshow = () => win.removeEventListener?.('pageshow', reset);
    go.addEventListener('click', async () => {
      go.disabled = true;
      go.textContent = t('connectorSheetBusy');
      failure.hidden = true;
      const result = await startConnector(connector.id, chosen);
      if (result.ok) {
        // The whole page goes to the service (a pop-up would be blocked on a phone) and comes back to /connectors.
        win.location.assign(result.url);
        return;
      }
      reset();
      failure.textContent = t('connectorSheetFailed');
      failure.hidden = false;
    });
    (document.querySelector('.cs') || document.body).append(backdrop);
    state.sheet = backdrop;
    go.focus?.({ preventScroll: true });
  };

  // ----- the tools: the settings are changed here at once and kept by the server (a failure puts them back)
  const setStates = async (connectorId, names, value) => {
    const connection = connectionOf(connectorId);
    const before = new Map(connection.tools.map((tool) => [tool.name, { state: tool.state, changed: tool.changed }]));
    const chosen = new Set(names);
    for (const tool of connection.tools) if (chosen.has(tool.name)) { tool.state = value; tool.changed = false; }
    redraw();
    const result = await saveToolStates(connectorId, Object.fromEntries(names.map((name) => [name, value])));
    if (!result.ok) {
      for (const tool of connection.tools) if (before.has(tool.name)) Object.assign(tool, before.get(tool.name));
      showNotification(t('connectorSaveFailed'), 'error');
      redraw();
    }
  };

  const groupState = (tools, kind) => {
    const counts = new Map();
    for (const tool of tools) counts.set(tool.state, (counts.get(tool.state) || 0) + 1);
    const best = Math.max(0, ...counts.values());
    // The state most of the tools are in; a tie goes to the default of the group.
    const tied = STATES.filter((value) => counts.get(value) === best);
    return tied.includes(DEFAULT_STATE[kind]) ? DEFAULT_STATE[kind] : tied[0] || DEFAULT_STATE[kind];
  };

  const stateButtons = (current, onPick) => segmented(STATES.map((value) => [value, t(STATE_KEYS[value])]), current, onPick);

  const toolRow = (connector, tool) => {
    const item = make('div', 'cs-tool');
    const text = make('div', 'cs-tool-text');
    text.append(make('code', 'cs-tool-name', tool.name));
    if (tool.description) text.append(make('span', 'cs-tool-desc', tool.description));
    if (tool.changed) text.append(make('span', 'cs-tool-changed', t('connectorChanged')));
    item.append(text, stateButtons(tool.state, (value) => setStates(connector.id, [tool.name], value)));
    return item;
  };

  const group = (connector, connection, kind) => {
    const tools = connection.tools.filter((tool) => tool.kind === kind);
    if (!tools.length) return null;
    const settled = tools.filter((tool) => !tool.changed);
    const current = groupState(settled.length ? settled : tools, kind);
    const differs = tools.filter((tool) => tool.state !== current).length;
    const key = `${connector.id}:${kind}`;
    const open = state.openGroups.has(key);
    const box = make('section', 'cs-conn-card cs-group');
    const head = make('div', 'cs-group-head');
    head.append(make('h3', 'cs-group-title', `${t(kind === 'read' ? 'connectorGroupRead' : 'connectorGroupWrite')} (${tools.length})`));
    // A tool that is new or changed is not set by the group: the person looks at it on its own.
    head.append(stateButtons(current, (value) => setStates(connector.id, settled.map((tool) => tool.name), value)));
    const toggle = make('button', 'cs-group-toggle');
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', String(open));
    toggle.append(make('span', '', `${t('connectorIndividual')}${differs ? ` (${t('connectorDiffers', { count: differs })})` : ''}`));
    const arrow = make('span', 'cs-group-arrow');
    arrow.innerHTML = CHEVRON;
    toggle.append(arrow);
    toggle.addEventListener('click', () => {
      if (state.openGroups.has(key)) state.openGroups.delete(key);
      else state.openGroups.add(key);
      redraw();
    });
    box.append(head, toggle);
    if (open) {
      const rows = make('div', 'cs-tools');
      for (const tool of tools) rows.append(toolRow(connector, tool));
      box.append(rows);
    }
    return box;
  };

  const mark = (connector) => {
    const node = make('div', 'cs-mark cs-conn-mark');
    node.append(connectorMark(document, connector, { size: 30 }));
    return node;
  };

  // A connection under Mine: who, the access, the tools.
  const card = (connector) => {
    const connection = connectionOf(connector.id);
    const needsLogin = connection.status === 'needs_login';
    const box = make('article', 'cs-conn');
    box.dataset.connectorId = connector.id;
    const head = make('div', 'cs-conn-head');
    const who = make('div', 'cs-conn-who');
    who.append(make('strong', 'cs-conn-name', connector.name));
    who.append(make('span', `cs-conn-status${needsLogin ? ' is-warning' : ''}`, t(needsLogin ? 'connectorNeedsLogin' : 'connectorConnected')));
    const side = make('div', 'cs-conn-side');
    if (needsLogin) {
      const again = make('button', 'cs-button cs-button-primary', t('connectorReconnect'));
      again.type = 'button';
      again.addEventListener('click', () => openSheet(connector, { mode: connection.mode }));
      side.append(again);
    }
    if (state.confirming === connector.id) {
      const sure = make('button', 'cs-button cs-button-danger', t('connectorDisconnectSure'));
      sure.type = 'button';
      sure.addEventListener('click', async () => {
        sure.disabled = true;
        const result = await disconnectConnector(connector.id);
        state.confirming = null;
        if (result.ok) {
          state.byId.delete(connector.id);
          showNotification(t('connectorDisconnected_notice', { name: connector.name }), 'success');
        } else showNotification(t('connectorSaveFailed'), 'error');
        redraw();
      });
      const no = make('button', 'cs-button', t('connectorCancel'));
      no.type = 'button';
      no.addEventListener('click', () => { state.confirming = null; redraw(); });
      side.append(sure, no);
    } else {
      const off = make('button', 'cs-button', t('connectorDisconnect'));
      off.type = 'button';
      off.addEventListener('click', () => { state.confirming = connector.id; redraw(); });
      side.append(off);
    }
    head.append(mark(connector), who, side);
    box.append(head);

    // The permissions fold and unfold (open at first under Mine).
    const key = `${connector.id}`;
    const open = !state.closedPerms.has(key);
    box.append(foldable({ title: t('connectorPermissions'), open, onToggle: () => { if (state.closedPerms.has(key)) state.closedPerms.delete(key); else state.closedPerms.add(key); redraw(); }, body: () => permissionBody(connector, connection) }));
    return box;
  };

  // What the person sets for one connection: the access, the tools in two groups, the refresh. Used under Mine and in the Permissions tab of the settings.
  const permissionBody = (connector, connection) => {
    const needsLogin = connection.status === 'needs_login';
    const nodes = [];
    // The access: where the service lets the login itself be read-only, the person may choose; changing it is a new login.
    const scope = make('section', 'cs-conn-card');
    scope.append(make('h3', 'cs-group-title', t('connectorScopeTitle')));
    if (hasReadonlyLogin(connector)) {
      scope.append(segmented([['readonly', t('connectorScopeReadonly')], ['readwrite', t('connectorScopeReadwrite')]], connection.mode, (value) => openSheet(connector, { mode: value, switching: true })));
      scope.append(make('p', 'cs-conn-note', t(connection.mode === 'readonly' ? 'connectorScopeNoteReadonly' : 'connectorScopeNoteReadwrite', { name: connector.name })));
    } else scope.append(make('p', 'cs-conn-note', t('connectorScopeFixed')));
    nodes.push(scope);
    if (needsLogin) return nodes;
    const groups = [group(connector, connection, 'read'), group(connector, connection, 'write')].filter(Boolean);
    if (groups.length) nodes.push(...groups);
    else nodes.push(make('p', 'cs-conn-note', t('connectorNoTools')));
    const refresh = make('button', 'cs-link cs-conn-refresh', t('connectorRefresh'));
    refresh.type = 'button';
    refresh.addEventListener('click', async () => {
      refresh.disabled = true;
      const result = await refreshConnector(connector.id);
      if (result.ok && result.connector) {
        state.byId.set(connector.id, result.connector);
        showNotification(t('connectorRefreshed', { name: connector.name }), 'success');
      } else showNotification(t('connectorSaveFailed'), 'error');
      redraw();
    });
    nodes.push(refresh);
    return nodes;
  };

  // A header that folds and unfolds what is under it (the body is made only while it is open).
  const foldable = ({ title, open, onToggle, body, status = '', icon = null }) => {
    const box = make('section', `cs-fold${open ? ' is-open' : ''}`);
    const head = make('button', 'cs-fold-head');
    head.type = 'button';
    head.setAttribute('aria-expanded', String(open));
    head.append(...[].concat(icon || []), make('span', 'cs-fold-title', title));
    if (status) head.append(status);
    const arrow = make('span', 'cs-fold-arrow');
    arrow.innerHTML = CHEVRON;
    head.append(arrow);
    head.addEventListener('click', onToggle);
    box.append(head);
    if (open) box.append(...[].concat(body()));
    return box;
  };

  // A row of the list of all the connectors.
  const row = (connector, { onShowMine }) => {
    const connection = connectionOf(connector.id);
    const connected = connection.status !== 'none';
    const element = make('div', `cs-row cs-connector${connected ? ' is-added' : ''}`);
    element.dataset.connectorId = connector.id;
    const text = make('button', 'cs-text');
    text.type = 'button';
    const name = make('span', 'cs-name');
    name.append(make('span', 'cs-name-text', connector.name));
    text.append(name, make('span', 'cs-desc', connectorDescription(connector, getLanguage())));
    const action = make('div', 'cs-action');
    if (connected) {
      const needs = connection.status === 'needs_login';
      action.append(make('span', `cs-conn-status${needs ? ' is-warning' : ''}`, t(needs ? 'connectorNeedsLogin' : 'connectorConnected')));
    } else {
      const connect = make('span', 'cs-connect', t('connectorConnect'));
      const chevron = make('span', 'cs-connect-arrow');
      chevron.innerHTML = CHEVRON;
      connect.append(chevron);
      action.append(connect);
    }
    const main = make('div', 'cs-row-main');
    main.append(mark(connector), text, action);
    // What it can do: the tools it gave, read only (the settings of each tool are under Mine and in the settings, Permissions).
    const more = make('div', 'cs-more');
    const inner = make('div', 'cs-more-inner');
    more.append(inner);
    const fill = () => {
      const tools = connectionOf(connector.id).tools;
      const nodes = [make('p', 'cs-about', connectorDescription(connector, getLanguage()))];
      if (tools.length) {
        nodes.push(make('h3', 'cs-features-title', `${t('connectorFeatures')} (${tools.length})`));
        const listing = make('ul', 'cs-features');
        for (const tool of tools) {
          const item = make('li', 'cs-feature');
          const head = make('div', 'cs-feature-head');
          head.append(make('code', 'cs-tool-name', tool.name), make('span', 'cs-badge', t(tool.kind === 'read' ? 'connectorKindRead' : 'connectorKindWrite')));
          item.append(head);
          if (tool.description) item.append(make('span', 'cs-tool-desc', tool.description));
          listing.append(item);
        }
        nodes.push(listing);
      } else nodes.push(make('p', 'cs-conn-note', t('connectorNoFeatures')));
      const manage = make('button', 'cs-link cs-feature-manage', t('connectorManage'));
      manage.type = 'button';
      manage.addEventListener('click', onShowMine);
      nodes.push(manage);
      inner.replaceChildren(...nodes);
    };
    const setOpen = (open) => {
      element.classList.toggle('is-open', open);
      text.setAttribute('aria-expanded', String(open));
      more.classList.toggle('is-open', open);
      more.setAttribute('aria-hidden', String(!open));
      more.toggleAttribute('inert', !open);
    };
    if (connected && connection.status === 'connected') {
      if (state.expanded.has(connector.id)) fill();
      setOpen(state.expanded.has(connector.id));
    } else setOpen(false);
    const choose = () => {
      if (connected && connection.status === 'connected') {
        // The details open and close where they are (the page is not drawn again, so they move).
        const open = !state.expanded.has(connector.id);
        if (open) {
          state.expanded.add(connector.id);
          fill();
        } else state.expanded.delete(connector.id);
        setOpen(open);
      } else if (connected) openSheet(connector, { mode: connection.mode });
      else if (!getAccountReady()) showNotification(t('connectorNeedAccount'), 'error');
      else openSheet(connector);
    };
    text.addEventListener('click', choose);
    action.addEventListener('click', choose);
    element.append(main, more);
    return element;
  };

  const matches = (connector, query) => {
    const needle = query.trim().toLowerCase();
    return !needle || `${connector.name} ${connector.id} ${connectorDescription(connector, getLanguage())}`.toLowerCase().includes(needle);
  };

  /** The nodes of the list for the tab and the search of the view: `view` is { tab, query }; `showMine()` turns the page to the tab Mine. */
  const draw = (view, { showMine = () => {} } = {}) => {
    if (state.status === 'idle') void load();
    // Without an account the page's note says so (connectors need one), and there is nothing to list.
    if (!getAccountReady()) return [];
    if (state.status === 'loading' || state.status === 'idle') return [make('div', 'cs-empty', t('connectorLoading'))];
    if (state.status === 'failed') {
      const box = make('div', 'cs-empty');
      box.append(make('p', '', t('connectorLoadFailed')));
      const retry = make('button', 'cs-button', t('connectorRetry'));
      retry.type = 'button';
      retry.addEventListener('click', () => { state.status = 'idle'; redraw(); });
      box.append(retry);
      return [box];
    }
    const found = CONNECTORS.filter((connector) => matches(connector, view.query));
    if (view.tab === 'mine') {
      const mine = found.filter((connector) => connectionOf(connector.id).status !== 'none');
      return mine.length ? mine.map((connector) => card(connector)) : [make('div', 'cs-empty', view.query ? t('connectorNoResults') : t('connectorNoneMine'))];
    }
    const nodes = [];
    for (const category of CONNECTOR_CATEGORIES) {
      const rows = found.filter((connector) => connector.category === category).map((connector) => row(connector, { onShowMine: showMine }));
      if (!rows.length) continue;
      const box = make('section', 'cs-section');
      box.append(make('h2', 'cs-section-title', t(`connectorCategory_${category}`)), ...rows);
      nodes.push(box);
    }
    return nodes.length ? nodes : [make('div', 'cs-empty', t('connectorNoResults'))];
  };

  /**
   * The permissions of every connection, for the Permissions tab of the settings: one folded section for each connection (its tools in two groups, the access).
   * The connections are read when they are first needed and the tab is drawn again by `redraw` when they have come.
   */
  const permissionNodes = () => {
    if (!getAccountReady()) return [make('p', 'pm-empty', t('connectorNeedAccount'))];
    if (state.status === 'idle') void load();
    if (state.status === 'loading' || state.status === 'idle') return [make('p', 'pm-empty', t('connectorLoading'))];
    if (state.status === 'failed') {
      const box = make('div', 'pm-empty');
      box.append(make('p', '', t('connectorLoadFailed')));
      const retry = make('button', 'cs-button', t('connectorRetry'));
      retry.type = 'button';
      retry.addEventListener('click', () => { state.status = 'idle'; redraw(); });
      box.append(retry);
      return [box];
    }
    const mine = CONNECTORS.filter((connector) => connectionOf(connector.id).status !== 'none');
    if (!mine.length) return [make('p', 'pm-empty', t('connectorNoneMine'))];
    return mine.map((connector) => {
      const connection = connectionOf(connector.id);
      const needs = connection.status === 'needs_login';
      const open = state.openPerms.has(connector.id);
      const status = make('span', `cs-conn-status${needs ? ' is-warning' : ''}`, t(needs ? 'connectorNeedsLogin' : 'connectorConnected'));
      const box = foldable({ title: connector.name, open, status, icon: connectorMark(document, connector, { size: 22, className: 'cs-fold-mark' }), onToggle: () => { if (state.openPerms.has(connector.id)) state.openPerms.delete(connector.id); else state.openPerms.add(connector.id); redraw(); }, body: () => permissionBody(connector, connection) });
      box.classList.add('cs-conn-card', 'cs-perm');
      box.dataset.connectorId = connector.id;
      return box;
    });
  };

  return { draw, permissionNodes, load, handleReturn, closeSheet, state };
}
