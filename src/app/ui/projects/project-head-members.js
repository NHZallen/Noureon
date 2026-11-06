// The button in the head of a shared project: a few pictures of its people and their number; it opens the list of the members. A project that is not shared shows nothing (it is shared from the menu).

import { personMark } from './project-members-panel.js';

const make = (document, tag, className = '', content = '') => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== '') node.textContent = content;
  return node;
};

/** Draws the button into `slot` once the members are known. `members` is the answer of list_project_members (the owner first). Returns the button, or null when the project has no members besides its owner. */
export function drawMemberButton({ document, slot, text, members, avatarOf = () => '', onOpen = () => {} }) {
  slot.replaceChildren();
  if (!Array.isArray(members) || members.length < 2) return null;
  const button = make(document, 'button', 'psh-stack');
  button.type = 'button';
  button.setAttribute('aria-label', text('psMembersButton', { count: members.length }));
  button.title = text('psMembersButton', { count: members.length });
  for (const member of members.slice(0, 3)) button.appendChild(personMark(document, { name: member.name, avatarUrl: avatarOf(member.user_id, member.avatar_version), photoUrl: member.photo_url }));
  button.appendChild(make(document, 'span', 'psh-stack-count', String(members.length)));
  button.addEventListener('click', onOpen);
  slot.appendChild(button);
  return button;
}
