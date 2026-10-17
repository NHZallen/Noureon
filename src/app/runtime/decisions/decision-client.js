// The small judgements made while a message is sent, asked of OpenRouter's Decisions API (a model that does not write an answer: it
// answers typed questions about what it is given, here with a probability for each yes-or-no question). Four questions are put in one call:
//   search  does the message need facts of today from the web?
//   file    does the person want a file (or a change to the file just made)?
//   chart   would the answer be best shown with a chart?
//   tool    does the request need one of the command tools the model may use by itself?
//   url     (only when the message holds a web address) does what is asked need the page at that address to be opened and read?
//   exact   (only when the recall of past conversations is on) does the person want something from an earlier conversation back as it was?
//   verbatim (same) ... and copied back word for word?
// What each answer is used for is in decision-use.js. Nothing here may stop a message: a missing key, a slow or failed call, an unexpected
// reply all give `null`, and the page then does what it did before this existed (the word lists of auto-web-search.js and file-intent.js).
//
// The endpoint is OpenRouter's alpha API (/api/alpha/decisions): it may change, so everything about it is in this file, and a call that fails twice
// in a row switches the judgements off for a while instead of making every message wait for a timeout.

import { DECISION_THRESHOLD, verdictOf } from './decision-store.js';
import { buildImageDecisionRequest, parseImageDecisionResponse } from './image-decisions.js';

export { DECISION_THRESHOLD, verdictOf };

export const DECISION_URL = 'https://openrouter.ai/api/alpha/decisions';
export const DECISION_MODEL = 'typesafe/jev-1.14';
/** A call that takes longer is given up (the message goes on with the word lists). */
export const DECISION_TIMEOUT_MS = 1000;
/** After this many failures in a row no call is made for DECISION_PAUSE_MS. */
export const DECISION_FAILURES_BEFORE_PAUSE = 2;
export const DECISION_PAUSE_MS = 10 * 60 * 1000;

const MESSAGE_CHARS = 1500;
const EARLIER_MESSAGES = 2;
const EARLIER_CHARS = 300;

export const DECISION_QUESTIONS = Object.freeze({
  search: 'The latest message needs up-to-date facts from the web: news, today\'s weather, prices, scores, recent events, anything that may have changed after a language model was trained. It does not if the model\'s own knowledge or the conversation is enough.',
  file: 'The person wants a file made for them to download or keep (a document, spreadsheet, presentation, PDF, CSV, JSON, calendar or subtitle file, an image saved as a file...), or asks to change a file that was just made in the conversation.',
  chart: 'The answer would be best shown with a chart: the message asks for a chart or a graph, or it gives or asks for numbers that are compared, followed over time or split into shares.',
  tool: 'The request needs one of the command-line tools listed under "Tools available" to be run, for example to convert, process, download or inspect files. Ordinary questions, writing and explaining do not.',
  url: 'What the person asks needs the page at a web address in the message to be opened and read: to summarise it, answer from it, check it, translate it or compare it. It does not if the address is only an example, part of code or of a text being discussed, or something to copy, format or fix.',
  exact: 'The person asks to get something back from an earlier conversation as it was: the same recipe, document, answer, code or list again, in full or unchanged (not a new answer about the same topic).',
  verbatim: 'The person wants a text from an earlier conversation copied back word for word, in its original wording, with nothing rewritten.'
});

const HAS_ADDRESS = /https?:\/\/\S+/i;

const clip = (text, length) => {
  const value = String(text ?? '').replace(/\s+/g, ' ').trim();
  return value.length > length ? `${value.slice(0, length)}…` : value;
};

const textOf = (message) => (message?.parts || [])
  .filter((part) => typeof part?.text === 'string' && part.text)
  .map((part) => part.text)
  .join(' ');

/**
 * The request for one message. `history` is the conversation so far (messages with parts); `tools` is the command tools the model may use by itself
 * ([{ name, description }]); the tool question is only asked when there are some, the address question only when the message holds an address, and the
 * two about earlier conversations only when `historyRecall` is on.
 */
export function buildDecisionRequest({ message, history = [], tools = [], hasAttachment = false, conversationHasFile = false, historyRecall = false, model = DECISION_MODEL } = {}) {
  const latest = clip(message, MESSAGE_CHARS);
  if (!latest) return null;
  const state = [`Latest message: ${latest}`];
  const earlier = (Array.isArray(history) ? history : []).filter((entry) => textOf(entry)).slice(-EARLIER_MESSAGES);
  if (earlier.length) {
    state.push(`Earlier in the conversation:\n${earlier.map((entry) => `${entry.role === 'model' ? 'Assistant' : 'Person'}: ${clip(textOf(entry), EARLIER_CHARS)}`).join('\n')}`);
  }
  state.push(`Files attached to the latest message: ${hasAttachment ? 'yes' : 'no'}. Files already in the conversation: ${conversationHasFile ? 'yes' : 'no'}.`);
  const questions = {
    search: { type: 'noul', instructions: DECISION_QUESTIONS.search },
    file: { type: 'noul', instructions: DECISION_QUESTIONS.file },
    chart: { type: 'noul', instructions: DECISION_QUESTIONS.chart }
  };
  if (HAS_ADDRESS.test(latest)) questions.url = { type: 'noul', instructions: DECISION_QUESTIONS.url };
  if (historyRecall) {
    questions.exact = { type: 'noul', instructions: DECISION_QUESTIONS.exact };
    questions.verbatim = { type: 'noul', instructions: DECISION_QUESTIONS.verbatim };
  }
  const toolList = (Array.isArray(tools) ? tools : []).filter((tool) => tool?.name);
  if (toolList.length) {
    state.push(`Tools available:\n${toolList.map((tool) => `- ${clip(tool.name, 60)}${tool.description ? `: ${clip(tool.description, 160)}` : ''}`).join('\n')}`);
    questions.tool = { type: 'noul', instructions: DECISION_QUESTIONS.tool };
  }
  return { model, state, questions };
}

const probability = (answer) => {
  const value = Number(answer?.noul);
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
};

/** The answers of a reply as { search, file, chart, tool, url, exact, verbatim } (a number from 0 to 1, or null for a question not asked or not answered), or null when there are none. */
export function parseDecisionResponse(body) {
  const answers = body?.answers;
  if (!answers || typeof answers !== 'object') return null;
  const result = {
    search: probability(answers.search), file: probability(answers.file), chart: probability(answers.chart), tool: probability(answers.tool),
    url: probability(answers.url), exact: probability(answers.exact), verbatim: probability(answers.verbatim)
  };
  return Object.values(result).some((value) => value !== null) ? result : null;
}

export function createDecisionService({
  fetchImpl = (...args) => globalThis.fetch(...args),
  getApiKey = () => '',
  now = () => Date.now(),
  setTimer = (callback, ms) => setTimeout(callback, ms),
  clearTimer = (id) => clearTimeout(id),
  logger = null,
  url = DECISION_URL
} = {}) {
  let failures = 0;
  let pausedUntil = 0;

  const fail = (reason) => {
    failures += 1;
    if (failures >= DECISION_FAILURES_BEFORE_PAUSE) {
      pausedUntil = now() + DECISION_PAUSE_MS;
      failures = 0;
      logger?.warn?.('The judgements of the Decisions API are paused for a while after repeated failures.', reason);
    }
    return null;
  };

  /** The answers for one request (built by `build`, read by `parse`), or null. Never rejects. */
  const ask = async (build, parse, input = {}, { signal } = {}) => {
    try {
      const apiKey = String(getApiKey() || '').trim();
      if (!apiKey || now() < pausedUntil) return null;
      const request = build(input);
      if (!request) return null;
      const controller = new AbortController();
      const abort = () => controller.abort();
      if (signal?.aborted) return null;
      signal?.addEventListener?.('abort', abort, { once: true });
      const timer = setTimer(abort, DECISION_TIMEOUT_MS);
      try {
        const response = await fetchImpl(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
          signal: controller.signal
        });
        if (!response?.ok) return fail(`HTTP ${response?.status ?? '?'}`);
        const decisions = parse(await response.json());
        if (!decisions) return fail('no answers');
        failures = 0;
        return decisions;
      } finally {
        clearTimer(timer);
        signal?.removeEventListener?.('abort', abort);
      }
    } catch (error) {
      return fail(error?.name || String(error));
    }
  };

  /** The decisions for one message, or null. Never rejects. */
  const decide = (input, options) => ask(buildDecisionRequest, parseDecisionResponse, input, options);
  /** The answers about a picture request (image-decisions.js), or null. The same pause after failures as for the messages. */
  const decideImage = (input, options) => ask(buildImageDecisionRequest, parseImageDecisionResponse, input, options);

  return { decide, decideImage, isPaused: () => now() < pausedUntil };
}
