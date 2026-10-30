// Every write into the memory goes through here (docs/superpowers/specs/2026-10-30-memory-redesign-design.md, §4.4 and §4.5): the tool `memory_write` that the model of the
// conversation calls, and the curator that reads a conversation afterwards, bring a REQUEST, and the program decides what becomes of it. Nothing that the model says is believed:
//
//   • it must show the words of the person that the note rests on, and those words must be there, letter for letter, in a message of the person in this conversation (not in what
//     the assistant said, not in a page found on the web, not in a long text that was pasted: a text pasted in may say "remember that…" about anything);
//   • a note that says nearly what one already says is not added: it counts as the same fact seen again, or the model is told which notes are alike and may say it is different;
//   • what was seen later takes the place of what was seen before, never the other way (supersede.js);
//   • secrets, the numbers of cards and papers, passwords, and orders to the assistant ("always do…") are never kept;
//   • what the person deleted does not come back (tombstone.js);
//   • the same request twice does nothing the second time.
//
// `applyWrite` is pure: it gets the notes and gives the new notes, the event that says what changed (for "memory updated" and for undoing it) and the words to tell the model.
// Shared by the page and the server: no window, no document, no browser storage.

import { LIMITS, NOTE_KINDS, createNote, isActive, normalizeKeywords } from './notes.js';
import { jaccard, normalizeText, overlapCoefficient, plainWords, termSet } from './tokenize.js';
import { canSupersede, supersede } from './supersede.js';
import { makeRoom, reinforce, sightingKey } from './lifecycle.js';
import { isExplicitPreference } from './standing.js';
import { findTombstone, makeTombstone } from './tombstone.js';

const DUPLICATE = 0.8;
const SIMILAR = 0.3;
const SIMILAR_OVERLAP = 0.6;
const MAX_SIMILAR_SHOWN = 3;

const CJK_CHARACTER = '[\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}\\p{Script=Hangul}]';
const CJK_GAP = new RegExp(`(${CJK_CHARACTER})\\s+(?=${CJK_CHARACTER})`, 'gu');
// The words as they are compared: no case, no difference of shape, one space for any run of spaces, and none between two Chinese, Japanese or Korean characters.
const squash = (text) => normalizeText(text).replace(/\s+/g, ' ').replace(CJK_GAP, '$1').trim();

// ---------------------------------------------------------------------------------------------------------------------------------- what is never kept

const SECRET_PATTERNS = Object.freeze([
  /\bsk-[A-Za-z0-9_-]{16,}/,
  /\bAIza[0-9A-Za-z_-]{20,}/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./,
  /\b[0-9a-f]{32,}\b/i,
  /\b[A-Z][12]\d{8}\b/, // a number of identity of Taiwan
  /\b\d{3}-\d{2}-\d{4}\b/ // a number of social security
]);

// A number of a card (13 to 19 digits that pass the check of Luhn), with the spaces and dashes people put in it.
function hasCardNumber(text) {
  for (const match of String(text).matchAll(/\b(?:\d[ -]?){13,19}\b/g)) {
    const digits = match[0].replace(/\D/g, '');
    if (digits.length < 13 || digits.length > 19) continue;
    let sum = 0;
    for (let index = 0; index < digits.length; index += 1) {
      let digit = Number(digits[digits.length - 1 - index]);
      if (index % 2 === 1) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
    }
    if (sum % 10 === 0) return true;
  }
  return false;
}

const FORBIDDEN = Object.freeze([
  /(?:密碼|口令|password|passcode|passphrase|mot de passe|contraseña|пароль)\s*(?:是|為|:|=|is|est|es|—|-)\s*\S+/i,
  /(?:身分證|身份證|護照號|護照號碼|銀行帳號|銀行帳戶|卡號|passport number|social security number|bank account number|card number|numéro de carte|iban)\s*(?:是|為|:|=|is|est|es)?\s*[\dA-Z]{6,}/i
]);

// An order to the assistant is not a fact about the person ("always answer in French" is written "User wants answers in French").
const IMPERATIVE = Object.freeze([
  /^\s*(?:always|never|from now on|ignore|disregard|forget (?:all|everything|your)|you (?:must|should|have to|are to)|do not|don't|make sure|act as|pretend)\b/i,
  /^\s*(?:以後(?:一律|都|請)|永遠要|忽略|無視|請(?:你)?(?:一律|務必|永遠)|你(?:必須|應該|一定要|要)|不要再?|扮演)/,
  /^\s*(?:toujours|ne jamais|désormais|ignore|tu dois|vous devez|ne pas)\b/i,
  /^\s*(?:siempre|nunca|a partir de ahora|ignora|debes|no)\s/i,
  /^\s*(?:всегда|никогда|с этого момента|игнорируй|ты должен|не )/i
]);

const hasSecret = (text) => SECRET_PATTERNS.some((pattern) => pattern.test(text)) || hasCardNumber(text);
const hasForbidden = (text) => FORBIDDEN.some((pattern) => pattern.test(text));
const isOrder = (text) => IMPERATIVE.some((pattern) => pattern.test(text));

/** Why a text may not be kept as a note ('secret', 'forbidden_category', 'instruction'), or '' when it may: the same rules as for every write, for what comes from a file. */
export const refusalFor = (text) => (hasSecret(text) ? 'secret' : hasForbidden(text) ? 'forbidden_category' : isOrder(text) ? 'instruction' : '');

/** Whether a message of the person looks like something pasted in (an article, a mail, code) rather than what the person wrote: nothing is learned from such a text. */
export function looksPasted(message) {
  if (message.untrusted === true || message.pasted === true) return true;
  const text = String(message.text || '');
  if (text.length > 1500) return true;
  if (text.includes('```')) return true;
  const lines = text.split('\n');
  if (lines.filter((line) => /^\s*>/.test(line)).length >= 3) return true;
  if (lines.filter((line) => /^(?:from|to|cc|subject|date|寄件者|收件者|主旨|日期)\s*[:：]/i.test(line)).length >= 2) return true;
  return false;
}

// ---------------------------------------------------------------------------------------------------------------------------------- the words of the person

/** The message of the person (the latest) that holds `quote` letter for letter; { message } or { problem: 'not_found' | 'untrusted' }. */
export function findQuote(quote, messages) {
  const wanted = squash(quote);
  if (wanted.length < LIMITS.minQuote || wanted.length > LIMITS.maxQuote) return { problem: 'bad_quote' };
  let untrusted = false;
  for (const message of [...messages].reverse()) {
    if (message.role !== 'user' || !squash(message.text).includes(wanted)) continue;
    if (looksPasted(message)) {
      untrusted = true;
      continue;
    }
    return { message };
  }
  return { problem: untrusted ? 'untrusted' : 'not_found' };
}

// ---------------------------------------------------------------------------------------------------------------------------------- one request

/** A short id of a request, so that the same request twice is known (not a secret, only a name). */
export function opId(conversationId, request) {
  const text = `${conversationId}|${request.op}|${request.id || ''}|${squash(request.text || '')}|${squash(request.quote || '')}`;
  let first = 0xdeadbeef;
  let second = 0x41c6ce57;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    first = Math.imul(first ^ code, 2654435761);
    second = Math.imul(second ^ code, 1597334677);
  }
  first = Math.imul(first ^ (first >>> 16), 2246822507) ^ Math.imul(second ^ (second >>> 13), 3266489909);
  second = Math.imul(second ^ (second >>> 16), 2246822507) ^ Math.imul(first ^ (first >>> 13), 3266489909);
  return (4294967296 * (2097151 & second) + (first >>> 0)).toString(36);
}

const refuse = (code, message, extra = {}) => ({ ok: false, code, message, ...extra });

const view = (note) => ({ id: note.id, text: note.text, observedAt: note.observedAt });

function similarNotes(candidate, notes) {
  const words = termSet(candidate.text, candidate.keywords);
  return notes
    .filter(isActive)
    .map((note) => {
      const other = termSet(note.text, note.keywords);
      return { note, like: jaccard(words, other), overlap: overlapCoefficient(words, other) };
    })
    .filter((entry) => entry.like >= SIMILAR || entry.overlap >= SIMILAR_OVERLAP)
    .sort((left, right) => right.like - left.like || right.overlap - left.overlap);
}

const eventOf = ({ id, now, conversationId, messageId, who, ops }) => ({ id, at: now(), conversationId, messageId, who, ops });

/**
 * `notes`: all the notes (also the archived ones and the tombstones). `request`: { op: 'add' | 'update' | 'forget', text, id, quote, keywords, kind, standing, distinct, validUntil }.
 * `context`: { conversationId, messages: [{ id, role, text, at, untrusted }], who: 'tool' | 'curator', appliedOps: [ids], createId, now }.
 * Returns { ok: true, action, notes, note, event, message } or { ok: false, code, message, similar? }; `message` is what the model is told.
 */
export function applyWrite({ notes, request, context }) {
  const now = context.now || (() => new Date().toISOString());
  const createId = context.createId || (() => globalThis.crypto.randomUUID());
  const who = context.who === 'curator' ? 'curator' : 'tool';
  const conversationId = context.conversationId || '';
  const op = request?.op;
  if (!['add', 'update', 'forget'].includes(op)) return refuse('bad_request', 'The operation must be add, update or forget.');

  const id = opId(conversationId, request);
  if ((context.appliedOps || []).includes(id)) return { ok: true, action: 'noop', notes, note: null, event: null, opId: id, message: 'That was already saved.' };

  // The words of the person that this rests on.
  const found = findQuote(request.quote, context.messages || []);
  if (found.problem === 'bad_quote') return refuse('bad_quote', `"quote" must be the words of the user that show this, copied exactly (${LIMITS.minQuote} to ${LIMITS.maxQuote} characters).`);
  if (found.problem === 'untrusted') return refuse('untrusted_source', 'Those words are in a text the user pasted in or something found elsewhere: nothing is learned from it. Only what the user wrote themself can be saved.');
  if (found.problem === 'not_found') return refuse('quote_not_found', 'The user never wrote those words in this conversation. Copy the words exactly from a message of the user, or do not save it.');
  const { message } = found;
  const observedAt = message.at || now();
  const base = { id: createId(), now, conversationId, messageId: message.id, who };

  if (op === 'forget') {
    const target = notes.find((note) => note.id === request.id && isActive(note));
    if (!target) return refuse('not_found', 'There is no such note in use. Look it up with search_memory first.');
    if (target.locked) return refuse('locked', 'The user locked this note: it cannot be changed here.');
    const tombstone = makeTombstone({ ...target, source: { ...target.source, messageIds: [...new Set([...target.source.messageIds, message.id])].slice(-20) } }, now);
    return {
      ok: true,
      action: 'forget',
      notes: notes.map((note) => (note.id === target.id ? tombstone : note)),
      note: tombstone,
      opId: id,
      event: eventOf({ ...base, ops: [{ action: 'forget', noteId: target.id, before: view(target), after: null }] }),
      message: 'Forgotten.'
    };
  }

  // add and update bring a text.
  const text = String(request.text || '').replace(/\s+/g, ' ').trim();
  if (!text) return refuse('bad_request', '"text" is needed: one fact about the user in one sentence.');
  if (text.length > LIMITS.maxText) return refuse('too_long', `Keep it to one fact in at most ${LIMITS.maxText} characters.`);
  if (hasSecret(text) || hasSecret(request.quote || '')) return refuse('secret', 'That holds something secret (a key, a number of a card or of a paper): it is never saved.');
  if (hasForbidden(text) || hasForbidden(request.quote || '')) return refuse('forbidden_category', 'Passwords and the numbers of accounts, cards and papers are never saved.');
  if (isOrder(text)) return refuse('instruction', 'Write it as a fact about the user ("User prefers answers in French"), not as an order to you.');
  const keywords = normalizeKeywords(request.keywords && request.keywords.length ? request.keywords : plainWords(text));
  const candidate = { text, keywords, messageIds: [message.id] };
  if (findTombstone(candidate, notes)) return refuse('forgotten', 'The user deleted a note like this one: it is not saved again.');

  const kind = NOTE_KINDS.includes(request.kind) ? request.kind : 'fact';
  const source = { conversationId, messageIds: [message.id], quote: String(request.quote).replace(/\s+/g, ' ').trim().slice(0, LIMITS.maxQuote), seen: [sightingKey(conversationId, observedAt)] };
  const standing = request.standing === true && (kind === 'preference' || kind === 'fact') && isExplicitPreference(source.quote);
  const sameWords = termSet(text, keywords);

  if (op === 'update') {
    const target = notes.find((note) => note.id === request.id && isActive(note));
    if (!target) return refuse('not_found', 'There is no such note in use. Look it up with search_memory first.');
    if (target.locked) return refuse('locked', 'The user locked this note: it cannot be changed here. You may add a newer note instead.');
    if (jaccard(sameWords, termSet(target.text, target.keywords)) >= DUPLICATE) {
      const again = reinforce(target, { conversationId, observedAt, messageId: message.id, now });
      return { ok: true, action: 'reinforce', notes: notes.map((note) => (note.id === target.id ? again : note)), note: again, opId: id, event: eventOf({ ...base, ops: [{ action: 'reinforce', noteId: target.id, before: view(target), after: view(again) }] }), message: 'That is already known: it counts as seen again.' };
    }
    if (!canSupersede(target, observedAt)) {
      const again = reinforce(target, { conversationId, observedAt, messageId: message.id, now });
      return { ok: true, action: 'reinforce', notes: notes.map((note) => (note.id === target.id ? again : note)), note: again, opId: id, event: eventOf({ ...base, ops: [{ action: 'reinforce', noteId: target.id, before: view(target), after: view(again) }] }), message: 'The note in use was seen later than what you give: it is kept and only counted as seen again.' };
    }
    const replaced = { ...supersede(target, { text, keywords, observedAt, source, validUntil: request.validUntil || null, now }), standing: standing || target.standing };
    return { ok: true, action: 'update', notes: notes.map((note) => (note.id === target.id ? replaced : note)), note: replaced, opId: id, event: eventOf({ ...base, ops: [{ action: 'update', noteId: target.id, before: view(target), after: view(replaced) }] }), message: 'Updated.' };
  }

  // add
  const alike = similarNotes(candidate, notes);
  const nearest = alike[0];
  if (nearest && nearest.like >= DUPLICATE) {
    const again = reinforce(nearest.note, { conversationId, observedAt, messageId: message.id, now });
    return { ok: true, action: 'reinforce', notes: notes.map((note) => (note.id === again.id ? again : note)), note: again, opId: id, event: eventOf({ ...base, ops: [{ action: 'reinforce', noteId: again.id, before: view(nearest.note), after: view(again) }] }), message: 'That is already known: it counts as seen again.' };
  }
  if (nearest && request.distinct !== true) {
    return refuse('similar_exists', 'The notebook already has something like this. If it is the same subject, call update with its id; if it is a different fact, call add again with "distinct": true.', { similar: alike.slice(0, MAX_SIMILAR_SHOWN).map((entry) => view(entry.note)) });
  }
  let next = notes;
  const ops = [];
  if (notes.filter(isActive).length >= LIMITS.maxActive) {
    if (who === 'tool') {
      const weak = [...notes.filter(isActive)].sort((left, right) => left.evidenceCount - right.evidenceCount).slice(0, 5).map(view);
      return refuse('full', `The notebook is full (${LIMITS.maxActive} notes). Update or forget one of the weakest first.`, { similar: weak });
    }
    const room = makeRoom(notes, 1, { now });
    next = room.notes;
    for (const gone of room.evicted) ops.push({ action: 'archive', noteId: gone.id, before: view(gone), after: null });
  }
  const created = createNote({ id: createId(), text, keywords, kind, standing, source, observedAt, validUntil: request.validUntil || null, now });
  ops.push({ action: 'add', noteId: created.id, before: null, after: view(created) });
  return {
    ok: true,
    action: 'add',
    notes: [...next, created],
    note: created,
    opId: id,
    event: eventOf({ ...base, ops }),
    message: standing || request.standing !== true ? 'Saved.' : 'Saved as an ordinary note (it is on the first page only when the user said plainly that it holds for every answer, or it is seen again).'
  };
}

