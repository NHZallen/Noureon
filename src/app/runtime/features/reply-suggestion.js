// The suggested reply (docs/superpowers/specs/2026-10-28-reply-suggestion-design.md): when a reply has ended, a small model (the memory model of the settings) is asked, once,
// what the person is most likely to answer, and the answer goes to the view (ui/reply-suggestion/) as one faint line in the empty message box. Nothing is kept, and nothing
// is shown when there is nothing to answer to, when the model says it does not know, when it fails, when it is late (another reply began, the person typed or sent a message
// or went to another conversation), or when the setting is off. Never throws, never asks the person anything.

import { NOURAS_REQUEST_PURPOSE } from '../nouras/nouras-policy.js';
import { buildSuggestionPrompt, parseSuggestion, suggestionSubject } from './reply-suggestion-core.js';

const MAX_TOKENS = 120;

export function createReplySuggestion({
  view,
  getConversation,
  getConfig,
  runModel,
  isImageConversation = () => false,
  getErrorPrefixes = () => [],
  timeoutMs = 12_000,
  delayMs = 150,
  setTimer = (callback, ms) => setTimeout(callback, ms),
  clearTimer = (timer) => clearTimeout(timer),
  warn = () => {}
}) {
  let generation = 0;
  let abort = null;
  let timer = null;
  let shownFor = null;

  const enabled = () => getConfig()?.replySuggestionEnabled !== false;

  /** The suggestion goes away and nothing that was being asked is used. */
  const cancel = () => {
    generation += 1;
    abort?.abort();
    abort = null;
    if (timer !== null) { clearTimer(timer); timer = null; }
    shownFor = null;
    view.hide();
  };

  const run = async (mine) => {
    timer = null;
    const conversation = getConversation();
    if (!conversation || isImageConversation(conversation)) return;
    const subject = suggestionSubject(conversation, { errorPrefixes: getErrorPrefixes() });
    const modelId = getConfig()?.memoryModelId;
    if (!subject || !modelId) return;
    const last = conversation.messages.at(-1);
    const controller = new AbortController();
    abort = controller;
    const stop = setTimer(() => controller.abort(), timeoutMs);
    let raw = '';
    try {
      raw = await runModel({ modelId, prompt: buildSuggestionPrompt(subject), signal: controller.signal, maxTokens: MAX_TOKENS, requestPurpose: NOURAS_REQUEST_PURPOSE.BACKGROUND_SUGGESTION });
    } catch (error) {
      // No key for that model, offline, too slow: no suggestion, and no complaint.
      if (!controller.signal.aborted) warn('The suggested reply could not be made.', error);
      return;
    } finally {
      clearTimer(stop);
      if (abort === controller) abort = null;
    }
    if (mine !== generation) return;
    const text = parseSuggestion(raw);
    const now = getConversation();
    if (!text || now?.id !== conversation.id || now.messages.at(-1) !== last) return;
    shownFor = { id: conversation.id, last };
    view.show(text);
  };

  return {
    /** A reply has ended: the old suggestion goes, and a new one is asked for (when the setting is on). */
    onReplyEnded() {
      cancel();
      if (!enabled()) return;
      const mine = generation;
      timer = setTimer(() => { void run(mine); }, delayMs);
    },
    cancel,
    /** Whether what is shown is still for the conversation and the reply that are on the screen. */
    stillValid() {
      const conversation = getConversation();
      return Boolean(shownFor && conversation?.id === shownFor.id && conversation.messages.at(-1) === shownFor.last);
    }
  };
}
