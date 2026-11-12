// Tells the person, once per visit, that the API keys kept on this device cannot be read (security/local-key-seal.js: the key of the device is gone, for example
// because the browser cleared part of its data). The keys are read as missing; the person gets them back from the cloud (when the sync vault is open) or types them again.

import { localKeysWereUnreadable } from './local-key-rules.js';

export function startLocalKeyNotice({ window, getText, showNotification }) {
  let told = false;
  const tell = () => {
    if (told) return;
    told = true;
    showNotification(getText('localKeysUnreadable', 'API 金鑰讀不到，請重新輸入。'), 'error');
  };
  window?.addEventListener?.('noureon:local-keys-unreadable', tell);
  // A key that was found unreadable before this started is told now.
  if (localKeysWereUnreadable()) tell();
}
