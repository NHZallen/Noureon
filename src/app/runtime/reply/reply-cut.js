// A reply the server cuts where the person's messages are taken (docs/superpowers/specs/2026-10-26-reply-steering-design.md §11): the message so far is finished and is a message of the
// conversation, the messages the person added come after it (the server wrote them too), and the reply goes on in a new message. This is the page's part: the person's messages are made
// into messages of the conversation, and the new message is followed like a reply the page comes back to (server-reply/reattach.js). One object for the page, set up once with `configure`.

import { createPendingSteers } from '../../ui/sandbox/steer-bubbles.js';

const state = { document: null, addMessageToUI: null, now: () => new Date().toISOString() };
const pendingSteers = createPendingSteers({ document: { createElement: (...args) => state.document.createElement(...args) } });

export const replyCut = {
  /** `document`; `addMessageToUI(message, index, shouldSave, shouldScroll, { conversation })` draws a message (and keeps it in the conversation when `shouldSave`). */
  configure({ document, addMessageToUI, now }) {
    state.document = document;
    state.addMessageToUI = addMessageToUI;
    if (now) state.now = now;
    pendingSteers.remove();
  },
  /** The bubbles of the messages the reply that is being made has not taken yet. */
  pending: pendingSteers,
  /**
   * The reply was cut: the person's messages become messages (those the cloud already gave this page are not made twice), and the reply is followed in its new message.
   * `continueReply(conversation, run, abortController)` follows it (server-reply/reattach.js). Resolves what that resolves.
   */
  async continueAfterCut({ conversation, cut, serverRun, abortController, continueReply }) {
    pendingSteers.remove(cut.users.map((user) => user.id));
    // What the reply has not taken yet waits under the message it goes on in, not between the messages that are made now.
    const waiting = pendingSteers.detach();
    for (const user of cut.users) {
      if (conversation.messages.some((message) => message.id === user.id)) continue;
      state.addMessageToUI({ id: user.id, role: 'user', parts: [{ text: user.text }], createdAt: state.now(), metadata: { steer: true } }, conversation.messages.length, true, true, { conversation });
    }
    // (The follower draws the message the reply goes on in before it first waits, and says where it is.)
    const following = continueReply(conversation, serverRun.inMessage(cut.next), abortController);
    pendingSteers.setPlace(() => conversation.__astraPendingResponse?.loadingMessageDiv || null);
    for (const item of waiting) pendingSteers.add(item);
    return following;
  }
};
