// The messages a person adds while a reply is being made (docs/superpowers/specs/2026-10-26-reply-steering-design.md): kept in order until the reply reaches its next boundary (the answers
// of its tools going back to the model), where they are taken and put into the request after those answers. A message that no boundary took by the end of the reply is `left`.
// Shared by the page and the server: it uses no browser API.

export const MAX_STEERS = 20;
export const MAX_STEER_CHARS = 2000;

/**
 * `onTaken({ text, at, id })` is told for each message when it is taken. `setBatchHandler(fn)`: `fn(items, context)` is told once for the messages one boundary took (the server cuts the
 * reply there and starts the next message), with what the loop that took them gave (the steps it has run so far).
 */
export function createSteerQueue({ onTaken = () => {}, now = Date.now } = {}) {
  const pending = [];
  const taken = [];
  let supported = false;
  let batchHandler = null;
  const arrivals = new Set();
  return {
    /** `fn()` is told whenever a message is kept (a loop that is waiting for the model uses it to give up that round). Returns the function that stops it. */
    onArrive(fn) {
      arrivals.add(fn);
      return () => arrivals.delete(fn);
    },
    setBatchHandler(handler) {
      batchHandler = typeof handler === 'function' ? handler : null;
    },
    /** A loop with boundaries (it takes the messages) is running: until it says so, a message has nowhere to go. */
    support() {
      supported = true;
    },
    supported: () => supported,
    /** True when the message was kept (false for an empty one, or when this reply has had its share of them). */
    push(text, id = '') {
      const value = String(text ?? '').trim().slice(0, MAX_STEER_CHARS);
      if (!value || pending.length + taken.length >= MAX_STEERS) return false;
      pending.push({ text: value, at: now(), ...(id ? { id: String(id) } : {}) });
      for (const fn of [...arrivals]) {
        try { fn(); } catch { /* a listener never stops a message from being kept */ }
      }
      return true;
    },
    has: () => pending.length > 0,
    /** The texts waiting, in the order they came; they are no longer waiting. */
    take(context = {}) {
      const items = pending.splice(0);
      for (const item of items) {
        taken.push(item);
        onTaken(item);
      }
      if (items.length && batchHandler) batchHandler(items.map((item) => ({ ...item })), context);
      return items.map((item) => item.text);
    },
    /** What was taken: [{ text, at }]. */
    taken: () => taken.map((item) => ({ ...item })),
    /** What no boundary took: [{ text, at }]. */
    left: () => pending.map((item) => ({ ...item }))
  };
}

/** The field of a round of tool answers that carries what the person added (nothing when nothing was added). */
export const steerTurnFields = (steer, context = {}) => {
  const texts = steer?.take?.(context) ?? [];
  return texts.length ? { steer: texts } : {};
};

/** What the model is told in the request after the answers of its tools. */
export const steerNote = (texts) => `The user added ${texts.length > 1 ? 'these messages' : 'this message'} while you were working. Take ${texts.length > 1 ? 'them' : 'it'} into account from now on, and change what you do next if ${texts.length > 1 ? 'they ask' : 'it asks'} for that:\n${texts.map((text) => `- ${text}`).join('\n')}`;

/**
 * A round of a loop that waits for the model, which a message that arrives meanwhile may cut short (the model's words so far are thrown away, nothing it asked for has been run): the round
 * is given `signal`, and `interrupted()` says afterwards that it was this and not the person's stop. `allowed()` is asked when the message arrives (a round that already writes the answer,
 * or the first one, which has no tool answers to put the message after, is not cut). `dispose()` when the round is over.
 */
export function createRoundInterrupt({ signal = null, steer = null, allowed = () => true } = {}) {
  const controller = new AbortController();
  let cut = false;
  const outer = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener?.('abort', outer, { once: true });
  const off = steer?.onArrive?.(() => {
    if (cut || controller.signal.aborted || !allowed()) return;
    cut = true;
    controller.abort();
  });
  return {
    signal: controller.signal,
    interrupted: () => cut && !signal?.aborted,
    dispose() {
      off?.();
      signal?.removeEventListener?.('abort', outer);
    }
  };
}

/** The messages the loop takes after a round it cut short: they go after the answers of the round before (that round's `steer`), and `steer.take` cuts the reply there as at any boundary. */
export function putSteerInPreviousTurn(steer, toolTurns, context = {}) {
  const texts = steer?.take?.(context) ?? [];
  const turn = toolTurns.at(-1);
  if (texts.length && turn) turn.steer = [...(turn.steer || []), ...texts];
  return texts;
}
