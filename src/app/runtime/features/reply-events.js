// The page tells the parts that want to know when a reply has ended (the suggested reply in the message box, see ui/reply-suggestion/): `emitReplyEnded()` is called by the
// cleanup every reply goes through (single model, council, server, a reply that was cut), after the reply is saved. Nothing here fails when a listener does.

const listeners = new Set();

/** Calls `listener` whenever a reply ends. Resolves a function that stops it. */
export function onReplyEnded(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitReplyEnded() {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch (error) {
      globalThis.console?.warn?.('A listener of the end of a reply failed.', error);
    }
  }
}
