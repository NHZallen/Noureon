// A shared project as its member sees it (docs/superpowers/specs/2026-11-06-project-sharing-design.md, §13): the page of the project with the conversations of everyone in it, each with the name
// of whoever made it (plain words, no picture), and the list "Shared with you" of the projects the person has joined.

import { make, openSheet, projectMark } from './project-parts.js';

const dateText = (value, language) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(language, { month: 'short', day: 'numeric' }); };

/**
 * The page of one project. `shared` is what the server read ({ role, project, owner, conversations }); `meId` is the signed-in person (their own conversations open in the chat: `onOpenOwn(chat)`,
 * the others' are read: `onOpenChat(chat)`); `onNewChat()` makes a conversation of the person in this project.
 */
export function openSharedProjectPage({ document, root, text, language = 'zh-TW', shared, meId, onOpenChat, onOpenOwn = onOpenChat, onNewChat, onLeave = null, onEditInstructions = null, onClose = () => {} }) {
  const project = shared.project || {};
  const sheet = openSheet({ document, root, title: project.name || '', close: text('psCancel'), className: 'psh-project', onClose });
  const info = make(document, 'p', 'pj-note', text('psSharedBy', { name: shared.owner?.name || '' }));
  const go = make(document, 'button', 'pj-button pj-primary psh-go', text('psNewChat'));
  go.type = 'button';
  go.setAttribute('data-new-chat', '');
  go.addEventListener('click', () => { sheet.close(); onNewChat(); });
  const list = make(document, 'div', 'psh-chats');
  const draw = (conversations) => {
    list.replaceChildren();
    if (!conversations?.length) list.appendChild(make(document, 'p', 'pj-note', text('psNoChats')));
    for (const chat of conversations || []) {
      const mine = chat.authorId === meId;
      const row = make(document, 'button', 'pj-row psh-chat');
      row.type = 'button';
      row.dataset.chatId = chat.id;
      const label = make(document, 'span', 'pj-row-text');
      label.append(make(document, 'span', 'pj-row-title', chat.title || ''), make(document, 'span', 'pj-row-meta', `${mine ? text('psMine') : chat.authorName || ''} · ${dateText(chat.updatedAt, language)}`));
      row.appendChild(label);
      row.addEventListener('click', () => { if (mine) onOpenOwn(chat); else onOpenChat(chat); });
      list.appendChild(row);
    }
  };
  draw(shared.conversations);
  sheet.body.append(info, go, list);
  if (shared.role === 'editor' && onEditInstructions) {
    const edit = make(document, 'button', 'pj-chip psh-edit', text('psEditInstructions'));
    edit.type = 'button';
    edit.setAttribute('data-edit-instructions', '');
    edit.addEventListener('click', () => onEditInstructions());
    sheet.body.insertBefore(edit, go);
  }
  if (onLeave) {
    const leave = make(document, 'button', 'pj-text-button psh-leave', text('psLeave'));
    leave.type = 'button';
    leave.setAttribute('data-leave-open', '');
    leave.addEventListener('click', () => {
      const mineCount = (shared.conversations || []).filter((chat) => chat.authorId === meId).length;
      const choice = { own: mineCount > 0, name: `${project.name || ''}`, memory: 'default' };
      openSheet({
        document, root, title: text('psLeaveTitle', { name: project.name || '' }), dialog: true, close: text('psCancel'),
        body: (content, { close }) => {
          content.appendChild(make(document, 'p', 'pj-note', text('psLeaveBody')));
          if (mineCount > 0) {
            const own = make(document, 'button', 'psh-choice');
            own.type = 'button';
            own.setAttribute('data-leave-own', '');
            own.setAttribute('aria-pressed', 'true');
            own.append(make(document, 'span', 'psh-choice-label', text('psLeaveOwn')), make(document, 'span', 'pj-note', text('psLeaveOwnHint', { count: mineCount })));
            const fields = make(document, 'div', 'psh-own-fields');
            const name = make(document, 'input', 'psh-input');
            name.type = 'text';
            name.id = 'psh-own-name';
            name.value = text('psLeaveOwnDefaultName', { name: project.name || '' });
            choice.name = name.value;
            name.addEventListener('input', () => { choice.name = name.value; });
            const memory = make(document, 'select', 'psh-input');
            memory.id = 'psh-own-memory';
            for (const [value, key] of [['default', 'psMemDefault'], ['project', 'psMemProject']]) { const option = make(document, 'option', '', text(key)); option.value = value; memory.appendChild(option); }
            memory.addEventListener('change', () => { choice.memory = memory.value; });
            fields.append(name, memory);
            own.addEventListener('click', () => { choice.own = !choice.own; own.setAttribute('aria-pressed', String(choice.own)); fields.hidden = !choice.own; });
            content.append(own, fields);
          }
          const buttons = make(document, 'div', 'psh-buttons');
          const cancel = make(document, 'button', 'pj-text-button', text('psCancel'));
          cancel.type = 'button';
          cancel.addEventListener('click', close);
          const confirm = make(document, 'button', 'pj-button pj-primary psh-go', text('psLeaveGo'));
          confirm.type = 'button';
          confirm.setAttribute('data-leave-go', '');
          confirm.addEventListener('click', () => { close(); sheet.close(); onLeave({ ...choice }); });
          buttons.append(cancel, confirm);
          content.appendChild(buttons);
        }
      });
    });
    sheet.body.appendChild(leave);
  }
  // The list is drawn again when the project changed under the page (the page of the project keeps reading it).
  return { ...sheet, update: (next) => draw(next.conversations) };
}

/** Fills `box` with the projects of the person that were shared with them ([{ project_id, owner_id, name, icon, color, owner_name, role }]); `onOpen(item)` opens one. */
export function drawSharedProjects({ document, box, text, items, onOpen }) {
  box.replaceChildren();
  for (const item of items) {
    const row = make(document, 'button', 'pj-row psh-shared-row');
    row.type = 'button';
    row.dataset.projectId = item.project_id;
    row.appendChild(projectMark(document, { icon: item.icon || 'default', color: item.color || 'gray' }));
    const label = make(document, 'span', 'pj-row-text');
    label.append(make(document, 'span', 'pj-row-title', item.name || ''), make(document, 'span', 'pj-row-meta', `${item.owner_name || ''} · ${text(item.role === 'editor' ? 'psRoleEditor' : 'psRoleChat')}`));
    row.appendChild(label);
    row.addEventListener('click', () => onOpen(item));
    box.appendChild(row);
  }
}

/** The page where an editor writes the instructions of the project: `onSave(value)` resolves true when it was saved (the page then closes). */
export function openInstructionsEditor({ document, root, text, value = '', onSave }) {
  const sheet = openSheet({ document, root, title: text('psInstructionsTitle'), close: text('psCancel'), className: 'psh-instructions' });
  const area = make(document, 'textarea', 'psh-text');
  area.id = 'psh-instructions';
  area.maxLength = 8000;
  area.value = value;
  const save = make(document, 'button', 'pj-button pj-primary psh-go', text('psInstructionsSave'));
  save.type = 'button';
  save.setAttribute('data-instructions-save', '');
  save.addEventListener('click', async () => {
    save.disabled = true;
    const saved = await onSave(area.value);
    save.disabled = false;
    if (saved) sheet.close();
  });
  sheet.body.append(area, save);
  return sheet;
}
