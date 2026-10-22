// The question to the person that a text model's picture tool asks (docs/superpowers/specs/2026-10-22-text-model-image-tool-design.md): whether it may
// draw, and which one of several pictures is the one meant. A card in the step list of the reply; the reply waits for the answer, up to ten minutes,
// which count as a refusal. The same as the question about a tool of a connector (server/mcp/ask.js): the answer comes back from any page that watches the reply.

import { randomUUID } from 'node:crypto';

export const IMAGE_ASK_WAIT_MS = 10 * 60 * 1000;

/**
 * `emit(event)` tells the pages (the events { type: 'image', event: 'ask' | 'answer', ... }); `signal` is the reply's stop; `onWaited(ms)` is told how long the
 * reply waited, so the reply's own clock and time limit do not count it. Returns { ask(kind, payload, accepts, onId), answer(askId, value) } (`onId(id)` is told the question's id before it is shown):
 * `accepts(value)` says whether an answer is one the question takes (a kind of question has its own).
 */
export function createImageAsk({ emit, signal = null, waitMs = IMAGE_ASK_WAIT_MS, now = Date.now, onWaited = () => {} }) {
  const pending = new Map();
  return {
    /** Resolves the answer, 'timeout', or 'cancel' (the reply was stopped while it waited). */
    async ask(kind, payload, accepts, onId = () => {}) {
      const id = randomUUID();
      onId(id);
      const began = now();
      const value = await new Promise((resolve) => {
        let timer = null;
        const onAbort = () => finish('cancel');
        const finish = (answer) => {
          clearTimeout(timer);
          pending.delete(id);
          signal?.removeEventListener?.('abort', onAbort);
          resolve(answer);
        };
        timer = setTimeout(() => finish('timeout'), waitMs);
        pending.set(id, { finish, accepts });
        if (signal?.aborted) {
          finish('cancel');
          return;
        }
        signal?.addEventListener?.('abort', onAbort, { once: true });
        emit({ type: 'image', event: 'ask', kind, id, ...payload, waitMs });
      });
      onWaited(Math.max(0, now() - began));
      emit({ type: 'image', event: 'answer', kind, id, answer: value });
      return value;
    },
    answer(askId, value) {
      const entry = pending.get(askId);
      if (!entry || typeof value !== 'string' || !entry.accepts(value)) return { answered: false };
      entry.finish(value);
      return { answered: true };
    }
  };
}
