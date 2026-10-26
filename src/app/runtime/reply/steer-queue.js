// The messages a person adds while a reply is being made (docs/superpowers/specs/2026-10-26-reply-steering-design.md): kept in order until the reply reaches its next boundary (the answers
// of its tools going back to the model), where they are taken and put into the request after those answers. A message that no boundary took by the end of the reply is `left`.
// Shared by the page and the server: it uses no browser API.

export const MAX_STEERS = 20;
export const MAX_STEER_CHARS = 2000;

/** `onTaken({ text, at })` is told for each message when it is taken (the live view shows where the model saw it). */
export function createSteerQueue({ onTaken = () => {}, now = Date.now } = {}) {
  const pending = [];
  const taken = [];
  let supported = false;
  return {
    /** A loop with boundaries (it takes the messages) is running: until it says so, a message has nowhere to go. */
    support() {
      supported = true;
    },
    supported: () => supported,
    /** True when the message was kept (false for an empty one, or when this reply has had its share of them). */
    push(text) {
      const value = String(text ?? '').trim().slice(0, MAX_STEER_CHARS);
      if (!value || pending.length + taken.length >= MAX_STEERS) return false;
      pending.push({ text: value, at: now() });
      return true;
    },
    has: () => pending.length > 0,
    /** The texts waiting, in the order they came; they are no longer waiting. */
    take() {
      const items = pending.splice(0);
      for (const item of items) {
        taken.push(item);
        onTaken(item);
      }
      return items.map((item) => item.text);
    },
    /** What was taken: [{ text, at }]. */
    taken: () => taken.map((item) => ({ ...item })),
    /** What no boundary took: [{ text, at }]. */
    left: () => pending.map((item) => ({ ...item }))
  };
}

/** The field of a round of tool answers that carries what the person added (nothing when nothing was added). */
export const steerTurnFields = (steer) => {
  const texts = steer?.take?.() ?? [];
  return texts.length ? { steer: texts } : {};
};

/** What the model is told in the request after the answers of its tools. */
export const steerNote = (texts) => `The user added ${texts.length > 1 ? 'these messages' : 'this message'} while you were working. Take ${texts.length > 1 ? 'them' : 'it'} into account from now on, and change what you do next if ${texts.length > 1 ? 'they ask' : 'it asks'} for that:\n${texts.map((text) => `- ${text}`).join('\n')}`;
