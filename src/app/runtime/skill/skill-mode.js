// The skills as the composer sees them (docs/superpowers/specs/2026-10-09-skills-design.md, §5): "/" in the message box opens a list of the skills the person
// has, choosing one puts a chip in the box (the next message asks for that skill: its text goes to the model with that message), the way "@" does
// for the CLI tools (runtime/cli/cli-mode.js). The two lists look alike on purpose. The words are the CLI part's table (cli-texts.js, the `slash*`
// keys): the skills' own table is loaded only with the page.

import { MAX_INVOKED_SKILLS, skillIndicatorId } from '../../../data/skill-prompt.js';
import { skillDescription, skillTitle } from '../../../data/skill-catalog.js';
import { skillIcon } from '../../ui/cli/cli-icons.js';
import { cliText } from '../cli/cli-texts.js';
import { registerSkillMode } from './skill-bridge.js';
import { activeSkills, canModelUseSkill, resolveSkillBodies } from './skill-state.js';

const escapeHTML = (value = '') => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
// "/" and what is typed after it, at the end of the text before the caret, at the start or after a space.
const SLASH = /(^|\s)\/([^\s/]{0,40})$/u;

/**
 * `skillStore` (skill-store.js) holds the skills the person pasted; `openStore(kind)` opens the Extensions page; `getConfig` the settings;
 * `refresh()` redraws the chips of the box.
 */
export function createSkillMode({ document, messageInput, getConfig, getUiLanguage, refresh, skillStore = null, openStore = () => {}, logger = console }) {
  const win = document.defaultView;
  const language = () => getUiLanguage();
  const t = (key, values) => cliText(language(), key, values);
  let selected = [];
  let menu = null;
  let menuState = null;

  const own = () => (skillStore ? skillStore.cached() : []);
  const skills = () => activeSkills(getConfig(), own());
  const byName = (name) => skills().find((skill) => skill.name === name) || null;
  const titleOf = (skill) => skillTitle(skill, language());

  // ----- the chips of the chosen skills
  const selection = () => selected.map((name) => byName(name)).filter(Boolean).map((skill) => ({ name: skill.name, indicatorId: skillIndicatorId(skill.name), label: titleOf(skill) }));
  const remove = (name) => {
    selected = selected.filter((entry) => entry !== name);
    refresh();
  };
  const indicators = (map, closeButton) => {
    for (const { name, indicatorId, label } of selection()) {
      map.set(indicatorId, {
        id: indicatorId,
        html: `<span class="input-indicator-content flex items-center gap-2"><span class="input-indicator-leading">${skillIcon(18, 'input-indicator-mode-icon')}</span><span>${escapeHTML(label)}</span></span>${closeButton(`close-skill-btn-input-${name}`, escapeHTML(t('chipClose', { name: label })))}`,
        eventListener: (element) => element.querySelector(`#close-skill-btn-input-${name}`)?.addEventListener('click', () => remove(name))
      });
    }
  };
  const clear = () => {
    if (!selected.length) return;
    selected = [];
    refresh();
  };

  // ----- the "/" list
  const closeMenu = () => {
    if (menu) menu.hidden = true;
    menuState = null;
  };

  /** Where in the box the "/" is: { node, start, end, query }, or null. */
  const slashAtCaret = () => {
    const selection = document.getSelection?.();
    if (!selection?.rangeCount || !selection.isCollapsed) return null;
    const { startContainer: node, startOffset: offset } = selection.getRangeAt(0);
    if (node?.nodeType !== 3 || !messageInput.contains(node)) return null;
    const found = SLASH.exec(node.data.slice(0, offset));
    if (!found) return null;
    return { node, start: offset - found[2].length - 1, end: offset, query: found[2] };
  };

  const matching = (query) => {
    const needle = query.trim().toLowerCase();
    return skills().filter((skill) => !needle || `${skill.name} ${titleOf(skill)}`.toLowerCase().includes(needle));
  };

  const ensureMenu = () => {
    if (menu) return menu;
    const host = messageInput.closest('.input-wrapper')?.parentElement;
    if (!host) return null;
    host.classList.add('cli-menu-host');
    menu = document.createElement('div');
    menu.className = 'cli-menu';
    menu.id = 'skill-slash-menu';
    menu.setAttribute('role', 'listbox');
    menu.hidden = true;
    // The box keeps its caret while the list is clicked.
    menu.addEventListener('mousedown', (event) => event.preventDefault());
    menu.addEventListener('click', (event) => {
      const item = event.target.closest('[data-skill-name]');
      if (item) choose(item.dataset.skillName);
      else if (event.target.closest('[data-skill-store]')) {
        closeMenu();
        void openStore('skills');
      }
    });
    menu.addEventListener('mousemove', (event) => {
      const item = event.target.closest('[data-skill-name]');
      if (!item || !menuState) return;
      const index = menuState.skills.findIndex((skill) => skill.name === item.dataset.skillName);
      if (index >= 0 && index !== menuState.active) {
        menuState.active = index;
        markActive();
      }
    });
    host.append(menu);
    return menu;
  };

  const markActive = () => {
    menu?.querySelectorAll('[data-skill-name]').forEach((item, index) => {
      const active = index === menuState?.active;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-selected', String(active));
      // Only the list is scrolled to the row, never the page (see cli-mode.js).
      const list = item.parentElement;
      if (active && list) {
        if (item.offsetTop < list.scrollTop) list.scrollTop = item.offsetTop;
        else if (item.offsetTop + item.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = item.offsetTop + item.offsetHeight - list.clientHeight;
      }
    });
  };

  // The list is no taller than the room seen above the box (the same rule as the "@" list).
  const fitMenu = () => {
    const wrapper = messageInput.closest('.input-wrapper');
    if (!menu || menu.hidden || !wrapper?.getBoundingClientRect) return;
    const seenTop = (Number(win.visualViewport?.offsetTop) || 0) - (Number(win.scrollY) || 0);
    const room = wrapper.getBoundingClientRect().top - seenTop - 16;
    menu.style.maxHeight = room > 0 ? `${Math.max(96, Math.min(room, 352))}px` : '';
  };
  win.visualViewport?.addEventListener?.('resize', fitMenu);
  win.visualViewport?.addEventListener?.('scroll', fitMenu);

  const render = () => {
    if (!menu || !menuState) return;
    const list = menuState.skills;
    const none = skills().length === 0;
    const rows = list.map((skill) => `<button type="button" class="cli-menu-item" role="option" data-skill-name="${escapeHTML(skill.name)}"><span class="cli-menu-icon">${skillIcon(18)}</span><span class="cli-menu-name">${escapeHTML(titleOf(skill))}</span><span class="cli-menu-kind">${escapeHTML(t('slashLabel'))}</span></button>`).join('');
    const empty = list.length ? '' : `<div class="cli-menu-empty">${escapeHTML(t(none ? 'slashEmpty' : 'slashNoMatch'))}</div>${none ? `<button type="button" class="cli-menu-store" data-skill-store>${skillIcon(16)}<span>${escapeHTML(t('slashOpenStore'))}</span></button>` : ''}`;
    menu.innerHTML = `<div class="cli-menu-header">${escapeHTML(t('slashHeader'))}</div><div class="cli-menu-list">${rows}${empty}</div>`;
    markActive();
  };

  const showMenu = (mention) => {
    const element = ensureMenu();
    if (!element) return;
    const found = matching(mention.query);
    const keep = menuState?.skills.length && menuState.mention?.query === mention.query ? menuState.active : 0;
    menuState = { mention, skills: found, active: Math.min(keep, Math.max(0, found.length - 1)) };
    render();
    element.hidden = false;
    const wrapper = messageInput.closest('.input-wrapper');
    const host = element.parentElement;
    if (wrapper && host) element.style.bottom = `${Math.max(0, host.clientHeight - wrapper.offsetTop) + 8}px`;
    fitMenu();
    markActive();
    // The skills the person pasted come from the cloud: asked for once, and the list is drawn again when they are here.
    if (skillStore && !skillStore.loaded) {
      void skillStore.list().then(() => {
        const again = slashAtCaret();
        if (menuState && again) showMenu(again);
      }).catch(() => {});
    }
  };

  /** Chooses a skill: the "/" and what followed it go, the chip comes (at most MAX_INVOKED_SKILLS). */
  const choose = (name) => {
    const skill = byName(name);
    const mention = menuState?.mention;
    closeMenu();
    if (!skill || !mention) return;
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
    if (!selected.includes(name) && selected.length < MAX_INVOKED_SKILLS) selected = [...selected, name];
    refresh();
    messageInput.dispatchEvent(new win.Event('input', { bubbles: true }));
    messageInput.focus?.();
  };

  const evaluate = () => {
    const mention = slashAtCaret();
    if (!mention) {
      if (menuState) closeMenu();
      return;
    }
    showMenu(mention);
  };

  // The keys of the list come before the box's own (Enter would send the message).
  const onKeyDown = (event) => {
    if (!menuState || !menu || menu.hidden || !messageInput.contains(event.target)) return;
    const list = menuState.skills;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeMenu();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!list.length) return;
      event.preventDefault();
      event.stopPropagation();
      menuState.active = (menuState.active + (event.key === 'ArrowDown' ? 1 : list.length - 1)) % list.length;
      markActive();
    } else if ((event.key === 'Enter' || event.key === 'Tab') && !event.isComposing && list.length) {
      event.preventDefault();
      event.stopPropagation();
      choose(list[menuState.active].name);
    }
  };
  document.addEventListener('keydown', onKeyDown, true);
  messageInput.addEventListener('input', evaluate);
  messageInput.addEventListener('keyup', (event) => {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) evaluate();
  });
  messageInput.addEventListener('click', evaluate);
  messageInput.addEventListener('blur', () => { win.setTimeout(closeMenu, 120); });

  /** A skill chosen and then removed (on another device, in the page) is not kept chosen. */
  const sync = () => {
    const known = new Set(skills().map((skill) => skill.name));
    const next = selected.filter((name) => known.has(name));
    if (next.length !== selected.length) {
      selected = next;
      refresh();
    }
  };

  /**
   * The text of the named skills the person has now: [{ name, body }]. The pasted ones are looked up in the cloud first (the account may have changed, or
   * the page just started); a failure leaves what is held.
   */
  const readOwn = async () => {
    if (!skillStore) return;
    try {
      await skillStore.ensure();
      if (!skillStore.loaded) await skillStore.list();
    } catch (error) {
      logger?.warn?.('Reading the skills failed.', error);
    }
  };
  const resolve = async (names) => {
    await readOwn();
    return resolveSkillBodies(getConfig(), own(), names);
  };
  /**
   * The skills the model may load by itself in this reply: [{ name, description, files?, given? }], without the ones asked for with "/" (they are given
   * whole already), except those with files: the model may read those files, so they stay in the list marked `given` (loaded from the start), whether or
   * not the person lets the model use that skill by itself (they asked for it).
   */
  const available = async (exclude = []) => {
    await readOwn();
    const skip = new Set(exclude);
    return skills()
      .filter((skill) => (canModelUseSkill(getConfig(), skill.name) && !skip.has(skill.name)) || (skip.has(skill.name) && skill.files?.length))
      .map((skill) => ({ name: skill.name, description: skill.description, ...(skill.files?.length ? { files: true } : {}), ...(skip.has(skill.name) ? { given: true } : {}) }));
  };
  /** The text of one skill the person has: { name, body, files? } or null. */
  const lookup = async (name) => (await resolve([name]))[0] || null;
  /** The text of one text file of a skill that came as a zip: { ok: true, text, cut } or { ok: false, reason } ('not_found', 'binary', 'failed'). Never rejects. */
  const readFile = async (name, path) => {
    try {
      await readOwn();
      const skill = byName(name);
      if (!skill?.files?.some((file) => file.path === path)) return { ok: false, reason: 'not_found' };
      const opened = skillStore ? await skillStore.openBundle(name) : { ok: false };
      if (!opened.ok) return { ok: false, reason: 'failed' };
      const { bundleFileText, SKILL_BUNDLE_LIMITS } = await import('../../../data/skill-bundle.js');
      const text = bundleFileText(opened.files, path, SKILL_BUNDLE_LIMITS.readChars);
      return text ? { ok: true, text: text.text, cut: text.cut } : { ok: false, reason: 'binary' };
    } catch (error) {
      logger?.warn?.('Reading a file of a skill failed.', error);
      return { ok: false, reason: 'failed' };
    }
  };

  const mode = { sync, indicators, selection, clear, closeMenu, resolve, available, lookup, readFile };
  registerSkillMode(mode);
  return mode;
}
