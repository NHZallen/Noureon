// The page of the members and the invitations of a project (docs/superpowers/specs/2026-11-06-project-sharing-design.md, §8 and §13), and the question asked before a project is shared the first
// time. Made the way the other pages of the projects are (openSheet): a page over the page, a small dialog for a question. `client` is the one of runtime/project-sharing.

import { make, openMenu, openSheet } from './project-parts.js';
import { joinUrl } from '../../runtime/project-sharing/join-route.js';

const ROLE_KEYS = { owner: 'psRoleOwner', editor: 'psRoleEditor', chat: 'psRoleChat' };
const ICONS = {
  more: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>',
  copy: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
  users: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  lock: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  check: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>',
  globe: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>',
  trash: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>'
};

const initialOf = (name) => (Array.from(String(name || '').trim())[0] || '?').toUpperCase();

/** The little round mark of a person: their picture when there is one, else the first letter of the name. */
export function personMark(document, { name = '', avatarUrl = '' } = {}) {
  const mark = make(document, 'span', 'psh-avatar');
  mark.textContent = initialOf(name);
  // The picture may still be on its way (a promise): the letter shows until it comes.
  const show = (url) => {
    if (!url || typeof url !== 'string') return;
    const image = make(document, 'img', 'psh-avatar-img');
    image.alt = '';
    image.src = url;
    mark.replaceChildren(image);
  };
  if (avatarUrl && typeof avatarUrl.then === 'function') avatarUrl.then(show, () => {}); else show(avatarUrl);
  return mark;
}

const errorText = (text, code) => text(code === 'no_cloud' ? 'psNeedCloud' : code === 'not_allowed' ? 'psNotAllowed' : 'psFailed');

/** What the owner is told before the project is shared; `preview` is { conversations, linked }. Resolves true when the owner chooses to share. */
export function openShareConfirm({ document, root, text, preview }) {
  return new Promise((resolve) => {
    let answered = false;
    const answer = (value) => { if (!answered) { answered = true; resolve(value); } };
    const lines = [
      ['users', text('psConfirmConversations', { count: Number(preview?.conversations) || 0 })],
      ['lock', text('psConfirmMemory')],
      ['check', text('psConfirmTraces')]
    ];
    if (Number(preview?.linked) > 0) lines.push(['globe', text('psConfirmLinks', { count: Number(preview.linked) })]);
    const sheet = openSheet({
      document, root, title: text('psConfirmTitle'), dialog: true, close: text('psCancel'), onClose: () => answer(false),
      body: (content, { close }) => {
        const list = make(document, 'ul', 'psh-lines');
        for (const [icon, line] of lines) {
          const item = make(document, 'li', 'psh-line');
          const mark = make(document, 'span', 'psh-line-icon');
          mark.innerHTML = ICONS[icon];
          item.append(mark, make(document, 'span', '', line));
          list.appendChild(item);
        }
        const buttons = make(document, 'div', 'psh-buttons');
        const cancel = make(document, 'button', 'pj-text-button', text('psCancel'));
        cancel.type = 'button';
        cancel.addEventListener('click', close);
        const go = make(document, 'button', 'pj-primary psh-go', text('psConfirmStart'));
        go.type = 'button';
        go.setAttribute('data-share-start', '');
        go.addEventListener('click', () => { answer(true); close(); });
        buttons.append(cancel, go);
        content.append(list, buttons);
      }
    });
    return sheet;
  });
}

/**
 * Opens the page. `project` is { id, name }; `me` the id of the signed-in person; `ownerName` and `inviterName` are the name shown on a link. `onShared(projectId)` is told when the project has
 * just been shared (the page makes the memory of its own copy of the folder `project`). `avatarUrl(userId, version)` may give the picture of a person.
 */
export async function openMembersPanel({ document, root, text, client, project, inviterName = '', origin = '', copy = async () => false, notify = () => {}, onShared = () => {}, onNotes = () => {}, avatarUrl = () => '', confirm = null }) {
  let role = 'chat';
  let data = null;
  let links = [];
  let notes = [];
  let pending = [];
  let mailLeft = null;
  let busy = false;
  const sheet = openSheet({ document, root, title: text('psTitle'), action: { label: text('psDone'), onClick: () => {} }, body: () => {}, className: 'psh-sheet' });
  const body = sheet.body;
  const fail = (code) => notify(errorText(text, code), 'error');

  async function load() {
    const members = await client.members(project.id);
    if (!members.ok) { fail(members.code); sheet.close(); return false; }
    data = members.data;
    links = [];
    notes = [];
    pending = [];
    if (data.shared_at) {
      const noteList = await client.notes(project.id);
      if (noteList.ok) { notes = noteList.data || []; onNotes(notes); }
    }
    if (data.shared_at && data.role !== 'chat') {
      const result = await client.links(project.id);
      if (result.ok) links = result.data || [];
      const invites = await client.invites(project.id);
      if (invites.ok) pending = invites.data || [];
      const quota = await client.inviteQuota?.();
      if (quota?.ok) mailLeft = { remaining: Number(quota.data?.remaining) || 0, limit: Number(quota.data?.limit) || 20 };
    }
    return true;
  }

  const linkOf = (wanted) => links.find((entry) => entry.role === wanted) || null;

  async function share() {
    const preview = await client.preview(project.id);
    if (!preview.ok) { fail(preview.code); return; }
    const confirmed = await openShareConfirm({ document, root, text, preview: preview.data });
    if (!confirmed) return;
    const result = await client.share(project.id);
    if (!result.ok) { fail(result.code); return; }
    onShared(project.id, result.data);
    if (await load()) draw();
  }

  async function act(run, after = null) {
    if (busy) return;
    busy = true;
    try {
      const result = await run();
      if (!result.ok) { fail(result.code); return; }
      if (after) notify(after, 'success');
      if (await load()) draw();
    } finally { busy = false; }
  }

  const drawIntro = () => {
    body.append(make(document, 'p', 'psh-title', text('psIntroTitle')), make(document, 'p', 'pj-note', text('psIntro')));
    const go = make(document, 'button', 'pj-primary psh-go', text('psConfirmStart'));
    go.type = 'button';
    go.setAttribute('data-share-open', '');
    go.addEventListener('click', () => { void share(); });
    body.appendChild(go);
  };

  const drawLinks = () => {
    body.appendChild(make(document, 'div', 'pj-section-title', text('psLinkSection')));
    const card = make(document, 'div', 'psh-card');
    const seg = make(document, 'div', 'psh-seg');
    seg.setAttribute('role', 'tablist');
    for (const key of ['chat', 'editor']) {
      const button = make(document, 'button', 'psh-seg-item', text(ROLE_KEYS[key]));
      button.type = 'button';
      button.setAttribute('role', 'tab');
      button.dataset.role = key;
      button.setAttribute('aria-selected', String(role === key));
      button.addEventListener('click', () => { role = key; body.replaceChildren(); draw(); });
      seg.appendChild(button);
    }
    card.appendChild(seg);
    const current = linkOf(role);
    if (current) {
      const address = joinUrl(origin || document.defaultView?.location?.origin || '', current.code);
      const field = make(document, 'div', 'psh-link');
      const value = make(document, 'span', 'psh-link-text', address);
      value.setAttribute('data-link', address);
      const copyButton = make(document, 'button', 'pj-round', '');
      copyButton.type = 'button';
      copyButton.setAttribute('aria-label', text('psCopy'));
      copyButton.innerHTML = ICONS.copy;
      copyButton.addEventListener('click', async () => { const copied = await copy(address); notify(text(copied ? 'psCopied' : 'psCopyFailed'), copied ? 'success' : 'error'); });
      field.append(value, copyButton);
      card.appendChild(field);
      const row = make(document, 'div', 'psh-link-actions');
      if (data.role === 'owner') {
        const refresh = make(document, 'button', 'pj-chip', text('psRefresh'));
        refresh.type = 'button';
        refresh.setAttribute('data-link-refresh', '');
        refresh.addEventListener('click', () => { void act(() => client.refreshLink(project.id, role, inviterName), text('psRefreshed')); });
        row.appendChild(refresh);
      }
      const close = make(document, 'button', 'pj-chip', text('psCloseLink'));
      close.type = 'button';
      close.setAttribute('data-link-close', '');
      close.addEventListener('click', () => { void act(() => client.closeLink(project.id, role), text('psLinkClosed')); });
      row.appendChild(close);
      card.appendChild(row);
    } else {
      const make1 = make(document, 'button', 'pj-primary psh-go', text('psMakeLink'));
      make1.type = 'button';
      make1.setAttribute('data-link-make', '');
      make1.addEventListener('click', () => { void act(() => client.makeLink(project.id, role, inviterName)); });
      card.appendChild(make1);
    }
    card.appendChild(make(document, 'p', 'pj-note', text('psLinkHint')));
    body.appendChild(card);
  };

  const drawEmail = () => {
    body.appendChild(make(document, 'div', 'pj-section-title', text('psEmailSection')));
    const card = make(document, 'div', 'psh-card');
    const input = make(document, 'input', 'psh-input');
    input.type = 'email';
    input.id = 'psh-email';
    input.placeholder = text('psEmailPlaceholder');
    input.setAttribute('autocomplete', 'off');
    const row = make(document, 'div', 'psh-link-actions');
    const send = make(document, 'button', 'pj-primary psh-go', text('psEmailSend'));
    send.type = 'button';
    send.setAttribute('data-email-send', '');
    send.addEventListener('click', async () => {
      if (busy || !input.value.trim()) return;
      busy = true;
      send.disabled = true;
      try {
        const result = await client.inviteByMail(project.id, { email: input.value.trim(), role, inviterName });
        if (!result.ok) { notify(text(result.code === 'invalid_email' ? 'psEmailInvalid' : result.code === 'rate_limited' ? 'psEmailLimit' : result.code === 'mail' || result.code === 'failed' ? 'psEmailFailed' : result.code === 'not_allowed' ? 'psNotAllowed' : 'psFailed'), 'error'); if (result.code === 'rate_limited') mailLeft = { ...(mailLeft || { limit: 20 }), remaining: 0 }; } else { notify(text('psEmailSent'), 'success'); mailLeft = { remaining: Number(result.data.remaining) || 0, limit: Number(result.data.limit) || 20 }; input.value = ''; }
      } finally { busy = false; }
      if (await load()) draw();
    });
    row.append(send);
    card.append(input);
    if (mailLeft) card.appendChild(make(document, 'p', 'pj-note psh-quota', text('psEmailQuota', { remaining: mailLeft.remaining, limit: mailLeft.limit })));
    card.append(row);
    for (const invite of pending) {
      const line = make(document, 'div', 'psh-member');
      line.dataset.inviteId = invite.id;
      const mark = make(document, 'span', 'psh-avatar', '@');
      const label = make(document, 'div', 'psh-member-text');
      label.append(make(document, 'div', 'psh-member-name', invite.email), make(document, 'div', 'pj-note', `${text('psPending')} · ${text(ROLE_KEYS[invite.role] || 'psRoleChat')}`));
      const cancel = make(document, 'button', 'pj-chip', text('psRevokeInvite'));
      cancel.type = 'button';
      cancel.addEventListener('click', () => { void act(() => client.revokeInvite(project.id, invite.id)); });
      line.append(mark, label, cancel);
      card.appendChild(line);
    }
    body.appendChild(card);
  };

  const drawNotes = () => {
    body.appendChild(make(document, 'div', 'pj-section-title', text('psNotesSection')));
    const card = make(document, 'div', 'psh-card');
    card.appendChild(make(document, 'p', 'pj-note', text('psNotesHint')));
    if (!notes.length) card.appendChild(make(document, 'p', 'pj-note', text('psNotesNone')));
    for (const note of notes) {
      const line = make(document, 'div', 'psh-note');
      line.dataset.noteId = note.id;
      line.appendChild(make(document, 'span', 'psh-note-text', note.text));
      if (data.role !== 'chat') {
        const del = make(document, 'button', 'pj-round');
        del.type = 'button';
        del.setAttribute('aria-label', text('psNoteDelete'));
        del.innerHTML = ICONS.trash;
        del.addEventListener('click', () => { void act(() => client.deleteNote(project.id, note.id)); });
        line.appendChild(del);
      }
      card.appendChild(line);
    }
    if (data.role !== 'chat') {
      const input = make(document, 'input', 'psh-input');
      input.type = 'text';
      input.id = 'psh-note';
      input.maxLength = 500;
      input.placeholder = text('psNotePlaceholder');
      const add = make(document, 'button', 'pj-chip', text('psNoteAdd'));
      add.type = 'button';
      add.setAttribute('data-note-add', '');
      const submit = async () => {
        if (!input.value.trim() || busy) return;
        busy = true;
        try {
          const result = await client.addNote(project.id, input.value.trim());
          if (!result.ok) { notify(text(result.code === 'notes_full' ? 'psNotesFull' : errorKey(result.code)), 'error'); return; }
        } finally { busy = false; }
        if (await load()) draw();
      };
      add.addEventListener('click', () => { void submit(); });
      input.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); void submit(); } });
      const row = make(document, 'div', 'psh-note-add');
      row.append(input, add);
      card.appendChild(row);
    }
    body.appendChild(card);
  };
  const errorKey = (code) => (code === 'no_cloud' ? 'psNeedCloud' : code === 'not_allowed' ? 'psNotAllowed' : 'psFailed');

  const memberMenu = (member, anchor) => {
    const items = [];
    if (member.role !== 'editor') items.push({ label: text('psMakeEditor'), icon: 'users', action: () => act(() => client.setRole(project.id, member.user_id, 'editor')) });
    if (member.role !== 'chat') items.push({ label: text('psMakeChat'), icon: 'users', action: () => act(() => client.setRole(project.id, member.user_id, 'chat')) });
    items.push({ label: text('psRemove'), icon: 'trash', danger: true, action: () => removeMember(member) });
    openMenu({ document, root, anchor, items });
  };

  async function removeMember(member) {
    let deleteThem = false;
    const dialog = openSheet({
      document, root, title: text('psRemoveTitle', { name: member.name }), dialog: true, close: text('psCancel'),
      body: (content, { close }) => {
        content.appendChild(make(document, 'p', 'pj-note', text('psRemoveBody')));
        const choices = [[false, 'psRemoveKeep', 'psRemoveKeepHint'], [true, 'psRemoveDelete', 'psRemoveDeleteHint']];
        const boxes = [];
        for (const [value, label, hint] of choices) {
          const option = make(document, 'button', 'psh-choice');
          option.type = 'button';
          option.dataset.delete = String(value);
          option.setAttribute('aria-pressed', String(value === deleteThem));
          option.append(make(document, 'span', 'psh-choice-label', text(label)), make(document, 'span', 'pj-note', text(hint)));
          option.addEventListener('click', () => { deleteThem = value; boxes.forEach((box) => box.setAttribute('aria-pressed', String(box.dataset.delete === String(deleteThem)))); });
          boxes.push(option);
          content.appendChild(option);
        }
        const buttons = make(document, 'div', 'psh-buttons');
        const cancel = make(document, 'button', 'pj-text-button', text('psCancel'));
        cancel.type = 'button';
        cancel.addEventListener('click', close);
        const go = make(document, 'button', 'pj-primary psh-go', text('psRemoveGo'));
        go.type = 'button';
        go.setAttribute('data-remove-go', '');
        go.addEventListener('click', () => { close(); void act(() => client.remove(project.id, member.user_id, deleteThem)); });
        buttons.append(cancel, go);
        content.appendChild(buttons);
      }
    });
    return dialog;
  }

  const drawMembers = () => {
    const members = data.members || [];
    const head = make(document, 'div', 'pj-section-title psh-members-head');
    head.append(make(document, 'span', '', text('psMembers')), make(document, 'span', '', `${members.length - 1}／100`));
    body.appendChild(head);
    const list = make(document, 'div', 'psh-members');
    for (const member of members) {
      const row = make(document, 'div', 'psh-member');
      row.dataset.userId = member.user_id;
      row.appendChild(personMark(document, { name: member.name, avatarUrl: avatarUrl(member.user_id, member.avatar_version) }));
      const textBox = make(document, 'div', 'psh-member-text');
      textBox.append(make(document, 'div', 'psh-member-name', member.name), make(document, 'div', 'pj-note', text(ROLE_KEYS[member.role] || 'psRoleChat')));
      row.appendChild(textBox);
      if (data.role === 'owner' && member.role !== 'owner') {
        const more = make(document, 'button', 'pj-round');
        more.type = 'button';
        more.setAttribute('aria-label', text('psMembers'));
        more.innerHTML = ICONS.more;
        more.addEventListener('click', () => memberMenu(member, more));
        row.appendChild(more);
      }
      list.appendChild(row);
    }
    body.appendChild(list);
  };

  function draw() {
    body.replaceChildren();
    if (!data.shared_at) {
      if (data.role === 'owner') drawIntro();
      return;
    }
    if (data.role !== 'chat') { drawLinks(); drawEmail(); }
    drawMembers();
    drawNotes();
  }

  if (await load()) draw();
  return sheet;
}
