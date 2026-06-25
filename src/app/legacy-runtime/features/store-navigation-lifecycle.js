export function createStoreNavigationLifecycle({
  getOpenStoreButton,
  getBackToChatButton,
  openStore,
  closeStore
} = {}) {
  const bind = () => {
    getOpenStoreButton().addEventListener('click', openStore);
    getBackToChatButton().addEventListener('click', closeStore);
  };

  return { bind };
}
