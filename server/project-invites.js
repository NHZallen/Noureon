// An invitation to a shared project by mail (docs/superpowers/specs/2026-11-06-project-sharing-design.md, §8). The database makes the invitation for one address (`server_create_project_email_invite`,
// which also checks that the person may invite); this server sends the mail from the address of the service, in English, and counts how many a person sends: 20 an hour. The mail holds the name of the
// person who invites, the name of the project and one button; nothing of what is in the project. The link of the button opens the invitation, which only the account with that address can accept.

import { createRateLimiter } from './rate-limit.js';
import { renderMail } from './mail-layout.js';

export const INVITE_MAIL_LIMIT = 20;
const HOUR = 60 * 60 * 1000;

export class InviteError extends Error {
  /** `code`: 'rate_limited' (with `remaining`), 'not_allowed', 'not_shared', 'invalid_email', 'invalid_role', 'invite_full', 'mail' (could not be sent), 'unavailable'. */
  constructor(message, code, extra = {}) {
    super(message);
    this.name = 'InviteError';
    this.code = code;
    this.extra = extra;
  }
}

const oneLine = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** The subject, the text and the HTML of the mail (English). */
export function inviteMailFor({ inviter, project, role, url }) {
  const who = oneLine(inviter, 80);
  const name = oneLine(project, 80) || 'a project';
  const roleText = role === 'editor' ? 'an editor' : 'a chat member';
  const first = who ? `${who} invited you to the project "${name}" on Noureon, as ${roleText}.` : `You are invited to the project "${name}" on Noureon, as ${roleText}.`;
  const second = 'Open the invitation and sign in with this mail address to join. The invitation only works for this address.';
  const third = 'If you were not expecting this, you can ignore it.';
  return {
    subject: who ? `[Noureon] ${who} invited you to a project` : '[Noureon] You are invited to a project',
    text: [first, second, url, third].join('\n\n'),
    html: renderMail({
      preheader: first,
      title: 'You are invited to a project',
      blocks: [
        { kind: 'p', parts: who ? [{ b: who }, ' invited you to the project ', { b: name }, ` on Noureon, as ${roleText}.`] : [first] },
        { kind: 'small', parts: [second] },
        { kind: 'button', label: 'Open the invitation', href: url },
        { kind: 'rule' },
        { kind: 'muted', parts: [third] }
      ]
    })
  };
}

export function createProjectInvites({ db, mailer, appUrl, limit = INVITE_MAIL_LIMIT, now = Date.now, log = () => {} } = {}) {
  const limiter = createRateLimiter({ limit, windowMs: HOUR, now });
  const link = (code) => `${String(appUrl || 'https://noureon.com').replace(/\/+$/, '')}/join/${code}`;

  /** How many mails the person may still send this hour. */
  const remaining = (userId) => limiter.remaining(userId);

  async function send({ userId, projectId, email, role, inviterName = '' }) {
    if (!mailer?.configured) throw new InviteError('Mail is not set up on the server.', 'unavailable');
    if (!limiter.take(userId)) throw new InviteError('Too many invitations this hour.', 'rate_limited', { remaining: 0, limit });
    let made;
    try {
      made = await db.rpc('server_create_project_email_invite', { p_user_id: userId, p_project_id: projectId, p_email: String(email || ''), p_role: String(role || ''), p_inviter_name: oneLine(inviterName, 80) });
    } catch (error) {
      limiter.release(userId);
      const known = ['not_allowed', 'not_shared', 'invalid_email', 'invalid_role', 'invite_full'].find((code) => String(error?.message || '').includes(code));
      throw new InviteError('The invitation could not be made.', known || 'unavailable');
    }
    try {
      await mailer.send({ to: made.email, ...inviteMailFor({ inviter: inviterName, project: made.project_name, role: made.role, url: link(made.code) }) });
    } catch (error) {
      limiter.release(userId);
      try { await db.rpc('server_revoke_project_invite', { p_user_id: userId, p_project_id: projectId, p_invite_id: made.id }); } catch { /* the invitation stays; the next one replaces it */ }
      log('project_invite_mail_failed', { name: error?.name || 'Error' });
      throw new InviteError('The mail could not be sent.', 'mail');
    }
    return { id: made.id, email: made.email, role: made.role, remaining: limiter.remaining(userId), limit };
  }

  return { send, remaining, limit };
}
