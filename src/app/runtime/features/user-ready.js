// The page tells the parts that draw things about the person (the round picture of the account, see ui/user-avatar/) who is signed in: the event
// `noureon:user-ready` on the document, with `detail.user`. Sent when the chat starts and every time the User tab is refreshed; a part decides by itself
// whether it has anything to do (and asks the database only when it must). Nothing here fails when the document cannot send events (a test).

import { setOpenAiUserId } from '../reply/openai-request.js';

export const USER_READY_EVENT = 'noureon:user-ready';

// The last person announced: a part that is loaded after the page has started asks for it, because it missed the event.
let announced = null;
export const getAnnouncedUser = () => announced;

export function announceUser(document, user) {
  announced = user || null;
  // OpenAI's anonymous identifier is made from the account (reply/openai-request.js).
  setOpenAiUserId(user?.supabaseUserId || user?.username || '');
  try {
    const Event = document?.defaultView?.CustomEvent || globalThis.CustomEvent;
    if (typeof document?.dispatchEvent === 'function' && typeof Event === 'function') document.dispatchEvent(new Event(USER_READY_EVENT, { detail: { user } }));
  } catch (error) {
    globalThis.console?.warn?.('The page could not tell who is signed in.', error);
  }
}
