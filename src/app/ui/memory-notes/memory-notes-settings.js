// Settings → Memory for the memory of notes (docs/superpowers/specs/2026-10-30-memory-redesign-design.md, §8 P3; the layout the owner chose on 2026-10-30: a summary card with a
// separate page that manages the notes). The top card holds the switch to the new memory; with it on, the old summary is hidden and the page shows the two switches (use, learn), the
// summary with the recent changes (each can be undone), and, one step further, the list of notes with search, kinds, and what the person can do with each note.
// Everything is drawn with textContent (a note is the person's text), and colours come from the tokens in memory-notes.css.

import { renderVectorCard } from './memory-vector-card.js';
import { memoryIcon } from '../icons/memory-icons.js';
import { addByUser, countByCategory, deleteByUser, describeEvent, describeTidy, editByUser, filterNotes, joinTidyEvents, setKindByUser, setNeverByUser, setStandingByUser, summarize, undoEvent } from '../../runtime/memory-notes/manage.js';
import { UNCATEGORIZED, isActive } from '../../runtime/memory-notes/notes.js';
import { addCategory, categoriesOf, categoryName, kindFor, removeCategory, renameCategory } from '../../runtime/memory-notes/categories.js';

const PAGE = 50;
const RECENT = 3;
const KIND_KEY = Object.freeze({ preference: 'mnKindPreference', fact: 'mnKindFact', project: 'mnKindProject', relationship: 'mnKindRelationship', routine: 'mnKindRoutine' });
const ERROR_KEY = Object.freeze({ full: 'mnErrFull', duplicate: 'mnErrDuplicate', empty: 'mnErrEmpty', cannot: 'mnErrCannotPin', missing: 'mnErrMissing' });
const CATEGORY_ERROR_KEY = Object.freeze({ empty: 'mnCatErrEmpty', duplicate: 'mnCatErrDuplicate', full: 'mnCatErrFull', missing: 'mnErrMissing' });

export function createMemoryNotesSettings({
  document,
  getConfig,
  saveConfig,
  getMemory,
  getUser = () => null,
  // The models the person may choose to curate with (text models with a key), as [{ id, name }]; none given: no choice is offered.
  getModels = () => [],
  // Building the memory from the old conversations (memory-store/page-rebuild.js): the controller, or null when this page cannot.
  getRebuild = () => null,
  // The search by meaning (memory-store/page-vectors.js), or null.
  getVectors = () => null,
  // The name of a project that keeps its notes for itself (its notes are shown with it); '' for one that is gone (its notes are then not shown).
  getProjectName = () => '',
  getText,
  showNotification = () => {},
  showCustomDialog,
  createId = () => globalThis.crypto.randomUUID(),
  now = () => new Date().toISOString()
}) {
  const state = { view: 'summary', query: '', kind: '', filter: 'active', shown: PAGE, menu: '', menuView: '', catMenu: false };
  let container = null;
  // The notes the person manages: those of the account and those of the projects that still keep their own.
  const shownNotes = (live) => live.getNotes().filter((note) => !note.projectId || getProjectName(note.projectId));
  let stopListening = null;
  let stopRebuild = null;
  let stopVectors = null;

  const text = (key, values = {}) => Object.entries(values).reduce((out, [name, value]) => out.replaceAll(`{${name}}`, String(value)), getText(key) || key);
  const store = () => getMemory()?.getStore?.() || null;
  // The categories of the person (the five a memory starts with until they change them), and the name each is shown with.
  const categories = () => categoriesOf(store()?.getSettings?.());
  const builtinName = (id) => (KIND_KEY[id] ? text(KIND_KEY[id]) : '');
  const nameOfCategory = (category) => categoryName(category, builtinName);
  const nameOfKind = (kind) => {
    const found = categories().find((category) => category.id === kind);
    return found ? nameOfCategory(found) : text('mnKindNone');
  };

  const el = (tag, className = '', content = '') => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content) node.textContent = content;
    return node;
  };
  const button = (label, className, onClick, { ariaLabel = '' } = {}) => {
    const node = el('button', className, label);
    node.type = 'button';
    if (ariaLabel) node.setAttribute('aria-label', ariaLabel);
    node.addEventListener('click', onClick);
    return node;
  };

  const relative = (iso) => {
    const time = Date.parse(iso || '');
    if (!Number.isFinite(time)) return '';
    const seconds = Math.round((time - Date.now()) / 1000);
    const [unit, value] = Math.abs(seconds) < 60 ? ['second', 0] : Math.abs(seconds) < 3600 ? ['minute', Math.round(seconds / 60)] : Math.abs(seconds) < 86400 ? ['hour', Math.round(seconds / 3600)] : ['day', Math.round(seconds / 86400)];
    return new Intl.RelativeTimeFormat(getConfig().uiLanguage === 'zh-TW' ? 'zh-TW' : getConfig().uiLanguage, { numeric: 'auto' }).format(value, unit);
  };

  const switchRow = (title, description, checked, onChange) => {
    const row = el('div', 'pz-row');
    const copy = el('div', 'pz-text');
    copy.append(el('span', 'pz-label', title), el('p', 'pz-sub text-[var(--text-secondary)]', description));
    const toggle = el('div', 'relative inline-block w-12 h-6 select-none transition duration-200 ease-in pz-toggle');
    const input = el('input', 'toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer');
    input.type = 'checkbox';
    input.checked = checked;
    input.setAttribute('aria-label', title);
    input.addEventListener('change', () => onChange(input.checked));
    toggle.append(input, el('label', 'toggle-label block overflow-hidden h-6 rounded-full bg-gray-300 cursor-pointer'));
    row.append(copy, toggle);
    return row;
  };

  const say = (code, fallback) => showNotification(text(ERROR_KEY[code] || fallback), 'error');

  const ask = ({ title, message, value = null, confirmLabel }) => showCustomDialog({
    title,
    message,
    ...(value === null ? {} : { input: { type: 'text', value, placeholder: '' } }),
    buttons: [
      { text: text('mnCancel'), class: 'bg-[var(--hover-bg)] px-4 py-2 rounded-md hover:bg-[var(--active-bg)]', value: () => null },
      { text: confirmLabel || text('mnConfirm'), class: 'px-4 py-2 rounded-md btn-primary', value: (input) => (value === null ? true : input) }
    ]
  });

  const commit = async (result, successKey) => {
    if (!result.ok) return say(result.code, 'mnErrMissing');
    await store()?.commitNotes(result.notes);
    if (successKey) showNotification(text(successKey), 'success');
    return true;
  };

  const actions = {
    async add() {
      const answer = await ask({ title: text('mnAddTitle'), message: text('mnAddPrompt'), value: '' });
      if (typeof answer !== 'string') return;
      await commit(addByUser(store().getNotes(), { text: answer, createId, now }), 'mnSaved');
    },
    async edit(note) {
      const answer = await ask({ title: text('mnEditTitle'), message: text('mnEditPrompt'), value: note.text });
      if (typeof answer !== 'string') return;
      await commit(editByUser(store().getNotes(), note.id, { text: answer, now }), 'mnSaved');
    },
    async remove(note) {
      if (!await ask({ title: text('mnDeleteTitle'), message: `${note.text}\n\n${text('mnDeleteConfirm')}`, confirmLabel: text('mnDelete') })) return;
      await commit(deleteByUser(store().getNotes(), note.id, { now }), 'mnDeleted');
    },
    async standing(note) {
      const result = setStandingByUser(store().getNotes(), note.id, !note.standing, { now });
      if (!result.ok) return showNotification(text(result.code === 'full' ? 'mnErrPinFull' : ERROR_KEY[result.code]), 'error');
      await commit(result);
    },
    async never(note) {
      await commit(setNeverByUser(store().getNotes(), note.id, note.surface !== 'never', { now }));
    },
    async move(note, kind) {
      const result = setKindByUser(store().getNotes(), note.id, kind, { categories: categories(), now });
      go({ menu: '', menuView: '' });
      if (!result.ok) return say(result.code, 'mnErrMissing');
      await store().commitNotes(result.notes);
      showNotification(text('mnCatMoved', { name: nameOfKind(kind) }), 'success');
    },
    async addCategory() {
      go({ catMenu: false });
      const answer = await ask({ title: text('mnCatAddTitle'), message: text('mnCatNamePrompt'), value: '' });
      if (typeof answer !== 'string') return;
      const result = addCategory(categories(), answer, { nameOf: nameOfCategory });
      if (!result.ok) return showNotification(text(CATEGORY_ERROR_KEY[result.code]), 'error');
      await store().setSettings({ categories: result.categories });
      go({ filter: 'active', kind: result.category.id, shown: PAGE });
    },
    async renameCategory(id) {
      go({ catMenu: false });
      const current = categories().find((category) => category.id === id);
      if (!current) return;
      const answer = await ask({ title: text('mnCatRenameTitle'), message: text('mnCatNamePrompt'), value: nameOfCategory(current) });
      if (typeof answer !== 'string') return;
      const result = renameCategory(categories(), id, answer, { nameOf: nameOfCategory });
      if (!result.ok) return showNotification(text(CATEGORY_ERROR_KEY[result.code]), 'error');
      await store().setSettings({ categories: result.categories });
    },
    async removeCategory(id) {
      go({ catMenu: false });
      const current = categories().find((category) => category.id === id);
      if (!current) return;
      const held = shownNotes(store()).filter((note) => isActive(note) && note.kind === id).length;
      const message = `${text('mnCatDeleteAsk', { name: nameOfCategory(current) })}${held ? `\n\n${text('mnCatDeleteNotes', { n: held })}` : ''}`;
      if (!await ask({ title: text('mnCatDelete'), message, confirmLabel: text('mnDelete') })) return;
      const result = removeCategory(categories(), id, store().getNotes(), { now });
      if (!result.ok) return;
      // The notes first (they say `none`), then the list: a device that reads one before the other still shows every note somewhere.
      if (held) await store().commitNotes(result.notes);
      await store().setSettings({ categories: result.categories });
      go({ kind: '', filter: 'active' });
    },
    async undo(event) {
      const result = undoEvent(store().getNotes(), event, { now });
      if (result.ok) await store().commitNotes(result.notes);
      for (const id of event.ids || [event.id]) await store().removeEvent(id);
      if (result.ok) showNotification(text('mnUndone'), 'success');
    },
    async clear() {
      if (!await ask({ title: text('mnClearTitle'), message: text('mnClearConfirm'), confirmLabel: text('mnClear') })) return;
      await store().clearAll({ keepTombstones: true });
      showNotification(text('mnCleared'), 'success');
    }
  };

  const go = (patch) => { Object.assign(state, patch); watchOutside(); render(); };

  const tidyLine = (event) => {
    const info = describeTidy(event);
    const parts = ['merge', 'supersede', 'expire', 'fade', 'standing'].filter((kind) => info.summary[kind]).map((kind) => text(`mnTidyPart${kind[0].toUpperCase()}${kind.slice(1)}`, { n: info.summary[kind] }));
    return text('mnEvTidy', { count: info.count, detail: parts.join(', ') || '…' });
  };

  const eventLine = (event) => {
    if (describeTidy(event)) return tidyLine(event);
    const info = describeEvent(event);
    if (!info) return '';
    const key = { add: 'mnEvAdd', update: 'mnEvUpdate', forget: 'mnEvForget', archive: 'mnEvArchive' }[info.action];
    return text(key, { text: info.text, before: info.beforeText });
  };

  const renderMasterCard = () => {
    const card = el('section', 'pz-card');
    const head = el('div', 'pz-head mn-head');
    head.append(el('h3', '', text('mnTitle')));
    card.append(head, el('p', 'pz-sub mn-intro text-[var(--text-secondary)]', text('mnIntro')));
    return card;
  };

  const curatorRow = (live, settings) => {
    const models = getModels();
    if (!models.length) return null;
    const row = el('div', 'pz-row');
    const copy = el('div', 'pz-text');
    copy.append(el('span', 'pz-label', text('mnCuratorTitle')), el('p', 'pz-sub text-[var(--text-secondary)]', text('mnCuratorDesc')));
    const select = el('select', 'pz-select');
    select.setAttribute('aria-label', text('mnCuratorTitle'));
    const auto = el('option', '', text('mnCuratorAuto'));
    auto.value = '';
    select.append(auto);
    for (const model of models) {
      const option = el('option', '', model.name);
      option.value = model.id;
      select.append(option);
    }
    select.value = models.some((model) => model.id === settings.curatorModelId) ? settings.curatorModelId : '';
    select.addEventListener('change', () => live.setSettings({ curatorModelId: select.value }));
    row.append(copy, select);
    return row;
  };

  const renderSwitches = (live) => {
    const settings = live.getSettings();
    const card = el('section', 'pz-card');
    card.append(
      switchRow(text('mnUse'), text('mnUseDesc'), settings.use, (on) => live.setSettings({ use: on })),
      switchRow(text('mnLearn'), text('mnLearnDesc'), settings.learn, (on) => live.setSettings({ learn: on }))
    );
    const curator = curatorRow(live, settings);
    if (curator) card.append(curator);
    return card;
  };

  const renderSummary = (live) => {
    const stats = summarize(shownNotes(live));
    const card = el('section', 'pz-card mn-summary');
    const tiles = el('div', 'mn-stats');
    const tile = (value, label) => { const box = el('div', 'mn-stat'); box.append(el('b', '', String(value)), el('span', 'text-[var(--text-secondary)]', label)); return box; };
    tiles.append(tile(stats.active, text('mnNotesCount')), tile(stats.standing, text('mnStandingCount')), tile(stats.updatedAt ? relative(stats.updatedAt) : text('mnNever'), text('mnUpdatedAt')));
    const manage = button(`${text('mnManage')} →`, 'btn-primary mn-btn', () => go({ view: 'manage', shown: PAGE, menu: '' }));
    card.append(tiles, manage);

    const recent = el('section', 'pz-card mn-recent');
    recent.append(el('div', 'pz-head', ''));
    recent.firstChild.append(el('h3', '', text('mnRecent')));
    const events = joinTidyEvents(live.getEvents()).filter((event) => describeEvent(event) || describeTidy(event)).slice(0, RECENT);
    if (!events.length) recent.append(el('p', 'pz-sub mn-pad text-[var(--text-secondary)]', text('mnNoRecent')));
    for (const event of events) {
      const row = el('div', 'mn-event');
      const copy = el('div', 'mn-event-text');
      copy.append(el('div', '', eventLine(event)), el('div', 'mn-faint', relative(event.at)));
      row.append(copy, button(text('mnUndo'), 'mn-link', () => void actions.undo(event)));
      recent.append(row);
    }

    const rebuild = rebuildCard(live);
    const tidy = tidyCard(live);
    const vector = renderVectorCard({ vectors: getVectors(), el, button, text, ask, showNotification, render });
    const foot = el('section', 'pz-card mn-foot');
    // Taking the notes out and putting them in again is in Settings → Data, ticked among the rest.
    foot.append(el('p', 'pz-sub mn-faint', text('mnTransferHint')), button(text('mnClear'), 'mn-btn mn-danger', () => void actions.clear()));
    return [card, ...(rebuild ? [rebuild] : []), ...(tidy ? [tidy] : []), ...(vector ? [vector] : []), recent, foot];
  };

  // The tidy of the notes (memory-store/page-tidy.js): when it last ran, and a button to run it now.
  let tidying = false;
  const tidyCard = (live) => {
    const controller = getRebuild();
    if (!controller?.tidyNow) return null;
    const card = el('section', 'pz-card mn-rebuild');
    const head = el('div', 'pz-head');
    head.append(el('h3', '', text('mnTidyTitle')));
    const body = el('div', 'mn-rebuild-body');
    const last = live.getSettings().consolidatedAt;
    body.append(el('p', 'pz-sub text-[var(--text-secondary)]', text('mnTidyDesc')), el('p', 'mn-rebuild-status mn-faint', last ? text('mnTidyLast', { when: relative(last) }) : text('mnTidyNever')));
    const run = button(text(tidying ? 'mnTidyRunning' : 'mnTidyNow'), 'mn-btn', async () => {
      if (tidying) return;
      tidying = true;
      render();
      const result = await controller.tidyNow();
      tidying = false;
      render();
      const done = result.ran || result.skipped === 'empty';
      showNotification(text(!done ? 'mnTidyFailed' : result.changed?.length ? 'mnTidyDoneChanged' : 'mnTidyDoneNone', { n: result.changed?.length || 0 }), done ? 'success' : 'error');
    });
    run.disabled = tidying;
    const actions = el('div', 'mn-rebuild-actions');
    actions.append(run);
    body.append(actions);
    card.append(head, body);
    return card;
  };

  const rebuildCard = (live) => {
    const controller = getRebuild();
    if (!controller) return null;
    const state = controller.getState();
    const card = el('section', 'pz-card mn-rebuild');
    const head = el('div', 'pz-head');
    head.append(el('h3', '', text('mnRebuildTitle')));
    const body = el('div', 'mn-rebuild-body');
    body.append(el('p', 'pz-sub text-[var(--text-secondary)]', text('mnRebuildDesc')));
    const status = { running: 'mnRebuildRunning', paused: 'mnRebuildPaused', done: 'mnRebuildDone', error: state.error === 'interrupted' ? 'mnRebuildInterrupted' : 'mnRebuildError' }[state.status];
    const available = controller.available(state.status === 'idle' ? 0 : state.skip);
    if (status) body.append(el('p', 'mn-rebuild-status', text(status, { done: state.done, total: state.total, added: state.added, error: state.error })));
    else if (!available) body.append(el('p', 'mn-rebuild-status mn-faint', text('mnRebuildNone')));
    const actions = el('div', 'mn-rebuild-actions');
    const hasNotes = shownNotes(live).some(isActive);
    if (state.status === 'running') actions.append(button(text('mnRebuildPause'), 'mn-btn', () => controller.pause()));
    else {
      if (state.status === 'paused' || state.error === 'interrupted') actions.append(button(text('mnRebuildContinue'), 'btn-primary mn-btn', () => void controller.start()));
      else if (available) actions.append(button(text(hasNotes ? 'mnRebuildAgain' : 'mnRebuildStart'), hasNotes ? 'mn-btn' : 'btn-primary mn-btn', async () => {
        if (hasNotes && !await ask({ title: text('mnRebuildConfirmTitle'), message: text('mnRebuildConfirm'), confirmLabel: text('mnRebuildAgain') })) return;
        void controller.start({ clearFirst: hasNotes });
      }));
      if (state.status === 'done' && controller.available(state.skip + 30)) actions.append(button(text('mnRebuildOlder'), 'mn-btn', () => void controller.older()));
    }
    if (actions.children.length) body.append(actions);
    card.append(head, body);
    return card;
  };

  const chip = (label, active, onClick, icon = '') => {
    const node = button(label, `mn-chip${active ? ' mn-chip-on' : ''}`, onClick);
    if (icon) node.prepend(memoryIcon(document, icon, { size: 14 }));
    return node;
  };

  // Closing what is open (the menu of a note, the menu of a category) by a tap anywhere else, or Escape.
  let stopOutside = null;
  const watchOutside = () => {
    const open = Boolean(state.menu || state.catMenu);
    if (!open) { stopOutside?.(); stopOutside = null; return; }
    if (stopOutside) return;
    const onClick = (event) => { if (!event.target.closest?.('.mn-menu, .mn-more, .mn-cat-more')) go({ menu: '', menuView: '', catMenu: false }); };
    const onKey = (event) => { if (event.key === 'Escape') go({ menu: '', menuView: '', catMenu: false }); };
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);
    stopOutside = () => { document.removeEventListener('click', onClick, true); document.removeEventListener('keydown', onKey, true); };
  };

  const menuItem = (label, onClick, { danger = false, icon = '', checked = false, back = false } = {}) => {
    const node = button('', `mn-menu-item${danger ? ' mn-danger' : ''}`, onClick);
    node.setAttribute('role', 'menuitem');
    if (icon) node.append(memoryIcon(document, icon, { size: 15 }));
    node.append(el('span', 'mn-menu-label', label));
    if (checked) node.append(el('span', 'mn-menu-check', '✓'));
    if (back) node.classList.add('mn-menu-back');
    return node;
  };

  // The menu of a note: what can be done with it. "Change category" opens the list of categories in the same place.
  const noteMenu = (note) => {
    const menu = el('div', 'mn-menu');
    menu.setAttribute('role', 'menu');
    if (state.menuView === 'kind') {
      menu.append(menuItem(`← ${text('mnMoveTo')}`, () => go({ menuView: '' }), { back: true }));
      const current = kindFor(note, categories());
      for (const category of categories()) menu.append(menuItem(nameOfCategory(category), () => void actions.move(note, category.id), { checked: current === category.id }));
      menu.append(menuItem(text('mnKindNone'), () => void actions.move(note, UNCATEGORIZED), { checked: current === UNCATEGORIZED }));
      return menu;
    }
    menu.append(
      menuItem(text('mnEdit'), () => void actions.edit(note)),
      menuItem(text('mnMoveTo'), () => go({ menuView: 'kind' })),
      menuItem(text(note.standing ? 'mnUnpin' : 'mnPin'), () => void actions.standing(note)),
      menuItem(text(note.surface === 'never' ? 'mnMention' : 'mnNoMention'), () => void actions.never(note)),
      menuItem(text('mnDelete'), () => void actions.remove(note), { danger: true })
    );
    return menu;
  };

  // One note: its words, and under them in small quiet letters the category, whether it is standing and when it was last used. Everything that can be done is in the menu on the right.
  const noteRow = (note) => {
    const row = el('div', 'mn-note');
    const body = el('div', 'mn-note-body');
    body.append(el('div', 'mn-note-text', note.text));
    const meta = el('div', 'mn-meta');
    const bits = [nameOfKind(kindFor(note, categories()))];
    // A note a project keeps for itself says which project.
    if (note.projectId) bits.push(text('mnTagProject', { name: getProjectName(note.projectId) }));
    if (note.surface === 'never') bits.push(text('mnTagNever'));
    // A standing note comes with every reply, so "not used yet" would be wrong for it.
    bits.push(note.standing ? text('mnStandingEveryTime') : note.lastUsedAt ? text('mnLastUsed', { when: relative(note.lastUsedAt) }) : text('mnNeverUsed'));
    if (note.standing) meta.append(memoryIcon(document, 'pin', { size: 12 }));
    meta.append(document.createTextNode(bits.join(' · ')));
    body.append(meta);
    row.append(body);
    const open = state.menu === note.id;
    const more = button('•••', `mn-more${open ? ' is-open' : ''}`, () => go({ menu: open ? '' : note.id, menuView: '' }), { ariaLabel: text('mnMenu') });
    more.setAttribute('aria-haspopup', 'menu');
    more.setAttribute('aria-expanded', String(open));
    row.append(more);
    if (open) row.append(noteMenu(note));
    return row;
  };

  // The categories: one row that slides sideways (All, Standing, each category, the uncategorized when there are some, the archive) and a round + that stays at its right, outside the row. The category that
  // is chosen carries its own ••• (rename, remove) inside its pill, so nothing outside the row appears or goes away when one is chosen.
  const ICON_PLUS = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
  const ICON_DOTS = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" aria-hidden="true"><path d="M5 12h.01M12 12h.01M19 12h.01"/></svg>';
  const categoryChips = (live, stats) => {
    const wrap = el('div', 'mn-cats');
    const chips = el('div', 'mn-chips');
    const counts = countByCategory(shownNotes(live), categories());
    const chosen = state.filter === 'active' ? state.kind : '';
    chips.append(chip(text('mnFilterAll'), state.filter === 'active' && !state.kind, () => go({ filter: 'active', kind: '', shown: PAGE, catMenu: false })));
    chips.append(chip(text('mnFilterStanding'), state.filter === 'standing', () => go({ filter: 'standing', kind: '', shown: PAGE, catMenu: false }), 'pin'));
    for (const category of categories()) {
      const on = chosen === category.id;
      const node = chip(nameOfCategory(category), on, () => go({ filter: 'active', kind: category.id, shown: PAGE, catMenu: false }));
      if (counts[category.id]) node.append(el('span', 'mn-chip-count', String(counts[category.id])));
      if (!on) { chips.append(node); continue; }
      // The chosen one: its pill holds the chip and its menu button.
      node.classList.remove('mn-chip', 'mn-chip-on');
      node.classList.add('mn-chip-main');
      const more = button('', `mn-cat-more${state.catMenu ? ' is-open' : ''}`, () => go({ catMenu: !state.catMenu }), { ariaLabel: text('mnCatOptions') });
      more.innerHTML = ICON_DOTS;
      more.setAttribute('aria-haspopup', 'menu');
      more.setAttribute('aria-expanded', String(state.catMenu));
      const pill = el('span', 'mn-chip mn-chip-on mn-chip-split');
      pill.append(node, more);
      chips.append(pill);
    }
    if (counts[UNCATEGORIZED]) {
      const node = chip(text('mnKindNone'), chosen === UNCATEGORIZED, () => go({ filter: 'active', kind: UNCATEGORIZED, shown: PAGE, catMenu: false }));
      node.append(el('span', 'mn-chip-count', String(counts[UNCATEGORIZED])));
      chips.append(node);
    }
    if (stats.archived) chips.append(chip(`${text('mnFilterArchived')} ${stats.archived}`, state.filter === 'archived', () => go({ filter: 'archived', kind: '', shown: PAGE, catMenu: false })));
    wrap.append(chips);
    const add = button('', 'mn-cat-add', () => void actions.addCategory(), { ariaLabel: text('mnCatAdd') });
    add.innerHTML = ICON_PLUS;
    add.title = text('mnCatAdd');
    wrap.append(add);
    if (state.catMenu && categories().some((category) => category.id === chosen)) {
      const menu = el('div', 'mn-menu mn-menu-cat');
      menu.setAttribute('role', 'menu');
      menu.append(menuItem(text('mnCatRename'), () => void actions.renameCategory(chosen)), menuItem(text('mnCatDelete'), () => void actions.removeCategory(chosen), { danger: true }));
      wrap.append(menu);
    }
    return wrap;
  };

  const renderManage = (live) => {
    const page = el('section', 'pz-card mn-page');
    const back = button(`← ${text('mnBack')}`, 'mn-back', () => go({ view: 'summary', query: '', kind: '', filter: 'active', menu: '', menuView: '', catMenu: false }));
    const stats = summarize(shownNotes(live));
    const head = el('div', 'mn-page-head');
    head.append(el('h3', '', text('mnManageTitle')), el('span', 'mn-faint', `${stats.active} / 300`));
    const tools = el('div', 'mn-tools');
    const search = el('input', 'pz-input mn-search');
    search.type = 'search';
    search.placeholder = text('mnSearch');
    search.value = state.query;
    search.addEventListener('input', () => {
      state.query = search.value;
      state.shown = PAGE;
      renderList(live, list);
    });
    tools.append(search, button(`＋ ${text('mnAdd')}`, 'btn-primary mn-btn', () => void actions.add()));
    const list = el('div', 'mn-list');
    renderList(live, list);
    page.append(back, head, tools, categoryChips(live, stats), list);
    return page;
  };

  function renderList(live, list) {
    list.replaceChildren();
    const all = filterNotes(shownNotes(live), { view: state.filter, kind: state.kind, query: state.query, categories: categories() });
    if (!all.length) {
      list.append(el('p', 'pz-sub mn-pad text-[var(--text-secondary)]', text(shownNotes(live).some(isActive) ? 'mnNoMatch' : 'mnEmpty')));
      return;
    }
    const box = el('div', 'mn-notes');
    all.slice(0, state.shown).forEach((note) => box.append(noteRow(note)));
    list.append(box);
    if (all.length > state.shown) list.append(button(text('mnMore'), 'mn-btn mn-more-btn', () => go({ shown: state.shown + PAGE })));
  }

  // The menu of the chosen category opens under its own ••• (not at an edge of the page), kept inside the row.
  const placeCategoryMenu = () => {
    const menu = container?.querySelector('.mn-menu-cat');
    const more = container?.querySelector('.mn-chip-split .mn-cat-more');
    const wrap = menu?.parentElement;
    if (!menu || !more || !wrap || !wrap.clientWidth) return;
    const room = wrap.getBoundingClientRect();
    const at = more.getBoundingClientRect();
    const left = Math.max(0, Math.min(room.width - menu.offsetWidth, at.right - room.left - menu.offsetWidth));
    menu.style.left = `${Math.round(left)}px`;
    menu.style.right = 'auto';
  };

  let drawnView = null;
  const scrollParentOf = (node) => {
    for (let parent = node?.parentElement; parent; parent = parent.parentElement) {
      const overflow = document.defaultView?.getComputedStyle?.(parent)?.overflowY;
      if (overflow === 'auto' || overflow === 'scroll') return parent;
    }
    return null;
  };

  function render() {
    if (!container) return;
    if (!stopListening) stopListening = getMemory()?.onChange?.(render) || null;
    // The page that manages the notes stands alone (with a way back); every other view starts with the title.
    // Drawn again, the page keeps where it was: the row of the categories slid sideways and the settings scrolled (the row used to start over at "All" at every tap).
    const same = drawnView === state.view;
    const chipsLeft = container.querySelector('.mn-chips')?.scrollLeft || 0;
    const scroller = scrollParentOf(container);
    const scrolled = scroller ? scroller.scrollTop : 0;
    container.replaceChildren(...(state.view === 'manage' && store()?.isLoaded() ? [] : [renderMasterCard()]));
    const live = store();
    if (!live?.isLoaded()) {
      container.append(el('p', 'pz-sub mn-pad text-[var(--text-secondary)]', text(getMemory()?.failed?.() ? 'mnUnavailable' : 'mnLoading')));
      return;
    }
    if (state.view === 'manage') container.append(renderManage(live));
    else container.append(renderSwitches(live), ...renderSummary(live));
    if (same) {
      const chips = container.querySelector('.mn-chips');
      if (chips) {
        chips.scrollLeft = chipsLeft;
        // The chosen one is kept in sight, and clear of the fade at the right end of the row (its ••• would be faded out).
        const on = chips.querySelector('.mn-chip-on');
        if (on && chips.clientWidth > 0) {
          const FADE = 32;
          const right = on.offsetLeft + on.offsetWidth;
          if (right > chips.scrollLeft + chips.clientWidth - FADE) chips.scrollLeft = right - chips.clientWidth + FADE + 8;
          if (on.offsetLeft < chips.scrollLeft) chips.scrollLeft = Math.max(0, on.offsetLeft - 12);
        }
      }
      if (scroller && scroller.scrollTop !== scrolled) scroller.scrollTop = scrolled;
    } else if (scroller && scroller.scrollTop !== 0) {
      // Another page of the part (the notes are opened, or left): it starts at its top, not where the page before was scrolled to.
      scroller.scrollTop = 0;
    }
    placeCategoryMenu();
    drawnView = state.view;
  }

  return {
    /** Puts the part at the top of the memory section (once) and keeps it drawn while the notes change. */
    mount() {
      const section = document.getElementById('memory-section');
      if (!section) return false;
      if (!container || !container.isConnected) {
        container = el('div', 'pz mn-root');
        container.id = 'memory-notes-settings';
        section.prepend(container);
      }
      stopListening?.();
      stopListening = getMemory()?.onChange?.(render) || null;
      stopRebuild?.();
      stopRebuild = getRebuild()?.subscribe?.(() => render()) || null;
      stopVectors?.();
      stopVectors = getVectors()?.subscribe?.(() => render()) || null;
      // Opening the settings starts at the summary, not where the person left the list.
      state.view = 'summary';
      drawnView = null; // opened: from the top
      render();
      return true;
    },
    render
  };
}
