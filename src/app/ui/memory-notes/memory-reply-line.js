// What the memory did, under a reply (docs/superpowers/specs/2026-10-30-memory-redesign-design.md, §4.10): "Memory updated" (what was added, changed or forgotten, each with Undo; shown once in a
// conversation, on its first reply that changed the memory) and "Used N notes from memory" (each note with "Not relevant here"). Both are small and quiet. The ids are in the message's metadata
// (`memoryUpdated`: events, `memoryUsed`: notes); the text is read from the memory now, so a note that was deleted since says so. Drawn with textContent; colours are tokens (memory-notes.css).
// It listens to the page: `noureon:message-drawn` (a message element was made) and `noureon:memory-updated` (a change was made after a reply: the lines are drawn again).

import { describeEvent, undoEvent } from '../../runtime/memory-notes/manage.js';
import { markNotRelevant } from '../../runtime/memory-notes/standing.js';

import { MEMORY_UPDATED_EVENT, MESSAGE_DRAWN_EVENT } from './memory-events.js';

const LINE_CLASS = 'memory-line';

const asIds = (value) => (Array.isArray(value) ? value.filter((id) => typeof id === 'string') : []);

export function startMemoryLines({ document, getConfig, getMemory, getConversation, getText, logger = console }) {
  const text = (key, values = {}) => Object.entries(values).reduce((out, [name, value]) => out.replaceAll(`{${name}}`, String(value)), getText(key) || key);
  const el = (tag, className = '', content = '') => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content) node.textContent = content;
    return node;
  };
  const button = (label, className, onClick) => {
    const node = el('button', className, label);
    node.type = 'button';
    node.addEventListener('click', onClick);
    return node;
  };
  const store = () => getMemory()?.getStore?.() || null;

  // The "Memory updated" line is shown on the first reply of a conversation that changed the memory, and not again.
  const firstUpdated = (conversation, message) => {
    const first = (conversation?.messages || []).find((entry) => asIds(entry?.metadata?.memoryUpdated).length);
    return first === message;
  };

  function eventsPanel(live, ids, rerender) {
    const panel = el('div', 'memory-line-panel');
    const events = live.getEvents().filter((event) => ids.includes(event.id));
    for (const event of events) {
      const info = describeEvent(event);
      if (!info) continue;
      const key = { add: 'mnEvAdd', update: 'mnEvUpdate', forget: 'mnEvForget', archive: 'mnEvArchive' }[info.action];
      const row = el('div', 'memory-line-row');
      row.append(el('span', 'memory-line-text', text(key, { text: info.text, before: info.beforeText })), button(text('mnUndo'), 'memory-line-link', async () => {
        const result = undoEvent(live.getNotes(), event);
        if (result.ok) await live.commitNotes(result.notes);
        await live.removeEvent(event.id);
        rerender();
      }));
      panel.append(row);
    }
    return panel.children.length ? panel : null;
  }

  function usedPanel(live, ids) {
    const panel = el('div', 'memory-line-panel');
    const notes = new Map(live.getNotes().map((note) => [note.id, note]));
    for (const id of ids) {
      const note = notes.get(id);
      const row = el('div', 'memory-line-row');
      if (!note || note.status !== 'active') {
        row.append(el('span', 'memory-line-text memory-line-faint', text('mnNoteGone')));
      } else {
        const mark = button(text('mnNotRelevant'), 'memory-line-link', async () => {
          const current = live.getNotes().find((entry) => entry.id === id);
          if (!current) return;
          await live.commitNotes(live.getNotes().map((entry) => (entry.id === id ? markNotRelevant(entry) : entry)));
          mark.replaceWith(el('span', 'memory-line-faint', text('mnMarked')));
        });
        row.append(el('span', 'memory-line-text', note.text), mark);
      }
      panel.append(row);
    }
    return panel;
  }

  /** Draws (again) the line under one reply. Nothing is drawn for a user's message, a reply the memory did not touch, or when the notes are not in use. */
  function decorate({ element, message, conversation }) {
    try {
      const stack = element?.querySelector?.('.message-stack');
      stack?.querySelector?.(`.${LINE_CLASS}`)?.remove();
      if (!stack || message?.role === 'user') return;
      const live = store();
      if (!live?.isLoaded()) return;
      const updatedIds = firstUpdated(conversation, message) ? asIds(message?.metadata?.memoryUpdated) : [];
      const usedIds = asIds(message?.metadata?.memoryUsed);
      const hasUpdated = updatedIds.length > 0 && live.getEvents().some((event) => updatedIds.includes(event.id) && describeEvent(event));
      if (!hasUpdated && !usedIds.length) return;
      const line = el('div', LINE_CLASS);
      const bar = el('div', 'memory-line-bar');
      const panelHolder = el('div', 'memory-line-holder');
      let open = '';
      const rerender = () => decorate({ element, message, conversation });
      const toggle = (kind) => {
        open = open === kind ? '' : kind;
        panelHolder.replaceChildren();
        if (!open) return;
        const panel = kind === 'updated' ? eventsPanel(live, updatedIds, rerender) : usedPanel(live, usedIds);
        if (panel) panelHolder.append(panel);
      };
      if (hasUpdated) bar.append(button(text('mnLineUpdated'), 'memory-line-chip', () => toggle('updated')));
      if (usedIds.length) bar.append(button(text('mnLineUsed', { n: usedIds.length }), 'memory-line-chip', () => toggle('used')));
      line.append(bar, panelHolder);
      stack.append(line);
    } catch (error) {
      logger.warn?.('The memory line under a reply could not be drawn.', error);
    }
  }

  document.addEventListener(MESSAGE_DRAWN_EVENT, (event) => decorate(event.detail || {}));
  // A change made after the reply was drawn (the curator, or the end of a streamed reply): the lines of the open conversation are drawn again.
  document.addEventListener(MEMORY_UPDATED_EVENT, () => {
    const conversation = getConversation();
    for (const element of document.querySelectorAll('[data-message-index]')) {
      const message = conversation?.messages?.[Number(element.dataset.messageIndex)];
      if (message) decorate({ element, message, conversation });
    }
  });
  return { decorate };
}
