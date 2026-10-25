// Gmail (https://developers.google.com/gmail/api/reference/rest): searching and reading mail, drafts, sending, labels and the bin.

import { ToolFailure } from '../api.js';
import { fit, idArg, idPart, intArg, listArg, textArg } from '../inputs.js';

const BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';
const ADDRESS = /^[^\s<>,;"]+@[^\s<>,;"]+$/;
const MAX_BODY_CHARS = 20_000;

const decode = (data) => Buffer.from(String(data || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
const encode = (text) => Buffer.from(text, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const header = (message, name) => (message.payload?.headers || []).find((item) => item.name.toLowerCase() === name.toLowerCase())?.value || '';

const ENTITIES = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
const plainFromHtml = (html) => html
  .replace(/<(style|script)[\s\S]*?<\/\1>/gi, '')
  .replace(/<br\s*\/?>|<\/(?:p|div|tr|li|h\d)>/gi, '\n')
  .replace(/<[^>]+>/g, '')
  .replace(/&(?:nbsp|amp|lt|gt|quot|#39);/g, (entity) => ENTITIES[entity])
  .replace(/[ \t]+\n/g, '\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

// The text of a message: the plain part when there is one, else the page part as text; and the files it carries (their names, not their contents).
function readParts(part, found = { plain: '', html: '', files: [] }) {
  if (!part) return found;
  if (part.filename && part.body?.attachmentId) found.files.push({ name: part.filename, type: part.mimeType, size: part.body.size || 0 });
  else if (part.mimeType === 'text/plain' && part.body?.data && !found.plain) found.plain = decode(part.body.data);
  else if (part.mimeType === 'text/html' && part.body?.data && !found.html) found.html = decode(part.body.data);
  for (const child of part.parts || []) readParts(child, found);
  return found;
}

function summary(message) {
  return { id: message.id, thread_id: message.threadId, from: header(message, 'From'), to: header(message, 'To'), subject: header(message, 'Subject'), date: header(message, 'Date'), snippet: message.snippet || '', unread: (message.labelIds || []).includes('UNREAD') };
}

function full(message, limit = MAX_BODY_CHARS) {
  const { plain, html, files } = readParts(message.payload);
  const text = (plain || plainFromHtml(html)).trim();
  return { ...summary(message), ...(header(message, 'Cc') ? { cc: header(message, 'Cc') } : {}), labels: message.labelIds || [], text: text.length > limit ? `${text.slice(0, limit)}\n[cut]` : text, ...(files.length ? { files } : {}) };
}

// One header value on one line, with the words of other alphabets encoded (RFC 2047).
const headerValue = (value) => (/^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`);

function addresses(args, key) {
  const list = listArg(args, key, { limit: 50, max: 200 });
  for (const address of list) if (!ADDRESS.test(address)) throw new ToolFailure(`"${address}" is not an email address.`);
  return list;
}

// The mail to send or keep as a draft, as the raw message that Gmail takes; a reply keeps the conversation (its thread, its subject and the headers that join it).
async function compose(args, call) {
  let to = addresses(args, 'to');
  const cc = addresses(args, 'cc');
  const bcc = addresses(args, 'bcc');
  let subject = textArg(args, 'subject', { max: 500 });
  let threadId = '';
  const extra = [];
  const replyTo = idArg(args, 'reply_to_message_id', { required: false });
  if (replyTo) {
    const original = await call('GET', `${BASE}/messages/${idPart(replyTo)}`, { query: { format: 'metadata', metadataHeaders: ['Message-ID', 'References', 'Subject', 'From', 'Reply-To'] } });
    threadId = original.threadId;
    const id = header(original, 'Message-ID');
    if (id) {
      extra.push(`In-Reply-To: ${id}`, `References: ${[header(original, 'References'), id].filter(Boolean).join(' ')}`);
    }
    if (!subject) subject = /^re:/i.test(header(original, 'Subject')) ? header(original, 'Subject') : `Re: ${header(original, 'Subject')}`;
    if (!to.length) to = [(/<([^>]+)>/.exec(header(original, 'Reply-To') || header(original, 'From')) || [])[1] || header(original, 'Reply-To') || header(original, 'From')];
  }
  if (!to.length) throw new ToolFailure('"to" is needed (or reply_to_message_id).');
  if (/[\r\n]/.test(subject)) throw new ToolFailure('"subject" must be one line.');
  const lines = [
    `To: ${to.join(', ')}`,
    ...(cc.length ? [`Cc: ${cc.join(', ')}`] : []),
    ...(bcc.length ? [`Bcc: ${bcc.join(', ')}`] : []),
    `Subject: ${headerValue(subject)}`,
    ...extra,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(textArg(args, 'body', { required: true, max: 200_000 }), 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n')
  ];
  return { raw: encode(lines.join('\r\n')), ...(threadId ? { threadId } : {}) };
}

const composeFields = {
  to: { type: 'array', items: { type: 'string' }, description: 'Email addresses. Not needed for a reply (it goes to the sender).' },
  cc: { type: 'array', items: { type: 'string' } },
  bcc: { type: 'array', items: { type: 'string' } },
  subject: { type: 'string' },
  body: { type: 'string', description: 'The text of the mail.' },
  reply_to_message_id: { type: 'string', description: 'The id of the message this answers: the mail then joins its conversation.' }
};

export const gmailTools = [
  {
    name: 'gmail_search_messages',
    description: 'Search the user\'s mail with Gmail\'s search words (from:ana subject:invoice is:unread after:2026/03/01 has:attachment label:work). Gives the sender, subject, date and a snippet of each message, the newest first. Read one in full with gmail_get_message.',
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, max_results: { type: 'integer', description: '1 to 50, default 15.' } }, required: ['query'] },
    async run(args, call) {
      const found = await call('GET', `${BASE}/messages`, { query: { q: textArg(args, 'query', { required: true, max: 500 }), maxResults: intArg(args, 'max_results', { max: 50, fallback: 15 }) } });
      const messages = await Promise.all((found?.messages || []).map((item) => call('GET', `${BASE}/messages/${idPart(item.id)}`, { query: { format: 'metadata', metadataHeaders: ['From', 'To', 'Subject', 'Date'] } })));
      return messages.map(summary);
    }
  },
  {
    name: 'gmail_get_message',
    description: 'Read one message in full: who it is from and to, the subject, the text, the names of the files it carries.',
    inputSchema: { type: 'object', properties: { message_id: { type: 'string' } }, required: ['message_id'] },
    async run(args, call) {
      return fit(full(await call('GET', `${BASE}/messages/${idPart(idArg(args, 'message_id'))}`, { query: { format: 'full' } })), 40_000);
    }
  },
  {
    name: 'gmail_get_thread',
    description: 'Read a whole conversation: each message with its sender, date and text (the long ones cut).',
    inputSchema: { type: 'object', properties: { thread_id: { type: 'string' } }, required: ['thread_id'] },
    async run(args, call) {
      const data = await call('GET', `${BASE}/threads/${idPart(idArg(args, 'thread_id'))}`, { query: { format: 'full' } });
      return fit({ id: data.id, messages: (data.messages || []).slice(-30).map((message) => full(message, 4000)) }, 60_000);
    }
  },
  {
    name: 'gmail_list_labels',
    description: 'List the labels of the user\'s mail (name and id; the ids of the built-in ones are INBOX, UNREAD, STARRED, IMPORTANT, SENT, DRAFT, SPAM, TRASH).',
    inputSchema: { type: 'object', properties: {} },
    async run(args, call) {
      const data = await call('GET', `${BASE}/labels`);
      return (data?.labels || []).map((label) => ({ id: label.id, name: label.name, type: label.type }));
    }
  },
  {
    name: 'gmail_create_draft',
    description: 'Write a draft mail and keep it in the user\'s Drafts (it is not sent). Prefer this when the user has not clearly asked for the mail to be sent.',
    inputSchema: { type: 'object', properties: composeFields, required: ['body'] },
    async run(args, call) {
      const data = await call('POST', `${BASE}/drafts`, { json: { message: await compose(args, call) } });
      return { draft_id: data?.id || '', message_id: data?.message?.id || '', saved: true };
    }
  },
  {
    name: 'gmail_send_message',
    description: 'Send a mail now, from the user\'s own address. It cannot be taken back.',
    inputSchema: { type: 'object', properties: composeFields, required: ['body'] },
    async run(args, call) {
      const data = await call('POST', `${BASE}/messages/send`, { json: await compose(args, call) });
      return { sent: true, message_id: data?.id || '', thread_id: data?.threadId || '' };
    }
  },
  {
    name: 'gmail_modify_labels',
    description: 'Add or remove labels on a message (mark it read: remove UNREAD; archive it: remove INBOX; star it: add STARRED).',
    inputSchema: { type: 'object', properties: { message_id: { type: 'string' }, add_label_ids: { type: 'array', items: { type: 'string' } }, remove_label_ids: { type: 'array', items: { type: 'string' } } }, required: ['message_id'] },
    async run(args, call) {
      const add = listArg(args, 'add_label_ids', { limit: 20, max: 100 });
      const remove = listArg(args, 'remove_label_ids', { limit: 20, max: 100 });
      if (!add.length && !remove.length) throw new ToolFailure('Give labels to add or to remove.');
      const data = await call('POST', `${BASE}/messages/${idPart(idArg(args, 'message_id'))}/modify`, { json: { addLabelIds: add, removeLabelIds: remove } });
      return { id: data?.id || '', labels: data?.labelIds || [] };
    }
  },
  {
    name: 'gmail_trash_message',
    description: 'Move a message to the bin (Gmail empties the bin after 30 days; until then the user can take it out).',
    inputSchema: { type: 'object', properties: { message_id: { type: 'string' } }, required: ['message_id'] },
    async run(args, call) {
      await call('POST', `${BASE}/messages/${idPart(idArg(args, 'message_id'))}/trash`);
      return { trashed: true };
    }
  }
];
