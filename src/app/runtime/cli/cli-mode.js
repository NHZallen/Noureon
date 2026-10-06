// The CLI tools (命令工具) as the composer sees them (docs/superpowers/specs/2026-10-04-cli-store-design.md): "@" in the message box opens a
// list of the tools the person added, choosing one puts a chip in the box (the next message uses that tool), and the left menu has the
// entry that opens the store page. The store page itself (ui/cli/) is loaded when it is opened.

import { getCliTool } from '../../../data/cli-catalog.js';
import { terminalIcon, toolIconMarkup, watchToolIcons } from '../../ui/cli/cli-icons.js';
import { registerCliMode } from './cli-bridge.js';
import { cliIndicatorId, enabledCliTools } from './cli-state.js';
import { cliText } from './cli-texts.js';
import { rememberNetAnswer } from './net-state.js';

const escapeHTML = (value = '') => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
// "@" and what is typed after it, at the end of the text before the caret, at the start or after a space.
const MENTION = /(^|\s)@([^\s@]{0,40})$/u;
const ENTRY_ID = 'open-cli-store-btn';

// `isLocked` is true in a temporary chat, which has no CLI tools: no "@" list, no chips, and a tool chosen before is let go.
export function createCliMode({ document, messageInput, isLocked = () => false, getConfig, saveConfig = async () => {}, getUiLanguage, refresh, showNotification = () => {}, getAccountReady = () => true, logger = console }) {
  const win = document.defaultView;
  const language = () => getUiLanguage();
  const t = (key, values) => cliText(language(), key, values);
  let selected = [];
  let menu = null;
  let menuState = null;
  let storeApi = null;

  // ----- the store page (loaded when it is first opened)
  const openStore = async () => {
    try {
      // The styles are a separate file: if they fail to load the page still opens (plain), and the reason is logged.
      const [{ openCliStore }] = await Promise.all([import('../../ui/cli/cli-store.js'), import('../../ui/cli/cli-store.css').catch((error) => { logger?.warn?.('Loading the CLI store styles failed.', error); })]);
      storeApi = openCliStore({ document, getConfig, saveConfig, getLanguage: language, showNotification, getAccountReady, onChange: () => { refresh(); } });
    } catch (error) {
      logger?.warn?.('Opening the CLI store failed.', error);
    }
    return storeApi;
  };

  // ----- the entry of the left menu
  const ensureEntry = () => {
    const list = document.querySelector('#sidebar .overflow-y-auto');
    if (!list) return null;
    let entry = document.getElementById(ENTRY_ID);
    if (!entry) {
      entry = document.createElement('button');
      entry.id = ENTRY_ID;
      entry.type = 'button';
      entry.className = 'sidebar-item cli-sidebar-entry w-full text-left rounded-lg flex items-center';
      entry.innerHTML = `${terminalIcon(18, 'cli-sidebar-icon')}<span class="cli-sidebar-label"></span>`;
      entry.addEventListener('click', () => {
        // On a phone the menu is a drawer over the chat: it goes away as the page comes.
        const overlay = document.getElementById('sidebar-overlay');
        if (overlay?.classList.contains('visible')) overlay.click();
        void openStore();
      });
      list.insertBefore(entry, list.firstChild);
    }
    const label = t('entry');
    const text = entry.querySelector('.cli-sidebar-label');
    if (text && text.textContent !== label) text.textContent = label;
    entry.title = label;
    return entry;
  };

  // ----- the chips of the chosen tools
  const selection = () => (isLocked() ? [] : selected).map((id) => getCliTool(id)).filter(Boolean).map((tool) => ({ id: tool.id, indicatorId: cliIndicatorId(tool.id), label: tool.name }));
  const remove = (id) => {
    selected = selected.filter((entry) => entry !== id);
    refresh();
  };
  const indicators = (map, closeButton) => {
    if (isLocked()) return;
    for (const { id, indicatorId, label } of selection()) {
      map.set(indicatorId, {
        id: indicatorId,
        html: `<span class="input-indicator-content flex items-center gap-2"><span class="input-indicator-leading">${toolIconMarkup(getCliTool(id), 18, 'input-indicator-mode-icon')}</span><span>${escapeHTML(label)}</span></span>${closeButton(`close-cli-btn-input-${id}`, escapeHTML(t('chipClose', { name: label })))}`,
        eventListener: (element) => element.querySelector(`#close-cli-btn-input-${id}`)?.addEventListener('click', () => remove(id))
      });
    }
  };
  const clear = () => {
    if (!selected.length) return;
    selected = [];
    refresh();
  };

  // ----- the "@" list
  const closeMenu = () => {
    if (menu) menu.hidden = true;
    menuState = null;
  };

  /** Where in the box the "@" is: { node, start, end, query }, or null. */
  const mentionAtCaret = () => {
    const selection = document.getSelection?.();
    if (!selection?.rangeCount || !selection.isCollapsed) return null;
    const { startContainer: node, startOffset: offset } = selection.getRangeAt(0);
    if (node?.nodeType !== 3 || !messageInput.contains(node)) return null;
    const found = MENTION.exec(node.data.slice(0, offset));
    if (!found) return null;
    return { node, start: offset - found[2].length - 1, end: offset, query: found[2] };
  };

  const matching = (query) => {
    const needle = query.trim().toLowerCase();
    // The name is what is typed here (the store's search looks in the words too).
    return enabledCliTools(getConfig()).filter((tool) => !needle || `${tool.name} ${tool.id}`.toLowerCase().includes(needle));
  };

  const ensureMenu = () => {
    if (menu) return menu;
    const host = messageInput.closest('.input-wrapper')?.parentElement;
    if (!host) return null;
    host.classList.add('cli-menu-host');
    menu = document.createElement('div');
    menu.className = 'cli-menu';
    menu.id = 'cli-mention-menu';
    menu.setAttribute('role', 'listbox');
    menu.hidden = true;
    watchToolIcons(menu, 18);
    // The box keeps its caret while the list is clicked.
    menu.addEventListener('mousedown', (event) => event.preventDefault());
    menu.addEventListener('click', (event) => {
      const item = event.target.closest('[data-cli-id]');
      if (item) choose(item.dataset.cliId);
      else if (event.target.closest('[data-cli-store]')) {
        closeMenu();
        void openStore();
      }
    });
    menu.addEventListener('mousemove', (event) => {
      const item = event.target.closest('[data-cli-id]');
      if (!item || !menuState) return;
      const index = menuState.tools.findIndex((tool) => tool.id === item.dataset.cliId);
      if (index >= 0 && index !== menuState.active) {
        menuState.active = index;
        markActive();
      }
    });
    host.append(menu);
    return menu;
  };

  const markActive = () => {
    menu?.querySelectorAll('[data-cli-id]').forEach((item, index) => {
      const active = index === menuState?.active;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-selected', String(active));
      if (active) item.scrollIntoView?.({ block: 'nearest' });
    });
  };

  const showMenu = (mention) => {
    const element = ensureMenu();
    if (!element) return;
    const tools = matching(mention.query);
    const none = enabledCliTools(getConfig()).length === 0;
    menuState = { mention, tools, active: 0 };
    const rows = tools.map((tool) => `<button type="button" class="cli-menu-item" role="option" data-cli-id="${escapeHTML(tool.id)}"><span class="cli-menu-icon">${toolIconMarkup(tool, tool.icon ? 22 : 18)}</span><span class="cli-menu-name">${escapeHTML(tool.name)}</span><span class="cli-menu-kind">${escapeHTML(t('menuLabel'))}</span></button>`).join('');
    const empty = tools.length ? '' : `<div class="cli-menu-empty">${escapeHTML(t(none ? 'menuEmpty' : 'menuNoMatch'))}</div>${none ? `<button type="button" class="cli-menu-store" data-cli-store>${terminalIcon(16)}<span>${escapeHTML(t('menuOpenStore'))}</span></button>` : ''}`;
    element.innerHTML = `${mention.query ? '' : `<div class="cli-menu-header">${escapeHTML(t('menuHeader'))}</div>`}<div class="cli-menu-list">${rows}${empty}</div>`;
    element.hidden = false;
    // Above the box (and above what is attached to it), as wide as it.
    const wrapper = messageInput.closest('.input-wrapper');
    const host = element.parentElement;
    if (wrapper && host) element.style.bottom = `${Math.max(0, host.clientHeight - wrapper.offsetTop) + 8}px`;
    markActive();
  };

  /** Chooses a tool: the "@" and what followed it go, the chip comes. */
  const choose = (id) => {
    const tool = getCliTool(id);
    const mention = menuState?.mention;
    closeMenu();
    if (!tool || !mention) return;
    try {
      const range = document.createRange();
      range.setStart(mention.node, mention.start);
      range.setEnd(mention.node, mention.end);
      range.deleteContents();
      const selection = document.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    } catch {
      // The text was changed under the list: the chip is still added.
    }
    if (!selected.includes(id)) selected = [...selected, id];
    refresh();
    messageInput.dispatchEvent(new win.Event('input', { bubbles: true }));
    messageInput.focus?.();
  };

  const evaluate = () => {
    if (isLocked()) {
      if (menuState) closeMenu();
      return;
    }
    const mention = mentionAtCaret();
    if (!mention) {
      if (menuState) closeMenu();
      return;
    }
    showMenu(mention);
  };

  // The keys of the list come before the box's own (Enter would send the message).
  const onKeyDown = (event) => {
    if (!menuState || !menu || menu.hidden || !messageInput.contains(event.target)) return;
    const { tools } = menuState;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeMenu();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!tools.length) return;
      event.preventDefault();
      event.stopPropagation();
      menuState.active = (menuState.active + (event.key === 'ArrowDown' ? 1 : tools.length - 1)) % tools.length;
      markActive();
    } else if ((event.key === 'Enter' || event.key === 'Tab') && !event.isComposing && tools.length) {
      event.preventDefault();
      event.stopPropagation();
      choose(tools[menuState.active].id);
    }
  };
  // The logos in the chips and in the sent messages: the glyph takes the place of one that fails to load.
  watchToolIcons(document, 18);
  document.addEventListener('keydown', onKeyDown, true);
  messageInput.addEventListener('input', evaluate);
  messageInput.addEventListener('keyup', (event) => {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) evaluate();
  });
  messageInput.addEventListener('click', evaluate);
  messageInput.addEventListener('blur', () => { win.setTimeout(closeMenu, 120); });

  const sync = () => {
    ensureEntry();
    // A tool that was removed (on another device, or in the store) is not kept chosen.
    const known = new Set(enabledCliTools(getConfig()).map((tool) => tool.id));
    const next = isLocked() ? [] : selected.filter((id) => known.has(id));
    if (next.length !== selected.length) {
      selected = next;
      refresh();
    }
  };

  // The address noureon.com/cli opens the page (a refresh, a bookmark, a shared link).
  if (win.location?.pathname === '/cli') void openStore();

  // What a person's answer to a question about a site leaves in the settings (a rule for "always" and for a refusal, the site in the list for "once").
  const rememberNet = async (host, decision) => {
    if (!rememberNetAnswer(getConfig(), host, decision)) return;
    try {
      await saveConfig();
    } catch (error) {
      logger?.warn?.('Saving the rule for a site failed.', error);
    }
  };

  const mode = { sync, indicators, selection, clear, openStore, closeMenu, ensureEntry, rememberNet };
  registerCliMode(mode);
  sync();
  return mode;
}
