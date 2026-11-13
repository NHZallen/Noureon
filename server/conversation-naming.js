// Naming a conversation on the server when the page cannot be trusted to finish it (docs/superpowers/specs/2026-11-13-server-conversation-naming-design.md).
// The page names a new conversation itself, a moment after the first message is sent. When the reply is made on the server, the person may close the page (or the
// phone may lock) in that moment, and the title would stay the name every new conversation has. So the page also tells the server, once the server has taken the reply:
// "if this conversation is still called `placeholder` in a little while, name it from this prompt". The server waits, looks, and only then asks the model of the reply
// (with the key of the reply, which it holds anyway; nothing new is kept). The title is written only where it is still the placeholder, so a title the page made, or one
// the person typed, is never replaced, and the model is not even asked in that case.

import { createMemoryModelRunner } from '../src/app/runtime/shell/memory-model-runner.js';
import { parseJsonAnswer } from '../src/app/runtime/shell/current-model-json.js';
import { createModelAccess } from './model-access.js';

export const NAMING = Object.freeze({ delayMs: 30_000, maxPromptChars: 6_000, maxPlaceholderChars: 200, maxTitleChars: 120 });

const SCHEMA = { type: 'OBJECT', properties: { title: { type: 'STRING' } }, propertyOrdering: ['title'] };

/** One line, trimmed, without the quotes models like to put around a title; '' when there is nothing to keep. */
export function cleanTitle(value, max = NAMING.maxTitleChars) {
  const line = String(value ?? '').replace(/\s+/g, ' ').trim().replace(/^["“”'‘’「」『』]+|["“”'‘’「」『』]+$/g, '').trim();
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

const isTextModel = (model) => Boolean(model) && model.category !== 'image_generation' && model.outputModality !== 'image';

/**
 * Makes the naming of one run. `db` is the database (rpc), `spec` and `secrets` those of the run. Returns { request, flush }: `request({ prompt, placeholder })` is the page's
 * request (it returns false when it is not taken); `flush()` is called when the run ends, so that a run that is over before the wait is up names the conversation now
 * (the key is then let go with the run).
 */
export function createRunNaming({ db, userId, spec, secrets, fetchImpl = (...args) => globalThis.fetch(...args), setTimer = setTimeout, clearTimer = clearTimeout, delayMs = NAMING.delayMs, log = () => {} }) {
  const model = spec.model?.info;
  let taken = null;
  let timer = null;
  let running = null;

  const attempt = async () => {
    const { prompt, placeholder } = taken;
    try {
      const state = await db.rpc('server_conversation_title_state', { p_user_id: userId, p_conversation_id: spec.conversationId });
      // Nothing to do: the conversation is gone, or the page (or the person) already gave it a title.
      if (!state || state.deleted || state.renamed || state.title !== placeholder) return 'skipped';
      const access = createModelAccess({ spec: { conversationId: spec.conversationId, model: spec.model, request: { language: spec.request?.language || 'en' }, tools: { searchProvider: 'tavily', searchDepth: 'basic' }, documents: null }, secrets: { providerKey: secrets.providerKey }, fetchImpl, userId });
      const run = createMemoryModelRunner({ streamApiCall: access.streamApiCall, models: [model] });
      const answer = await run({ modelId: model.id, prompt: `${prompt}\n\nAnswer with JSON only, nothing around it, in the shape of this schema: ${JSON.stringify(SCHEMA)}` });
      const title = cleanTitle(parseJsonAnswer(answer, SCHEMA)?.title);
      if (!title) return 'no_title';
      const written = await db.rpc('server_set_conversation_title', { p_user_id: userId, p_conversation_id: spec.conversationId, p_placeholder: placeholder, p_title: title });
      return written ? 'named' : 'skipped';
    } catch (error) {
      // Naming is a nicety: a failure is only noted (the message never holds a key; the key of a reply is never in a log).
      log('naming_failed', { message: String(error?.message || '').slice(0, 120) });
      return 'failed';
    } finally {
      taken = null;
    }
  };

  const fire = () => {
    if (running) return running;
    if (!taken) return Promise.resolve('none');
    clearTimer(timer);
    timer = null;
    running = attempt();
    return running;
  };

  return {
    request({ prompt, placeholder } = {}) {
      if (taken || running || !isTextModel(model) || !secrets?.providerKey) return false;
      const text = typeof prompt === 'string' ? prompt.trim() : '';
      if (!text || text.length > NAMING.maxPromptChars || typeof placeholder !== 'string' || !placeholder || placeholder.length > NAMING.maxPlaceholderChars) return false;
      taken = { prompt: text, placeholder };
      timer = setTimer(() => { void fire(); }, delayMs);
      timer.unref?.();
      return true;
    },
    flush: fire
  };
}
