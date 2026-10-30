// Settings → Memory for the memory of notes (docs/superpowers/specs/2026-10-30-memory-redesign-design.md, §8 P3; the layout the owner chose on 2026-10-30: a summary card with a
// separate page that manages the notes). The top card holds the switch to the new memory; with it on, the old summary is hidden and the page shows the two switches (use, learn), the
// summary with the recent changes (each can be undone), and, one step further, the list of notes with search, kinds, and what the person can do with each note.
// Everything is drawn with textContent (a note is the person's text), and colours come from the tokens in memory-notes.css.

import { renderVectorCard } from './memory-vector-card.js';
import { addByUser, deleteByUser, describeEvent, describeTidy, editByUser, filterNotes, joinTidyEvents, setNeverByUser, setStandingByUser, summarize, undoEvent } from '../../runtime/memory-notes/manage.js';
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
  // The models the person may choose to curate with (text models with a key), as [{ id, name }]; none given: no choice is offered.
  getModels = () => [],
  // Building the memory from the old conversations (memory-store/page-rebuild.js): the controller, or null when this page cannot.
  getRebuild = () => null,
  // The search by meaning (memory-store/page-vectors.js), or null.
  getVectors = () => null,
  getText,
  showNotification = () => {},
  showCustomDialog,
  createId = () => globalThis.crypto.randomUUID(),
  now = () => new Date().toISOString()
}) {
  const state = { view: 'summary', query: '', kind: '', filter: 'active', shown: PAGE, menu: '' };
  let container = null;
  let stopListening = null;
  let stopRebuild = null;
  let stopVectors = null;

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
      for (const id of event.ids || [event.id]) await store().removeEvent(id);
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
    foot.append(button(text('mnExport'), 'mn-btn', () => actions.exportNotes()), button(text('mnClear'), 'mn-btn mn-danger', () => void actions.clear()));
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
    const status = { running: 'mnRebuildRunning', paused: 'mnRebuildPaused', done: 'mnRebuildDone', error: 'mnRebuildError' }[state.status];
    const available = controller.available(state.status === 'idle' ? 0 : state.skip);
    if (status) body.append(el('p', 'mn-rebuild-status', text(status, { done: state.done, total: state.total, added: state.added, error: state.error })));
    else if (!available) body.append(el('p', 'mn-rebuild-status mn-faint', text('mnRebuildNone')));
    const actions = el('div', 'mn-rebuild-actions');
    const hasNotes = live.getNotes().some(isActive);
    if (state.status === 'running') actions.append(button(text('mnRebuildPause'), 'mn-btn', () => controller.pause()));
    else {
      if (state.status === 'paused') actions.append(button(text('mnRebuildContinue'), 'btn-primary mn-btn', () => void controller.start()));
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
    if (!stopListening) stopListening = getMemory()?.onChange?.(render) || null;
    // The page that manages the notes stands alone (with a way back); every other view starts with the title.
    container.replaceChildren(...(state.view === 'manage' && store()?.isLoaded() ? [] : [renderMasterCard()]));
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
      stopRebuild?.();
      stopRebuild = getRebuild()?.subscribe?.(() => render()) || null;
      stopVectors?.();
      stopVectors = getVectors()?.subscribe?.(() => render()) || null;
      // Opening the settings starts at the summary, not where the person left the list.
      state.view = 'summary';
      render();
      return true;
    },
    render
  };
}
