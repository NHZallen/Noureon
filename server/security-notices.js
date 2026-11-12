// The mail the service sends when something that protects an account or the API keys changed (docs/superpowers/specs/2026-11-12-vault-recovery-design.md, §16.5): a passkey or an
// authenticator app was added or removed, the sync password was changed, cleared or started over. Someone who gets into an account sees nothing change on the screen of the owner,
// and this mail is what tells the owner. It goes to the address of the account only (the one the sign-in service gives for the token), never to an address a request names,
// is in English like the other mails, and holds no more than what happened, when, and from where: the device and browser, the address it came from and, when the host's
// proxy says it, the city and country that address belongs to. None of it is kept: it is in the mail and nowhere else. At most 10 an hour for each account.

import { createRateLimiter } from './rate-limit.js';
import { renderMail } from './mail-layout.js';

export const SECURITY_NOTICE_LIMIT = 10;
const HOUR = 60 * 60 * 1000;

export const SECURITY_EVENTS = Object.freeze({
  'passkey-added': { subject: 'A passkey was added', title: 'A passkey was added', what: 'A passkey was added to recover and unlock your sync password.' },
  'passkey-removed': { subject: 'A passkey was removed', title: 'A passkey was removed', what: 'A passkey was removed from the recovery of your sync password.' },
  'authenticator-added': { subject: 'An authenticator app was turned on', title: 'An authenticator app was turned on', what: 'An authenticator app was turned on for your account.' },
  'authenticator-removed': { subject: 'An authenticator app was removed', title: 'An authenticator app was removed', what: 'The authenticator app was removed from your account.' },
  'login-password-changed': { subject: 'Your login password was changed', title: 'Your login password was changed', what: 'The password you sign in with was changed.' },
  'signed-out-others': { subject: 'You were signed out of your other devices', title: 'Signed out of other devices', what: 'Every other device was signed out of your account.' },
  'sync-password-changed': { subject: 'Your sync password was changed', title: 'Your sync password was changed', what: 'The sync password that protects your API keys was changed.' },
  'sync-password-reset': { subject: 'Your sync password was reset', title: 'Your sync password was reset', what: 'A forgotten sync password was replaced with a new one.' },
  'sync-password-cleared': { subject: 'Your sync password was cleared', title: 'Your sync password was cleared', what: 'The sync password was cleared. The API keys that were saved in the cloud can no longer be read.' },
  'sync-started-over': { subject: 'Your sync vault was started over', title: 'Your sync vault was started over', what: 'The sync vault was started over. The API keys that were saved in the cloud can no longer be read.' }
});

export class SecurityNoticeError extends Error {
  /** `code`: 'invalid_event', 'rate_limited', 'unavailable' (no mail set up), 'mail' (could not be sent). */
  constructor(message, code) {
    super(message);
    this.name = 'SecurityNoticeError';
    this.code = code;
  }
}

const two = (number) => String(number).padStart(2, '0');
const stamp = (time) => {
  const date = new Date(time);
  return `${date.getUTCFullYear()}-${two(date.getUTCMonth() + 1)}-${two(date.getUTCDate())} ${two(date.getUTCHours())}:${two(date.getUTCMinutes())} UTC`;
};

// Every control character (a line break included) becomes a space, so a value can never start another line of the mail.
const oneLine = (value, max) => [...String(value ?? '')].map((char) => (char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 ? ' ' : char)).join('').replace(/\s+/g, ' ').trim().slice(0, max);
const looksLikeAddress = (value) => /^[0-9a-f:.]{3,45}$/i.test(String(value || ''));

/** What the mail says about where the change came from: { device, ip, location } from the request, each left out when unknown. */
export function originLines({ device = '', ip = '', location = '' } = {}) {
  const lines = [];
  if (oneLine(device, 80)) lines.push(`Device: ${oneLine(device, 80)}`);
  if (oneLine(location, 80)) lines.push(`Location: ${oneLine(location, 80)} (approximate, from the IP address)`);
  if (looksLikeAddress(ip)) lines.push(`IP address: ${ip}`);
  return lines;
}

/** The subject, the text and the HTML of the mail for one event. */
export function securityNoticeMailFor({ event, time, appUrl = 'https://noureon.com', origin = {} }) {
  const entry = SECURITY_EVENTS[event];
  if (!entry) throw new SecurityNoticeError('Unknown event.', 'invalid_event');
  const when = `When: ${stamp(time)}`;
  const where = originLines(origin);
  const fine = 'If this was you, there is nothing more to do.';
  const notYou = 'If it was not you, sign in, open Settings, then Security and sign-in, and change your login password. Use "Sign out of other devices" if you see it.';
  const url = String(appUrl).replace(/\/+$/, '');
  return {
    subject: `[Noureon] ${entry.subject}`,
    text: [entry.what, [when, ...where].join('\n'), fine, notYou, url].join('\n\n'),
    html: renderMail({
      preheader: entry.what,
      title: entry.title,
      blocks: [
        { kind: 'p', parts: [entry.what] },
        ...[when, ...where].map((line) => ({ kind: 'small', parts: [line] })),
        { kind: 'small', parts: [fine] },
        { kind: 'button', label: 'Open Noureon', href: url },
        { kind: 'rule' },
        { kind: 'muted', parts: [notYou] }
      ]
    })
  };
}

export function createSecurityNotices({ mailer, appUrl, limit = SECURITY_NOTICE_LIMIT, now = Date.now, log = () => {} } = {}) {
  const limiter = createRateLimiter({ limit, windowMs: HOUR, now });

  /** `email`: the address of the account (from the sign-in service). Resolves { sent } (false when the account has no address that can be used). */
  async function send({ userId, email, event, origin = {} }) {
    if (!SECURITY_EVENTS[event]) throw new SecurityNoticeError('Unknown event.', 'invalid_event');
    if (!mailer?.configured) throw new SecurityNoticeError('Mail is not set up on the server.', 'unavailable');
    if (!email) return { sent: false };
    if (!limiter.take(userId)) throw new SecurityNoticeError('Too many notices this hour.', 'rate_limited');
    try {
      await mailer.send({ to: email, ...securityNoticeMailFor({ event, time: now(), appUrl, origin }) });
    } catch (error) {
      limiter.release(userId);
      log('security_notice_mail_failed', { name: error?.name || 'Error' });
      throw new SecurityNoticeError('The mail could not be sent.', 'mail');
    }
    return { sent: true };
  }

  return { send, limit };
}
