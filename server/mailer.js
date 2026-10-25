// Sends a mail through Resend (https://resend.com/docs/api-reference/emails/send-email): what the server has to tell us by mail (a request for a waitlist). Plain text only, to one address
// that the settings name, never to an address a person gave. The key is only ever in the Authorization header, to Resend's own address.

const ENDPOINT = 'https://api.resend.com/emails';
const TIMEOUT_MS = 10_000;

export class MailError extends Error {
  /** `code`: 'not_configured' (no key), 'unreachable', 'refused' (Resend did not take the mail; `status` is what it answered). */
  constructor(code, message, status = 0) {
    super(message);
    this.name = 'MailError';
    this.code = code;
    this.status = status;
  }
}

/** `apiKey` empty: `send` says `not_configured`. `from`: "Name <address>" of a domain verified at Resend. */
export function createMailer({ apiKey = '', from, fetchImpl = fetch }) {
  return {
    configured: Boolean(apiKey),
    /** `to`: one address; `replyTo`: the address an answer goes to (the person who asked). The subject and the text are one line and plain text. */
    async send({ to, subject, text, replyTo = '' }) {
      if (!apiKey) throw new MailError('not_configured', 'Mail is not set up.');
      if (/[\r\n]/.test(String(subject)) || /[\r\n]/.test(String(replyTo))) throw new MailError('refused', 'A header may not have a line break.');
      let response;
      try {
        response = await fetchImpl(ENDPOINT, {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(TIMEOUT_MS),
          headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
          body: JSON.stringify({ from, to: [to], subject, text, ...(replyTo ? { reply_to: replyTo } : {}) })
        });
      } catch {
        throw new MailError('unreachable', 'The mail service could not be reached.');
      }
      await response.body?.cancel?.().catch(() => {});
      if (!response.ok) throw new MailError('refused', 'The mail service did not take the mail.', response.status);
    }
  };
}
