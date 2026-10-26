// What the person's message does while a reply is still being made (docs/superpowers/specs/2026-10-26-reply-steering-design.md): with something in the box, "Send" steers, queues or
// sends now (the setting `replyInputMode`); with nothing in the box the button stops the reply. One object for the page, set up once with `configure` where the composer is bound
// (features/composer-input-bindings.js); the places that know when the box changes or when a reply ends tell it.
//   steer     the server cannot take a message into a reply yet (the next phase of the work): until it does, this is the same as send-now, except that a reply that cannot be steered
//             (a council, a picture) queues the message instead, so that nothing is stopped by accident.
//   queue     the message stays in the box and goes when the reply ends (unless the person stops the reply or empties the box).
//   send-now  the reply is stopped (what was written stays) and the message goes at once.

import { stopReplyAndWait } from './reply-stop.js';

export const REPLY_INPUT_MODES = Object.freeze(['steer', 'queue', 'send-now']);
export const normalizeReplyInputMode = (value) => (REPLY_INPUT_MODES.includes(value) ? value : 'steer');

const state = { deps: null, draft: false, queued: false };

export const replySteering = {
  /**
   * `getConfig()`, `getAbortController()` (the reply being made, or null), `submitChatForm()`, `isSteerable()` (a reply that a message may be put into), `onChange()` (draw the line and
   * the button again).
   */
  configure(deps) {
    state.deps = deps;
    state.draft = false;
    state.queued = false;
  },
  /** Told by the box whenever it changes: whether it holds a message (text, a file or a quote). An emptied box also drops a queued message. */
  setDraft(present) {
    const value = Boolean(present);
    if (state.draft === value) return;
    state.draft = value;
    if (!value && state.queued) {
      state.queued = false;
      state.deps?.onChange?.();
    }
  },
  isQueued: () => state.queued,
  /** Takes the message out of the queue (it stays in the box). */
  cancelQueue() {
    if (!state.queued) return;
    state.queued = false;
    state.deps?.onChange?.();
  },
  /**
   * The person pressed Send (or Enter) while a reply is being made. True when this was taken (nothing more is to be done); false when there is no reply or nothing in the box, in which
   * case the caller stops the reply.
   */
  press() {
    const deps = state.deps;
    if (!deps || !deps.getAbortController() || !state.draft) return false;
    if (state.queued) return true;
    const mode = normalizeReplyInputMode(deps.getConfig()?.replyInputMode);
    if (mode === 'queue' || (mode === 'steer' && !deps.isSteerable())) {
      state.queued = true;
      deps.onChange?.();
      return true;
    }
    void stopReplyAndWait({ getAbortController: deps.getAbortController }).then(() => deps.submitChatForm());
    return true;
  },
  /** Told when a reply is over: a queued message goes now (the person stopping the reply took it out of the queue). */
  onReplyEnded() {
    const deps = state.deps;
    if (!deps || !state.queued) return;
    state.queued = false;
    deps.onChange?.();
    if (state.draft) setTimeout(() => deps.submitChatForm(), 0);
  }
};
