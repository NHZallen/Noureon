// What the person's message does while a reply is still being made (docs/superpowers/specs/2026-10-26-reply-steering-design.md): with something in the box, "Send" steers, queues or
// sends now (the setting `replyInputMode`); with nothing in the box the button stops the reply. One object for the page, set up once with `configure` where the composer is bound
// (features/composer-input-bindings.js); the places that know when the box changes or when a reply ends tell it.
//   steer     the message (text only) is put into the reply being made, and the model sees it after its next tool answer (the reply's sink: the server's /steer, or the queue of a reply made
//             here). When the reply cannot take it (no loop with tools, a file or quote in the box, the server says no), this is send-now; a reply that cannot be steered at all (a council,
//             a picture) queues the message instead, so that nothing is stopped by accident.
//   queue     the message stays in the box and goes when the reply ends (unless the person stops the reply or empties the box).
//   send-now  the reply is stopped (what was written stays) and the message goes at once.

import { stopReplyAndWait } from './reply-stop.js';

export const REPLY_INPUT_MODES = Object.freeze(['steer', 'queue', 'send-now']);
export const normalizeReplyInputMode = (value) => (REPLY_INPUT_MODES.includes(value) ? value : 'steer');

const state = { deps: null, draft: false, text: '', queued: false, sink: null, pushing: false, left: [], leftStopped: false };

const sendNow = () => {
  const deps = state.deps;
  if (deps) void stopReplyAndWait({ getAbortController: deps.getAbortController }).then(() => deps.submitChatForm());
};

// The reply takes the message, or the reply is stopped and the message goes at once (the fall-back when nothing can take it).
const steerOrSendNow = async (text, sink) => {
  let kept = false;
  state.pushing = true;
  try {
    kept = Boolean(await sink.push(text));
  } catch {
    kept = false;
  }
  state.pushing = false;
  if (kept) {
    state.deps?.clearDraft?.(text);
    return;
  }
  sendNow();
};

export const replySteering = {
  /**
   * `getConfig()`, `getAbortController()` (the reply being made, or null), `submitChatForm()`, `isSteerable()` (a reply that a message may be put into), `onChange()` (draw the line and
   * the button again), `clearDraft(text)` (empties the box if it still holds that text) and `fillDraft(text)` (puts text in front of what is in the box).
   */
  configure(deps) {
    state.deps = deps;
    state.draft = false;
    state.text = '';
    state.queued = false;
    state.sink = null;
    state.left = [];
    state.leftStopped = false;
  },
  /** The reply being made takes messages: `sink.push(text)` resolves true when it kept the message. Told by the lifecycle of the reply; `detach` when it is over. */
  attach(sink) {
    state.sink = sink;
  },
  detach(sink) {
    if (state.sink === sink) state.sink = null;
  },
  /**
   * Told by the box whenever it changes: whether it holds a message (text, a file or a quote), and `text`: the words in it when that is all there is (no file, no quote; else ''), the only
   * kind of message that is put into a reply. An emptied box also drops a queued message.
   */
  setDraft(present, text = '') {
    state.text = String(text || '');
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
    if (state.queued || state.pushing) return true;
    const mode = normalizeReplyInputMode(deps.getConfig()?.replyInputMode);
    if (mode === 'queue' || (mode === 'steer' && !deps.isSteerable())) {
      state.queued = true;
      deps.onChange?.();
      return true;
    }
    const text = mode === 'steer' ? state.text.trim() : '';
    if (text && state.sink) {
      void steerOrSendNow(text, state.sink);
      return true;
    }
    sendNow();
    return true;
  },
  /**
   * Told as a reply ends: the messages put into it that it never reached a boundary for (`texts`), and whether the person stopped it. They go with the end of the reply (`onReplyEnded`).
   */
  hold(texts, { stopped = false } = {}) {
    state.left = (Array.isArray(texts) ? texts : []).map((text) => String(text ?? '').trim()).filter(Boolean);
    state.leftStopped = Boolean(stopped);
  },
  /**
   * Told when a reply is over: a queued message goes now (the person stopping the reply took it out of the queue). The messages the reply did not take go as the next message when the box is
   * empty; with something in the box they are put in front of it, and with a reply the person stopped they are put back in the box, to be sent or not.
   */
  onReplyEnded() {
    const deps = state.deps;
    if (!deps) return;
    const left = state.left.join('\n\n');
    const send = Boolean(left) && !state.draft && !state.leftStopped;
    state.left = [];
    state.leftStopped = false;
    if (left) deps.fillDraft?.(left);
    if (send) {
      setTimeout(() => deps.submitChatForm(), 0);
      return;
    }
    if (!state.queued) return;
    state.queued = false;
    deps.onChange?.();
    if (state.draft) setTimeout(() => deps.submitChatForm(), 0);
  }
};
