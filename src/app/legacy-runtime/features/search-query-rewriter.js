// The web search query for a message, written by the reply's own model from the conversation. Searching the message as it
// stands fails when it refers to what was said before ("go look it up", "and the second one?", "what about its price"): a
// model that reads the conversation says what it is about in one line. Used for the models that have no search of their
// own, and nothing here may stop a search: when the model does not answer, the caller falls back to the rule that adds the
// earlier messages (model-request-formatting.js).

import { NOURAS_REQUEST_PURPOSE } from '../../runtime/nouras/nouras-policy.js';

const RECENT_MESSAGES = 6;
const USER_MESSAGE_CHARS = 500;
const ANSWER_CHARS = 300;
const QUERY_CHARS = 200;
const ATTEMPT_MS = 8000;
// A long message cannot be searched as it is, so it is written down to a query even when nothing came before it.
const LONG_MESSAGE_CHARS = 200;

const INSTRUCTION = [
  'You write the web search query for the latest user message of a conversation.',
  'Use the earlier messages to fill in what the latest message refers to: a message such as "go look it up", "and the second one?" or "what about its price" has its subject in the messages before it.',
  'Reply with the query only, on one line: no quotes, no explanation, no answer to the question, at most 15 words.',
  'Name the specific things searched for (products, versions, people, places) exactly as they were written.',
  'Do not add dates or words such as "latest" or "current": they are added when they are needed.',
  'Write it in the language that will find the best pages: English for technical and international topics, the language of the message for local ones.'
].join('\n');

const textOf = (message) => (message?.parts || []).map((part) => part?.text || '').join(' ').replace(/\s+/g, ' ').trim();

/** The query line out of a model's reply: its first line, without a label or quotes. Empty when there is none. */
export const cleanQuery = (raw) => {
  const trim = (text) => text.replace(/^["'`“”「『*\s]+|["'`“”」』*\s]+$/g, '');
  const line = String(raw || '').split('\n').map((entry) => entry.trim()).find(Boolean) || '';
  return trim(trim(line).replace(/^(?:search\s*query|query)\s*[:：]\s*/i, '')).slice(0, QUERY_CHARS).trim();
};

/** What came before the message: the conversation's messages, which may already end with it. */
const earlierMessages = (messages, current) => {
  const list = Array.isArray(messages) ? [...messages] : [];
  const last = list.at(-1);
  if (last?.role === 'user' && textOf(last) === current) list.pop();
  return list;
};

export const buildRewritePrompt = ({ text, messages, now = new Date() }) => {
  const current = String(text || '').replace(/\s+/g, ' ').trim();
  const history = earlierMessages(messages, current).slice(-RECENT_MESSAGES)
    .map((message) => {
      const isUser = message.role === 'user';
      return `${isUser ? 'User' : 'Assistant'}: ${textOf(message).slice(0, isUser ? USER_MESSAGE_CHARS : ANSWER_CHARS)}`;
    })
    .filter((line) => !/: $/.test(line));
  return [
    INSTRUCTION,
    `Today is ${now.toISOString().slice(0, 10)}.`,
    ...(history.length ? ['', '# Earlier in the conversation', ...history] : []),
    '',
    '# Latest user message',
    current.slice(0, USER_MESSAGE_CHARS * 2),
    '',
    'Search query:'
  ].join('\n');
};

export function createSearchQueryRewriter({
  streamApiCall,
  getApiKeyForProvider,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  now = () => new Date()
} = {}) {
  if (typeof streamApiCall !== 'function') throw new TypeError('The search query rewriter requires streamApiCall.');

  // The reply's own model (an image model cannot write one, and one with no key cannot be asked).
  const canAsk = (model) => Boolean(model && model.category !== 'image_generation' && model.outputModality !== 'image' && getApiKeyForProvider(model.provider));

  /** Whether the message is worth a model's time: something came before it, or it is too long to be a query itself. */
  const needed = (text, messages) => {
    const current = String(text || '').replace(/\s+/g, ' ').trim();
    return current.length > 0 && (current.length > LONG_MESSAGE_CHARS || earlierMessages(messages, current).length > 0);
  };

  const ask = async (model, prompt, signal) => {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    signal?.addEventListener?.('abort', onAbort, { once: true });
    const timer = setTimeoutFn(() => controller.abort(), ATTEMPT_MS);
    let answer = '';
    try {
      const parts = [{ text: prompt }];
      const genConfig = { temperature: 0, topP: null, maxTokens: 120 };
      await streamApiCall(parts, (chunk) => { answer += chunk; }, controller.signal, false, {
        modelInfo: model,
        conversation: { messages: [], astrasId: null, isWebSearchEnabled: false, genConfig },
        historyForApi: [],
        currentMessageForApi: { role: 'user', parts },
        genConfig,
        disableReasoning: true,
        ignoreConversationWebSearch: true,
        skipMemoryContext: true,
        skipConversationSystemContext: true,
        requestPurpose: NOURAS_REQUEST_PURPOSE.BACKGROUND_SEARCH
      });
    } finally {
      clearTimeoutFn(timer);
      signal?.removeEventListener?.('abort', onAbort);
    }
    return cleanQuery(answer);
  };

  /**
   * The search query for `text` written from the conversation, or null when there is nothing to improve (the message is
   * short and nothing came before it) or the model could not be asked or gave none. Only a stop by the person throws.
   */
  return async function rewriteSearchQuery({ text, messages, modelInfo, signal } = {}) {
    if (!needed(text, messages)) return null;
    if (!canAsk(modelInfo)) return null;
    const prompt = buildRewritePrompt({ text, messages, now: now() });
    try {
      const query = await ask(modelInfo, prompt, signal);
      if (query.length >= 2) return query;
    } catch (error) {
      if (signal?.aborted) throw error;
    }
    return null;
  };
}
