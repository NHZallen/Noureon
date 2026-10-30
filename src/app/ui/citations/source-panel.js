// The sources of a reply as one panel with tabs (All | Web | Memory | Chats), in the sheet that rises from the bottom and in the right-hand panel: the pages its web search found
// (source-list.js), the notes of the memory it was given or looked up, and the past conversations it looked into. Memory and conversation rows only say which note or which chat, never
// the words of a chat. A note can be marked "not relevant here"; a chat that is still there can be opened. Drawn with textContent; the icons are fixed markup (icons/memory-icons.js).

import { sandboxText } from '../../runtime/sandbox/sandbox-texts.js';
import { memoryIcon } from '../icons/memory-icons.js';
import { createSourceItem, formatSourceDate } from './source-list.js';

const make = (document, tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/**
 * `groups`: { web: [sources], notes: [{ id, text, kind, standing, gone }], conversations: [{ id, title, at, available }] }.
 * `options`: { language, kindLabel(kind), onNotRelevant(id) (async), onOpenChat(id), tab ('all' by default) }. Returns the element.
 */
export function createSourcePanel(document, groups, { language = 'zh-TW', kindLabel = () => '', onNotRelevant = null, onOpenChat = null, tab = 'all' } = {}) {
  const text = (key, values) => sandboxText(language, key, values);
  const web = groups.web || [];
  const notes = groups.notes || [];
  const chats = groups.conversations || [];
  const tabs = [
    { id: 'all', label: text('sourceTabAll'), count: web.length + notes.length + chats.length },
    ...(web.length ? [{ id: 'web', icon: 'globe', label: text('sourceTabWeb'), count: web.length }] : []),
    ...(notes.length ? [{ id: 'memory', icon: 'brain', label: text('sourceTabMemory'), count: notes.length }] : []),
    ...(chats.length ? [{ id: 'chats', icon: 'messages', label: text('sourceTabChats'), count: chats.length }] : [])
  ];
  const root = make(document, 'div', 'source-panel');
  const strip = make(document, 'div', 'history-tabs source-panel-tabs');
  strip.setAttribute('role', 'tablist');
  const body = make(document, 'div', 'source-panel-body');
  const buttons = new Map();

  const rowIcon = (name) => {
    const holder = make(document, 'span', 'source-row-icon');
    holder.append(memoryIcon(document, name, { size: 14 }));
    return holder;
  };
  const actionsOf = (button) => {
    const holder = make(document, 'div', 'source-row-actions');
    holder.append(button);
    return holder;
  };

  const noteRow = (note) => {
    const row = make(document, 'div', 'source-item source-row is-memory');
    row.dataset.noteId = note.id;
    row.append(rowIcon('brain'));
    const main = make(document, 'div', 'source-row-main');
    if (note.gone) {
      main.append(make(document, 'p', 'source-row-title is-faint', text('sourceNoteGone')));
    } else {
      main.append(make(document, 'p', 'source-row-title', note.text));
      const meta = [text('sourceTabMemory'), kindLabel(note.kind), note.standing ? text('sourceStanding') : ''].filter(Boolean).join('・');
      main.append(make(document, 'p', 'source-row-meta', meta));
      if (onNotRelevant && !note.standing) {
        const mark = make(document, 'button', 'source-row-action');
        mark.type = 'button';
        mark.append(memoryIcon(document, 'hide', { size: 14 }), make(document, 'span', '', text('sourceNotRelevant')));
        mark.addEventListener('click', async () => {
          mark.disabled = true;
          try {
            await onNotRelevant(note.id);
            mark.replaceWith(make(document, 'span', 'source-row-meta', text('sourceMarked')));
          } catch {
            mark.disabled = false;
          }
        });
        main.append(actionsOf(mark));
      }
    }
    row.append(main);
    return row;
  };

  const chatRow = (chat) => {
    const row = make(document, 'div', 'source-item source-row is-chat');
    row.dataset.chatId = chat.id;
    row.append(rowIcon('messages'));
    const main = make(document, 'div', 'source-row-main');
    main.append(make(document, 'p', 'source-row-title', chat.title || text('sourceUntitledChat')));
    const day = formatSourceDate(chat.at, language);
    const meta = [day, chat.available ? '' : text('sourceChatGone')].filter(Boolean).join('・');
    if (meta) main.append(make(document, 'p', 'source-row-meta', meta));
    if (chat.available && onOpenChat) {
      const open = make(document, 'button', 'source-row-action');
      open.type = 'button';
      open.append(memoryIcon(document, 'open', { size: 14 }), make(document, 'span', '', text('sourceOpenChat')));
      open.addEventListener('click', () => onOpenChat(chat.id));
      main.append(actionsOf(open));
    }
    row.append(main);
    return row;
  };

  const show = (id) => {
    for (const [key, button] of buttons) button.setAttribute('aria-selected', String(key === id));
    const rows = [];
    // Memory and chats first: they are the few, the pages are often twenty.
    if (id === 'all' || id === 'memory') rows.push(...notes.map(noteRow));
    if (id === 'all' || id === 'chats') rows.push(...chats.map(chatRow));
    if (id === 'all' || id === 'web') rows.push(...web.map((source) => createSourceItem(document, source, { language, detailed: false })));
    body.replaceChildren(...(rows.length ? rows : [make(document, 'p', 'history-sources-empty', text('sourceEmptyTab'))]));
    body.scrollTop = 0;
  };

  for (const entry of tabs) {
    const button = make(document, 'button', 'history-tab source-panel-tab');
    button.type = 'button';
    button.setAttribute('role', 'tab');
    button.dataset.tab = entry.id;
    if (entry.icon) button.append(memoryIcon(document, entry.icon, { size: 14 }));
    button.append(make(document, 'span', '', entry.label), make(document, 'span', 'history-tab-count', String(entry.count)));
    button.addEventListener('click', () => show(entry.id));
    buttons.set(entry.id, button);
    strip.append(button);
  }
  root.append(strip, body);
  show(tabs.some((entry) => entry.id === tab) ? tab : 'all');
  return root;
}
