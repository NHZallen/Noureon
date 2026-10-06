/** The address of the Nouras store: noureon.com/nouras while it is open (a refresh, a bookmark or a shared link comes back to it), noureon.com when it is closed. */
export const NOURAS_STORE_PATH = '/nouras';

export function createStoreNavigationLifecycle({
  getOpenStoreButton,
  getBackToChatButton,
  openStore,
  closeStore,
  win = globalThis.window
} = {}) {
  const history = win?.history;
  const atStore = () => win?.location?.pathname === NOURAS_STORE_PATH;
  let isOpen = false;
  // Opening adds /nouras to the history (the browser's back button closes the store); when the store was opened by the address itself
  // there is nothing to go back to, so closing puts / in its place.
  let pushed = false;

  const show = () => {
    if (isOpen) return;
    isOpen = true;
    openStore();
  };
  const hide = () => {
    if (!isOpen) return;
    isOpen = false;
    closeStore();
  };

  const open = () => {
    show();
    try {
      if (history && win.location && !atStore()) {
        history.pushState({ nourasStore: true }, '', NOURAS_STORE_PATH);
        pushed = true;
      }
    } catch { /* the address cannot be changed here: the store works without it */ }
  };

  const close = () => {
    hide();
    try {
      if (!history || !win.location || !atStore()) return;
      if (pushed && history.state?.nourasStore) history.back();
      else history.replaceState(history.state, '', '/');
    } catch { /* the address stays */ }
    pushed = false;
  };

  const bind = () => {
    getOpenStoreButton().addEventListener('click', open);
    getBackToChatButton().addEventListener('click', close);
    win?.addEventListener?.('popstate', () => {
      if (atStore()) show();
      else hide();
    });
    // The address noureon.com/nouras opens the store.
    if (atStore()) show();
  };

  return { bind, open, close };
}
