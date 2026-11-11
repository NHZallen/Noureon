// The page tells the parts that draw things about the person (the round picture of the account, see ui/user-avatar/) who is signed in: the event
// `noureon:user-ready` on the document, with `detail.user`. Sent when the chat starts and every time the User tab is refreshed; a part decides by itself
// whether it has anything to do (and asks the database only when it must). Nothing here fails when the document cannot send events (a test).

import { setOpenAiUserId } from '../reply/openai-request.js';

export const USER_READY_EVENT = 'noureon:user-ready';

// The last person announced: a part that is loaded after the page has started asks for it, because it missed the event.
let announced = null;
let known = false;
export const getAnnouncedUser = () => announced;
/** Whether the page has told yet who is signed in (before that, "nobody" means "not known yet", not "signed out"). */
export const isAccountKnown = () => known;
/** Whether a cloud account is signed in: the person's sign-in, whatever the state of the conversation sync (it is starting, retrying or stopped for a moment without the person being signed out). */
export const hasCloudAccount = () => Boolean(announced?.supabaseUserId);

export function announceUser(document, user) {
  announced = user || null;
  known = true;
  // OpenAI's anonymous identifier is made from the account (reply/openai-request.js).
  setOpenAiUserId(user?.supabaseUserId || user?.username || '');
  try {
    const Event = document?.defaultView?.CustomEvent || globalThis.CustomEvent;
    if (typeof document?.dispatchEvent === 'function' && typeof Event === 'function') document.dispatchEvent(new Event(USER_READY_EVENT, { detail: { user } }));
  } catch (error) {
    globalThis.console?.warn?.('The page could not tell who is signed in.', error);
  }
}
