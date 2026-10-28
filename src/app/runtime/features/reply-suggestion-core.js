// The suggested reply (docs/superpowers/specs/2026-10-28-reply-suggestion-design.md): what to ask a small model, what to make of its answer, and when there is nothing to
// ask about. No `window`, no `document`: shared by the page and its tests.

const MAX_REPLY_CHARS = 1500;
const MAX_USER_CHARS = 400;
const MAX_SUGGESTION_CHARS = 80;
const MIN_REPLY_CHARS = 8;

const textOf = (message) => (Array.isArray(message?.parts) ? message.parts.filter((part) => typeof part?.text === 'string').map((part) => part.text).join('\n') : '').trim();
const tail = (text, limit) => (text.length > limit ? text.slice(text.length - limit) : text);
const head = (text, limit) => (text.length > limit ? text.slice(0, limit) : text);

/**
 * What the suggestion is about: { replyText, userText, replyId } for the last message of the conversation when it is a finished answer of a model to a message of the person, or
 * null when there is nothing to suggest for: no answer yet, an error, a very short answer, an answer that a message put into it cut (a steered reply), a temporary chat, or a
 * council. `errorPrefixes` are the words an error message starts with (in every language of the app).
 */
export function suggestionSubject(conversation, { errorPrefixes = [] } = {}) {
  const messages = Array.isArray(conversation?.messages) ? conversation.messages : [];
  if (!messages.length || conversation?.isTemporary || conversation?.retentionMode === 'ephemeral' || conversation?.council?.enabled) return null;
  const last = messages.at(-1);
  if (last?.role !== 'model') return null;
  const replyText = textOf(last);
  if (replyText.length < MIN_REPLY_CHARS) return null;
  if (errorPrefixes.some((prefix) => prefix && replyText.startsWith(prefix))) return null;
  let lastUser = -1;
  for (let index = messages.length - 2; index >= 0; index -= 1) {
    if (messages[index]?.role === 'user' && !messages[index]?.metadata?.steer) { lastUser = index; break; }
  }
  if (lastUser < 0) return null;
  // A message put into the reply (a steer) is a user message between the one that was asked and the answer: the answer is then not a plain reply to a question.
  if (messages.slice(lastUser + 1, -1).some((message) => message?.role === 'user')) return null;
  return { replyText: tail(replyText, MAX_REPLY_CHARS), userText: head(textOf(messages[lastUser]), MAX_USER_CHARS), replyId: last.id || String(messages.length) };
}

/** The words for the small model. It answers with the one line, or with NONE. */
export function buildSuggestionPrompt({ userText, replyText }) {
  return [
    'You predict what the user will type next in a chat with an AI assistant.',
    'Read the assistant\'s last message. If it asks the user a question, offers options, or waits for a decision or a confirmation, write the ONE short reply the user is most likely to send:',
    '- in the voice of the user, in the same language as the user\'s last message (for Chinese at most 20 characters, otherwise at most 10 words);',
    '- only the words of the reply: no quotes, no explanation, no label, one line.',
    'If the assistant did not ask for anything (it only gave information, finished a task, or what the user would say is unclear), answer exactly: NONE',
    '',
    'The user\'s last message:',
    userText || '(none)',
    '',
    'The assistant\'s last message:',
    replyText
  ].join('\n');
}

/** The suggestion in the answer of the small model, or '' (NONE, nothing, more than one line of explanation, too long). */
export function parseSuggestion(raw) {
  const lines = String(raw ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return '';
  let line = lines[0]
    .replace(/^(suggestion|reply|answer|建議|回覆|回答)\s*[:：]\s*/i, '')
    .replace(/^[-*•]\s+/, '')
    .replace(/^["'“”‘’「」『』`]+|["'“”‘’「」『』`]+$/g, '')
    .replace(/\*\*/g, '')
    .trim();
  if (!line || /^(none|n\/a|null|無|无|没有|沒有)\.?$/i.test(line)) return '';
  if (line.length > MAX_SUGGESTION_CHARS) return '';
  line = line.replace(/\s+/g, ' ');
  return line;
}
