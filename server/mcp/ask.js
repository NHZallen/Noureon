// The question that asks the person whether a connector's tool may run (docs/superpowers/specs/2026-10-10-mcp-connectors-design.md, §5.5): a card in the step list of the reply, with the connector, the tool and the exact inputs,
// and three answers (allow once, always allow, refuse). The reply waits for the answer, up to ten minutes, which count as a refusal. It is the same
// as the question about a site (sandbox-host) and the window for a tool's login (server/executor.js): the answer comes back from any page that watches the reply.

import { randomUUID } from 'node:crypto';

export const CONNECTOR_ASK_WAIT_MS = 10 * 60 * 1000;
const MAX_SHOWN_ARGS_CHARS = 4000;

/** The inputs as the card shows them: all of them, as plain text, only cut when they are very long. */
export function shownArguments(args) {
  let text = '';
  try {
    text = JSON.stringify(args ?? {}, null, 2);
  } catch {
    text = '{}';
  }
  return text.length > MAX_SHOWN_ARGS_CHARS ? { text: text.slice(0, MAX_SHOWN_ARGS_CHARS), cut: true } : { text, cut: false };
}

/**
 * `emit(event)` tells the pages (the events { type: 'connector', event: 'ask' | 'answer', ... }); `signal` is the reply's stop; `onWaited(ms)` is told how long the
 * reply waited, so the reply's own clock and time limit do not count it. Returns { ask(info), answer(askId, decision) }.
 */
export function createConnectorAsk({ emit, signal = null, waitMs = CONNECTOR_ASK_WAIT_MS, now = Date.now, onWaited = () => {} }) {
  const pending = new Map();
  return {
    /** Resolves 'once', 'always', 'deny', 'timeout' or 'cancel' (the reply was stopped while it waited). */
    async ask({ connector, tool, args, kind }) {
      const id = randomUUID();
      const began = now();
      const shown = shownArguments(args);
      const decision = await new Promise((resolve) => {
        let timer = null;
        const onAbort = () => finish('cancel');
        const finish = (value) => {
          clearTimeout(timer);
          pending.delete(id);
          signal?.removeEventListener?.('abort', onAbort);
          resolve(value);
        };
        timer = setTimeout(() => finish('timeout'), waitMs);
        pending.set(id, finish);
        if (signal?.aborted) {
          finish('cancel');
          return;
        }
        signal?.addEventListener?.('abort', onAbort, { once: true });
        emit({ type: 'connector', event: 'ask', id, connector, tool, kind: kind === 'read' ? 'read' : 'write', args: shown.text, argsCut: shown.cut, waitMs });
      });
      onWaited(Math.max(0, now() - began));
      emit({ type: 'connector', event: 'answer', id, decision, connector, tool });
      return decision;
    },
    answer(askId, decision) {
      const finish = pending.get(askId);
      if (!finish || !['once', 'always', 'deny'].includes(decision)) return { answered: false };
      finish(decision);
      return { answered: true };
    }
  };
}
