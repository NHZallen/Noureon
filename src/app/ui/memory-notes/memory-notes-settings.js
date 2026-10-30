// Settings → Memory for the memory of notes (docs/superpowers/specs/2026-10-30-memory-redesign-design.md, §8 P3; the layout the owner chose on 2026-10-30: a summary card with a
// separate page that manages the notes). The top card holds the switch to the new memory; with it on, the old summary is hidden and the page shows the two switches (use, learn), the
// summary with the recent changes (each can be undone), and, one step further, the list of notes with search, kinds, and what the person can do with each note.
// Everything is drawn with textContent (a note is the person's text), and colours come from the tokens in memory-notes.css.

import { addByUser, deleteByUser, describeEvent, editByUser, filterNotes, setNeverByUser, setStandingByUser, summarize, undoEvent } from '../../runtime/memory-notes/manage.js';
import { NOTE_KINDS, isActive } from '../../runtime/memory-notes/notes.js';

const PAGE = 50;
const RECENT = 3;
const KIND_KEY = Object.freeze({ preference: 'mnKindPreference', fact: 'mnKindFact', project: 'mnKindProject', relationship: 'mnKindRelationship', routine: 'mnKindRoutine' });
const ERROR_KEY = Object.freeze({ full: 'mnErrFull', duplicate: 'mnErrDuplicate', empty: 'mnErrEmpty', cannot: 'mnErrCannotPin', missing: 'mnErrMissing' });

export function createMemoryNotesSettings({
  document,
  getConfig,
  saveConfig,
  getMemory,
  getUser = () => null,
  getText,
  showNotification = () => {},
  showCustomDialog,
  createId = () => globalThis.crypto.randomUUID(),
  now = () => new Date().toISOString()
}) {
  const state = { view: 'summary', query: '', kind: '', filter: 'active', shown: PAGE, menu: '' };
  let container = null;
  let stopListening = null;
  const hiddenByUs = new Set();

  const text = (key, values = {}) => Object.entries(values).reduce((out, [name, value]) => out.replaceAll(`{${name}}`, String(value)), getText(key) || key);
  const store = () => getMemory()?.getStore?.() || null;

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
    async undo(event) {
      const result = undoEvent(store().getNotes(), event, { now });
      if (result.ok) await store().commitNotes(result.notes);
      await store().removeEvent(event.id);
      if (result.ok) showNotification(text('mnUndone'), 'success');
    },
    async clear() {
      if (!await ask({ title: text('mnClearTitle'), message: text('mnClearConfirm'), confirmLabel: text('mnClear') })) return;
      await store().clearAll({ keepTombstones: true });
      showNotification(text('mnCleared'), 'success');
    },
    exportNotes() {
      const notes = store().getNotes().filter(isActive).map(({ text: words, kind, standing, surface, createdAt, updatedAt }) => ({ text: words, kind, standing, surface, createdAt, updatedAt }));
      const url = URL.createObjectURL(new Blob([JSON.stringify(notes, null, 2)], { type: 'application/json' }));
      const link = el('a');
      link.href = url;
      link.download = 'noureon-memory-notes.json';
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };

  const go = (patch) => { Object.assign(state, patch); render(); };

  const eventLine = (event) => {
    const info = describeEvent(event);
    if (!info) return '';
    const key = { add: 'mnEvAdd', update: 'mnEvUpdate', forget: 'mnEvForget', archive: 'mnEvArchive' }[info.action];
    return text(key, { text: info.text, before: info.beforeText });
  };

  const renderMasterCard = (config) => {
    const card = el('section', 'pz-card');
    const head = el('div', 'pz-head mn-head');
    head.append(el('h3', '', text('mnTitle')), el('span', 'mn-beta', text('mnBeta')));
    card.append(head, el('p', 'pz-sub mn-intro text-[var(--text-secondary)]', text('mnIntro')));
    card.append(switchRow(text('mnUseNew'), text('mnUseNewDesc'), config.memorySystem === 'notes', async (on) => {
      config.memorySystem = on ? 'notes' : 'classic';
      await saveConfig();
      if (on) void getMemory()?.attach?.(getUser());
      render();
    }));
    return card;
  };

  const renderSwitches = (live) => {
    const settings = live.getSettings();
    const card = el('section', 'pz-card');
    card.append(
      switchRow(text('mnUse'), text('mnUseDesc'), settings.use, (on) => live.setSettings({ use: on })),
      switchRow(text('mnLearn'), text('mnLearnDesc'), settings.learn, (on) => live.setSettings({ learn: on }))
    );
    return card;
  };

  const renderSummary = (live) => {
    const stats = summarize(live.getNotes());
    const card = el('section', 'pz-card mn-summary');
    const tiles = el('div', 'mn-stats');
    const tile = (value, label) => { const box = el('div', 'mn-stat'); box.append(el('b', '', String(value)), el('span', 'text-[var(--text-secondary)]', label)); return box; };
    tiles.append(tile(stats.active, text('mnNotesCount')), tile(stats.standing, text('mnStandingCount')), tile(stats.updatedAt ? relative(stats.updatedAt) : text('mnNever'), text('mnUpdatedAt')));
    const manage = button(`${text('mnManage')} →`, 'btn-primary mn-btn', () => go({ view: 'manage', shown: PAGE, menu: '' }));
    card.append(tiles, manage);

    const recent = el('section', 'pz-card mn-recent');
    recent.append(el('div', 'pz-head', ''));
    recent.firstChild.append(el('h3', '', text('mnRecent')));
    const events = live.getEvents().filter((event) => describeEvent(event)).slice(0, RECENT);
    if (!events.length) recent.append(el('p', 'pz-sub mn-pad text-[var(--text-secondary)]', text('mnNoRecent')));
    for (const event of events) {
      const row = el('div', 'mn-event');
      const copy = el('div', 'mn-event-text');
      copy.append(el('div', '', eventLine(event)), el('div', 'mn-faint', relative(event.at)));
      row.append(copy, button(text('mnUndo'), 'mn-link', () => void actions.undo(event)));
      recent.append(row);
    }

    const foot = el('section', 'pz-card mn-foot');
    foot.append(button(text('mnExport'), 'mn-btn', () => actions.exportNotes()), button(text('mnClear'), 'mn-btn mn-danger', () => void actions.clear()));
    return [card, recent, foot];
  };

  const chip = (label, active, onClick) => button(label, `mn-chip${active ? ' mn-chip-on' : ''}`, onClick);

  const noteRow = (note) => {
    const row = el('div', 'mn-note');
    const body = el('div', 'mn-note-body');
    body.append(el('div', 'mn-note-text', note.text));
    const meta = el('div', 'mn-meta');
    meta.append(el('span', 'mn-tag', text(KIND_KEY[note.kind])));
    if (note.standing) meta.append(el('span', 'mn-tag mn-tag-strong', text('mnTagStanding')));
    if (note.surface === 'never') meta.append(el('span', 'mn-tag', text('mnTagNever')));
    meta.append(el('span', '', note.lastUsedAt ? text('mnLastUsed', { when: relative(note.lastUsedAt) }) : text('mnNeverUsed')));
    body.append(meta);
    if (state.menu === note.id) {
      const menu = el('div', 'mn-actions');
      menu.append(
        button(text('mnEdit'), 'mn-link', () => void actions.edit(note)),
        button(text(note.standing ? 'mnUnpin' : 'mnPin'), 'mn-link', () => void actions.standing(note)),
        button(text(note.surface === 'never' ? 'mnMention' : 'mnNoMention'), 'mn-link', () => void actions.never(note)),
        button(text('mnDelete'), 'mn-link mn-danger', () => void actions.remove(note))
      );
      body.append(menu);
    }
    row.append(body, button('•••', 'mn-more', () => go({ menu: state.menu === note.id ? '' : note.id }), { ariaLabel: text('mnMenu') }));
    return row;
  };

  const renderManage = (live) => {
    const page = el('section', 'pz-card mn-page');
    const back = button(`← ${text('mnBack')}`, 'mn-back', () => go({ view: 'summary', query: '', kind: '', filter: 'active', menu: '' }));
    const stats = summarize(live.getNotes());
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
    const chips = el('div', 'mn-chips');
    chips.append(chip(text('mnFilterAll'), state.filter === 'active' && !state.kind, () => go({ filter: 'active', kind: '', shown: PAGE })));
    chips.append(chip(text('mnFilterStanding'), state.filter === 'standing', () => go({ filter: 'standing', kind: '', shown: PAGE })));
    for (const kind of NOTE_KINDS) chips.append(chip(text(KIND_KEY[kind]), state.filter === 'active' && state.kind === kind, () => go({ filter: 'active', kind, shown: PAGE })));
    if (stats.archived) chips.append(chip(`${text('mnFilterArchived')} ${stats.archived}`, state.filter === 'archived', () => go({ filter: 'archived', kind: '', shown: PAGE })));
    const list = el('div', 'mn-list');
    renderList(live, list);
    page.append(back, head, tools, chips, list);
    return page;
  };

  function renderList(live, list) {
    list.replaceChildren();
    const all = filterNotes(live.getNotes(), { view: state.filter, kind: state.kind, query: state.query });
    if (!all.length) {
      list.append(el('p', 'pz-sub mn-pad text-[var(--text-secondary)]', text(live.getNotes().some(isActive) ? 'mnNoMatch' : 'mnEmpty')));
      return;
    }
    const box = el('div', 'mn-notes');
    all.slice(0, state.shown).forEach((note) => box.append(noteRow(note)));
    list.append(box);
    if (all.length > state.shown) list.append(button(text('mnMore'), 'mn-btn mn-more-btn', () => go({ shown: state.shown + PAGE })));
  }

  function render() {
    if (!container) return;
    const config = getConfig();
    const section = container.parentElement;
    const notesMode = config.memorySystem === 'notes';
    // The old memory summary has its own controls in the same section: it is out of the way while the notes are in use.
    for (const child of section ? [...section.children] : []) {
      if (child === container) continue;
      if (notesMode && !child.hidden) { child.hidden = true; hiddenByUs.add(child); }
      else if (!notesMode && hiddenByUs.has(child)) { child.hidden = false; hiddenByUs.delete(child); }
    }
    if (!stopListening) stopListening = getMemory()?.onChange?.(render) || null;
    // The page that manages the notes stands alone (with a way back); every other view starts with the switch to the new memory.
    container.replaceChildren(...(notesMode && state.view === 'manage' && store()?.isLoaded() ? [] : [renderMasterCard(config)]));
    if (!notesMode) return;
    const live = store();
    if (!live?.isLoaded()) {
      container.append(el('p', 'pz-sub mn-pad text-[var(--text-secondary)]', text(getMemory()?.failed?.() ? 'mnUnavailable' : 'mnLoading')));
      return;
    }
    if (state.view === 'manage') container.append(renderManage(live));
    else container.append(renderSwitches(live), ...renderSummary(live));
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
      // Opening the settings starts at the summary, not where the person left the list.
      state.view = 'summary';
      render();
      return true;
    },
    render
  };
}
