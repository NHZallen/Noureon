// What the "Sources" button under a reply opens: the pages its web search found, the notes of the memory it drew on and the past conversations it looked into, as one panel with
// tabs (ui/citations/source-panel.js), in the right-hand panel on a wide screen and as a sheet on a phone. A reply with pages only opens as it always did.

import { listableSources } from '../../ui/citations/citation-model.js';
import { createSourcePanel } from '../../ui/citations/source-panel.js';
import { closeSourceSheet, openSourceSheet } from '../../ui/citations/source-sheet.js';
import { liftSandboxRunBlock } from '../../ui/sandbox/sandbox-run-block.js';
import { sandboxText } from '../sandbox/sandbox-texts.js';
import { markNotRelevant } from '../memory-notes/standing.js';
import { getNotesMemory, getPageHistory } from '../memory-store/memory-ref.js';
import { collectReplySources } from '../memory-store/reply-sources.js';
import { formatSourceDate } from '../../ui/citations/source-list.js';

const KIND_KEY = { preference: 'mnKindPreference', fact: 'mnKindFact', project: 'mnKindProject', relationship: 'mnKindRelationship', routine: 'mnKindRoutine' };

/** The parts of the sources of `message`: { web, notes, conversations }. The notes are left out when the memory is not loaded (they could not be told from deleted ones). */
export function sourcesOfReply(message) {
  const { run } = liftSandboxRunBlock((message?.parts || []).map((part) => part.text || '').join('\n'));
  const store = getNotesMemory()?.getStore?.();
  const found = collectReplySources({ message, notes: store?.isLoaded?.() ? store.getNotes() : [], conversations: getPageHistory()?.conversations?.() || [] });
  return { web: listableSources(run?.sources), notes: store?.isLoaded?.() ? found.notes : [], conversations: found.conversations };
}

export function openReplySources({ window, document, message, language, i18n = {} }) {
  const groups = sourcesOfReply(message);
  const extra = groups.notes.length > 0 || groups.conversations.length > 0;
  if (!groups.web.length && !extra) return;
  if (!extra) {
    if (window.innerWidth >= 768) document.dispatchEvent(new window.CustomEvent('noureon:open-sources', { detail: { sources: groups.web } }));
    else openSourceSheet({ document, sources: groups.web, all: true, language });
    return;
  }
  const store = getNotesMemory()?.getStore?.();
  const options = {
    language,
    kindLabel: (kind) => i18n[language]?.[KIND_KEY[kind]] || '',
    onNotRelevant: async (id) => { await store.commitNotes(store.getNotes().map((note) => (note.id === id ? markNotRelevant(note) : note))); },
    onOpenChat: (id) => {
      closeSourceSheet();
      document.dispatchEvent(new window.CustomEvent('noureon:open-history-source', { detail: { id } }));
    }
  };
  if (window.innerWidth >= 768) document.dispatchEvent(new window.CustomEvent('noureon:open-sources', { detail: { sources: groups.web, groups, panel: options } }));
  else openSourceSheet({ document, sources: groups.web, all: true, language, title: sandboxText(language, 'sourcesTab'), renderContent: (list) => list.append(createSourcePanel(document, groups, options)) });
}

/**
 * The list inside a memory step of a saved reply ("Recalled 2 notes", "Reviewed 10 conversations"), filled when the step is opened: the notes as they are now (one that was deleted
 * says so) or the conversations with their names and days (one that is gone says so, one that is still there can be opened). `row.dataset.memoryItems` holds the ids kept with the step.
 */
export function fillMemoryRow({ document, row, language }) {
  const list = row?.querySelector?.('.memory-row-list');
  if (!list) return false;
  let items = [];
  try {
    items = JSON.parse(row.dataset.memoryItems || '[]');
  } catch {
    items = [];
  }
  const text = (key) => sandboxText(language, key);
  const make = (tag, className, content) => {
    const node = document.createElement(tag);
    node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  };
  const lines = [];
  if (row.dataset.kind === 'memory-recall') {
    const store = getNotesMemory()?.getStore?.();
    const byId = new Map((store?.isLoaded?.() ? store.getNotes() : []).map((note) => [note.id, note]));
    for (const id of items) {
      const note = byId.get(id);
      lines.push(!note || note.status !== 'active' ? make('p', 'memory-row-item is-faint', text('sourceNoteGone')) : make('p', 'memory-row-item', note.text));
    }
  } else {
    const byId = new Map((getPageHistory()?.conversations?.() || []).map((conversation) => [conversation.id, conversation]));
    for (const entry of items) {
      const conversation = byId.get(entry?.id);
      const available = Boolean(conversation) && !conversation.deletedAt;
      const line = make('div', 'memory-row-item memory-row-chat');
      line.append(make('span', 'memory-row-title', (available && conversation.title) || text('sourceUntitledChat')));
      const meta = [formatSourceDate(entry.at || (available ? conversation.lastUpdatedAt : ''), language), available ? '' : text('sourceChatGone')].filter(Boolean).join('・');
      if (meta) line.append(make('span', 'memory-row-meta', meta));
      if (available) {
        const open = make('button', 'source-row-action', text('sourceOpenChat'));
        open.type = 'button';
        open.dataset.openChat = entry.id;
        line.append(open);
      }
      lines.push(line);
    }
  }
  list.replaceChildren(...lines);
  return true;
}
