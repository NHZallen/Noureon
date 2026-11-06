// A shared project as its member sees it (docs/superpowers/specs/2026-11-06-project-sharing-design.md, §13): the page of the project with the conversations of everyone in it, each with the name
// of whoever made it (plain words, no picture), and the list "Shared with you" of the projects the person has joined.

import { make, openSheet, projectMark } from './project-parts.js';

const dateText = (value, language) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(language, { month: 'short', day: 'numeric' }); };

/**
 * The page of one project. `shared` is what the server read ({ role, project, owner, conversations }); `meId` is the signed-in person (their own conversations open in the chat: `onOpenOwn(chat)`,
 * the others' are read: `onOpenChat(chat)`); `onNewChat()` makes a conversation of the person in this project.
 */
export function openSharedProjectPage({ document, root, text, language = 'zh-TW', shared, meId, onOpenChat, onOpenOwn = onOpenChat, onNewChat, onLeave = null, onClose = () => {} }) {
  const project = shared.project || {};
  const sheet = openSheet({ document, root, title: project.name || '', close: text('psCancel'), className: 'psh-project', onClose });
  const info = make(document, 'p', 'pj-note', text('psSharedBy', { name: shared.owner?.name || '' }));
  const go = make(document, 'button', 'pj-primary psh-go', text('psNewChat'));
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
  if (onLeave) {
    const leave = make(document, 'button', 'pj-text-button psh-leave', text('psLeave'));
    leave.type = 'button';
    leave.setAttribute('data-leave-open', '');
    leave.addEventListener('click', () => {
      openSheet({
        document, root, title: text('psLeaveTitle', { name: project.name || '' }), dialog: true, close: text('psCancel'),
        body: (content, { close }) => {
          content.appendChild(make(document, 'p', 'pj-note', text('psLeaveBody')));
          const buttons = make(document, 'div', 'psh-buttons');
          const cancel = make(document, 'button', 'pj-text-button', text('psCancel'));
          cancel.type = 'button';
          cancel.addEventListener('click', close);
          const confirm = make(document, 'button', 'pj-primary psh-go', text('psLeaveGo'));
          confirm.type = 'button';
          confirm.setAttribute('data-leave-go', '');
          confirm.addEventListener('click', () => { close(); sheet.close(); onLeave(); });
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
