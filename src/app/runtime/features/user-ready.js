// The page tells the parts that draw things about the person (the round picture of the account, see ui/user-avatar/) who is signed in: the event
// `noureon:user-ready` on the document, with `detail.user`. Sent when the chat starts and every time the User tab is refreshed; a part decides by itself
// whether it has anything to do (and asks the database only when it must). Nothing here fails when the document cannot send events (a test).

export const USER_READY_EVENT = 'noureon:user-ready';

export function announceUser(document, user) {
  try {
    const Event = document?.defaultView?.CustomEvent || globalThis.CustomEvent;
    if (typeof document?.dispatchEvent === 'function' && typeof Event === 'function') document.dispatchEvent(new Event(USER_READY_EVENT, { detail: { user } }));
  } catch (error) {
    globalThis.console?.warn?.('The page could not tell who is signed in.', error);
  }
}
