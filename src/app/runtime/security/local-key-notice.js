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
  // A key is needed while the keys on this device are locked (security/local-key-runtime.js): nothing opens a dialog; the text says where to unlock them.
  let toldLocked = 0;
  window?.addEventListener?.('noureon:local-keys-need-unlock', () => {
    const at = Date.now();
    if (at - toldLocked < 4000) return;
    toldLocked = at;
    showNotification(getText('keyguardNeedUnlock', '本機 API 金鑰已鎖定。請到「設定 › 安全性與登入」解鎖同步保險庫（同步密碼或通行金鑰），再試一次。'), 'error');
  });
  // A key that was found unreadable before this started is told now.
  if (localKeysWereUnreadable()) tell();
}
