// What a person sees when they open an invitation to a project (docs/superpowers/specs/2026-11-06-project-sharing-design.md, §8): the project, who invited them, the role and what the role can do.
// Resolves 'joined' | 'cancelled'. `client` is the one of runtime/project-sharing.

import { make, openSheet } from './project-parts.js';
import { personMark } from './project-members-panel.js';

const CHECK = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>';
const CROSS = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>';

/** The line to tell for a word the database raises when the invitation is not good. */
export const joinFailureKey = (code) => ({ invite_removed: 'psJoinRemoved', invite_full: 'psJoinFull', invite_owner: 'psJoinOwner', no_cloud: 'psJoinNeedCloud' }[code] || 'psJoinInvalid');

export function openJoinDialog({ document, root, text, client, code, invite, notify = () => {}, onJoined = () => {} }) {
  return new Promise((resolve) => {
    let result = 'cancelled';
    const title = invite.inviter_name ? text('psJoinTitle', { name: invite.inviter_name }) : text('psJoinTitleNoName');
    const roleName = text(invite.role === 'editor' ? 'psRoleEditor' : 'psRoleChat');
    openSheet({
      document, root, title, dialog: true, close: text('psCancel'), onClose: () => resolve(result),
      body: (content, { close }) => {
        const who = make(document, 'div', 'psh-join-who');
        who.append(personMark(document, { name: invite.inviter_name || invite.project_name }), make(document, 'div', 'psh-join-project', invite.project_name || ''));
        const role = make(document, 'span', 'psh-chip', roleName);
        const can = make(document, 'ul', 'psh-lines');
        const lines = [[true, 'psCanSee'], [true, 'psCanUse'], [true, 'psCanBranch'], [invite.role === 'editor', invite.role === 'editor' ? 'psCanEdit' : 'psCannotEdit']];
        for (const [yes, key] of lines) {
          const item = make(document, 'li', `psh-line ${yes ? 'is-yes' : 'is-no'}`);
          const mark = make(document, 'span', 'psh-line-icon');
          mark.innerHTML = yes ? CHECK : CROSS;
          item.append(mark, make(document, 'span', '', text(key)));
          can.appendChild(item);
        }
        const buttons = make(document, 'div', 'psh-buttons');
        const cancel = make(document, 'button', 'pj-text-button', text('psCancel'));
        cancel.type = 'button';
        cancel.addEventListener('click', close);
        const go = make(document, 'button', 'pj-button pj-primary psh-go', text('psJoinGo'));
        go.type = 'button';
        go.setAttribute('data-join-go', '');
        go.addEventListener('click', async () => {
          go.disabled = true;
          const accepted = await client.accept(code);
          if (!accepted.ok) { go.disabled = false; notify(text(joinFailureKey(accepted.code), { name: invite.project_name || '' }), 'error'); if (accepted.code !== 'failed') close(); return; }
          result = 'joined';
          notify(text('psJoined', { name: accepted.data?.name || invite.project_name || '' }), 'success');
          onJoined(accepted.data);
          close();
        });
        buttons.append(cancel, go);
        content.append(who, role, can, buttons);
      }
    });
  });
}
