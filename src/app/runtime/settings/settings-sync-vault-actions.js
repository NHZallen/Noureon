// The buttons of the sync password part of the user page (settings-sync-vault-controls.js): create, unlock, recover with a passkey, start over, lock,
// change and remove the sync password that encrypts the API keys. `ctx` holds the page's shared helpers.

import {
  changeSyncVaultPassword,
  createAndUnlockSyncVault,
  lockSyncVault,
  openSyncVaultRecordKeyBytes,
  readSyncVaultRecord,
  removeSyncVault,
  resetSyncVaultPasswordWithKeyBytes,
  unlockSyncVault
} from '../../sync/sync-vault.js';

export function bindSyncVaultActions(elements, {
  window, storage, getCurrentUser, showNotification, text, isBusy, setBusy, notifyError, requireMatchingPasswords, refreshSyncVaultControls, recoveryStore,
  setRecoveryOpen, confirmIdentity, notifySecurity, passkeys, dispatchUnlocked, queueCloudSyncKind, setManageOpen
}) {
  // A form folds away or a panel changes and what is below moves up under the same place of the page: the person is taken back to the sync password, where the result is.
  const stayAtSync = () => elements.status?.scrollIntoView?.({ block: 'center' });
  elements.createButton.addEventListener('click', async () => {
    if (isBusy()) return;
    try {
      const user = getCurrentUser();
      if (user.authProvider !== 'supabase') throw new Error(text('cloudSyncRequiresCloudAccount', '請先綁定 Email 或 Google 帳號。'));
      requireMatchingPasswords(elements.createPassword.value, elements.createConfirmation.value);
      setBusy(true);
      await createAndUnlockSyncVault({ storage, username: user.username, password: elements.createPassword.value });
      elements.createPassword.value = '';
      elements.createConfirmation.value = '';
      dispatchUnlocked(user.username);
      showNotification(text('cloudSyncPasswordCreated', '同步密碼已建立，保險庫已解鎖。'));
      await refreshSyncVaultControls();
    } catch (error) {
      notifyError(error);
    } finally {
      setBusy(false);
    }
  });
  elements.unlockButton.addEventListener('click', async () => {
    if (isBusy()) return;
    try {
      const user = getCurrentUser();
      setBusy(true);
      await unlockSyncVault({ storage, username: user.username, password: elements.unlockPassword.value });
      elements.unlockPassword.value = '';
      dispatchUnlocked(user.username);
      showNotification(text('cloudSyncUnlockedNotice', '雲端同步已解鎖。'));
      await refreshSyncVaultControls();
    } catch (error) {
      notifyError(error);
    } finally {
      setBusy(false);
    }
  });
  // The daily unlock with a passkey instead of the sync password.
  elements.unlockPasskeyButton?.addEventListener('click', async () => {
    if (isBusy()) return;
    try {
      const user = getCurrentUser();
      setBusy(true);
      await passkeys.unlockWithPasskey();
      dispatchUnlocked(user.username);
      showNotification(text('cloudSyncUnlockedNotice', '雲端同步已解鎖。'));
      await refreshSyncVaultControls();
      stayAtSync();
    } catch (error) {
      notifyError(error);
    } finally {
      setBusy(false);
    }
  });
  // Forgot the sync password: the way back is a passkey (it opens a slot with the data key, and a new password wraps that key) or starting over.
  // Nothing is sent by Email: the passkey is the proof, and starting over asks the person to confirm like any change that is hard to undo.
  elements.forgotButton.addEventListener('click', async () => {
    setRecoveryOpen(true);
    await refreshSyncVaultControls();
    elements.recoveryPanel.scrollIntoView?.({ block: 'center' });
  });
  elements.recoveryCancelButton?.addEventListener('click', async () => {
    setRecoveryOpen(false);
    elements.recoveryPassword.value = '';
    elements.recoveryConfirmation.value = '';
    await refreshSyncVaultControls();
  });
  elements.recoveryPasskeyButton?.addEventListener('click', async () => {
    if (isBusy()) return;
    const user = getCurrentUser();
    try {
      requireMatchingPasswords(elements.recoveryPassword.value, elements.recoveryConfirmation.value);
      if (!await confirmIdentity({ onlyIfSet: true })) return;
      setBusy(true);
      await resetSyncVaultPasswordWithKeyBytes({ storage, username: user.username, keyBytes: await passkeys.openKey(), nextPassword: elements.recoveryPassword.value });
      await queueCloudSyncKind('vault');
      setRecoveryOpen(false);
      elements.recoveryPassword.value = '';
      elements.recoveryConfirmation.value = '';
      dispatchUnlocked(user.username);
      notifySecurity('sync-password-reset');
      showNotification(text('cloudSyncPasswordReset', '同步密碼已重設，既有加密同步資料仍可繼續使用。'));
      await refreshSyncVaultControls();
      stayAtSync();
    } catch (error) {
      notifyError(error);
    } finally {
      setBusy(false);
    }
  });
  // No way back into the vault (the password is forgotten and nothing else can open it): start over. The person confirms (the authenticator app's six digits when
  // one is set up, else a passkey tap); the cloud's vault record and its encrypted API keys are cleared, and the person makes a new sync password and enters the keys
  // again. Conversations and the rest are not in the vault.
  elements.startOverButton.addEventListener('click', async () => {
    if (isBusy()) return;
    if (!window.confirm(text('cloudSyncStartOverConfirm', '重新開始會清除雲端上的同步密碼和已同步的 API 金鑰，之後要設新的同步密碼，並在各裝置重新輸入 API 金鑰。對話和其他資料不受影響。確定要繼續嗎？'))) return;
    const user = getCurrentUser();
    try {
      if (!await confirmIdentity()) return;
      setBusy(true);
      await recoveryStore.remove();
      await removeSyncVault({ storage, username: user.username });
      await queueCloudSyncKind('vault');
      await queueCloudSyncKind('sensitive');
      setRecoveryOpen(false);
      elements.recoveryPassword.value = '';
      elements.recoveryConfirmation.value = '';
      notifySecurity('sync-started-over');
      showNotification(text('cloudSyncStartedOver', '已重新開始。請建立新的同步密碼。'));
      await refreshSyncVaultControls();
      stayAtSync();
    } catch (error) {
      notifyError(error);
    } finally {
      setBusy(false);
    }
  });
  elements.lockButton.addEventListener('click', async () => {
    const user = getCurrentUser();
    lockSyncVault(user.username, { storage });
    await refreshSyncVaultControls();
  });
  elements.changeButton.addEventListener('click', async () => {
    if (isBusy()) return;
    try {
      const user = getCurrentUser();
      requireMatchingPasswords(elements.nextPassword.value, elements.nextConfirmation.value);
      setBusy(true);
      // The passkeys' slots hold the data key of the vault, which does not change: only the wrap of the sync password does.
      await changeSyncVaultPassword({
        storage,
        username: user.username,
        currentPassword: elements.currentPassword.value,
        nextPassword: elements.nextPassword.value
      });
      elements.currentPassword.value = '';
      elements.nextPassword.value = '';
      elements.nextConfirmation.value = '';
      dispatchUnlocked(user.username);
      notifySecurity('sync-password-changed');
      showNotification(text('cloudSyncPasswordChanged', '同步密碼已變更。'));
      setManageOpen(false);
      await refreshSyncVaultControls();
      stayAtSync();
    } catch (error) {
      notifyError(error);
    } finally {
      setBusy(false);
    }
  });
  elements.resetButton.addEventListener('click', async () => {
    const currentPassword = elements.currentPassword.value;
    if (!currentPassword) {
      notifyError(new Error(text('cloudSyncCurrentPasswordRequired', '請在「目前同步密碼」輸入現在的同步密碼。忘記的話，請用「忘記同步密碼」。')));
      elements.currentPassword.focus?.();
      return;
    }
    if (!window.confirm(text('cloudSyncPasswordResetConfirm', '清除同步密碼後，既有加密資料將無法解密。確定要繼續嗎？'))) return;
    const user = getCurrentUser();
    try {
      // The password is the right one, or this throws: whoever only has the session cannot clear it.
      await openSyncVaultRecordKeyBytes(currentPassword, await readSyncVaultRecord(storage, user.username));
      if (!await confirmIdentity()) return;
      await recoveryStore.remove();
    } catch (error) {
      notifyError(error);
      return;
    }
    elements.currentPassword.value = '';
    await removeSyncVault({ storage, username: user.username });
    await queueCloudSyncKind('vault');
    await queueCloudSyncKind('sensitive');
    notifySecurity('sync-password-cleared');
    showNotification(text('cloudSyncPasswordRemoved', '同步密碼已清除。'));
    await refreshSyncVaultControls();
    stayAtSync();
  });
}
