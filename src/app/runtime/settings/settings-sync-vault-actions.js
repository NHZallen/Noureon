// The buttons of the sync password part of the user page (settings-sync-vault-controls.js): create, unlock, recover by email, lock,
// change and remove the sync password that encrypts the API keys. Moved as they were; `ctx` holds the page's shared helpers.

import {
  cancelSyncVaultRotation,
  changeSyncVaultPassword,
  createAndUnlockSyncVault,
  getSyncVaultStorageKey,
  lockSyncVault,
  readSyncVaultRecord,
  removeSyncVault,
  unlockSyncVault
} from '../../sync/sync-vault.js';

export function bindSyncVaultActions(elements, {
  window, document, storage, getCurrentUser, showNotification, text, getSupabase, isBusy, setBusy, getAccountTurnstile, notifyError,
  setAccountMessage, authErrorText, requireMatchingPasswords, refreshSyncVaultControls, requestVaultRecovery, storeVaultRecovery,
  getRecoveryStorageKey, dispatchUnlocked, queueCloudSyncKind, setManageOpen
}) {
  elements.createButton.addEventListener('click', async () => {
    if (isBusy()) return;
    try {
      const user = getCurrentUser();
      if (user.authProvider !== 'supabase') throw new Error(text('cloudSyncRequiresCloudAccount', '請先綁定 Email 或 Google 帳號。'));
      requireMatchingPasswords(elements.createPassword.value, elements.createConfirmation.value);
      setBusy(true);
      const record = await createAndUnlockSyncVault({ storage, username: user.username, password: elements.createPassword.value });
      try {
        await storeVaultRecovery(elements.createPassword.value, record);
      } catch (error) {
        await removeSyncVault({ storage, username: user.username });
        throw error;
      }
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
  elements.forgotButton.addEventListener('click', async () => {
    if (isBusy()) return;
    const user = getCurrentUser();
    try {
      setBusy(true);
      const supabase = getSupabase();
      const { data, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      const email = data.user?.email;
      if (!email) throw new Error(text('recoveryEmailUnavailable', '此帳號沒有可用的 Email。'));
      const captchaToken = getAccountTurnstile()?.getToken('sync-vault-recovery');
      if (getAccountTurnstile()?.enabled && !captchaToken) throw new Error(text('turnstileRequired', '請先完成人機驗證。'));
      const recoveryState = window.crypto.randomUUID();
      await storage.setItem(getRecoveryStorageKey(user.username), recoveryState);
      const recoveryUrl = new URL(window.location.href);
      recoveryUrl.searchParams.set('vault_recovery', recoveryState);
      recoveryUrl.hash = '';
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: recoveryUrl.toString(),
          shouldCreateUser: false,
          captchaToken: captchaToken || undefined
        }
      });
      getAccountTurnstile()?.reset('sync-vault-recovery');
      if (error) throw error;
      setAccountMessage(text('cloudSyncRecoveryEmailSent', '重設驗證信已寄出，請從信件連結返回。'));
    } catch (error) {
      setAccountMessage(authErrorText(error) || error?.message || text('cloudSyncRecoveryFailed', '無法寄出重設驗證信。'), 'error');
    } finally {
      setBusy(false);
    }
  });
  elements.recoveryButton.addEventListener('click', async () => {
    if (isBusy()) return;
    const user = getCurrentUser();
    try {
      requireMatchingPasswords(elements.recoveryPassword.value, elements.recoveryConfirmation.value);
      setBusy(true);
      const recovered = await requestVaultRecovery('recover');
      await queueCloudSyncKind('vault');
      await storage.setItem(getSyncVaultStorageKey(user.username), JSON.stringify(recovered.record));
      await queueCloudSyncKind('vault');
      const nextRecord = await changeSyncVaultPassword({
        storage,
        username: user.username,
        currentPassword: recovered.password,
        nextPassword: elements.recoveryPassword.value
      });
      try {
        await storeVaultRecovery(elements.recoveryPassword.value, nextRecord, recovered.password);
      } catch (error) {
        await queueCloudSyncKind('vault');
        await storage.setItem(getSyncVaultStorageKey(user.username), JSON.stringify(recovered.record));
        await unlockSyncVault({ storage, username: user.username, password: recovered.password });
        await cancelSyncVaultRotation({ storage, username: user.username });
        await queueCloudSyncKind('sensitive');
        await queueCloudSyncKind('vault');
        throw error;
      }
      await storage.removeItem(getRecoveryStorageKey(user.username));
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('vault_recovery');
      window.history.replaceState({}, document.title, `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
      elements.recoveryPassword.value = '';
      elements.recoveryConfirmation.value = '';
      dispatchUnlocked(user.username);
      showNotification(text('cloudSyncPasswordReset', '同步密碼已重設，既有加密同步資料仍可繼續使用。'));
      await refreshSyncVaultControls();
    } catch (error) {
      notifyError(error);
    } finally {
      setBusy(false);
    }
  });
  elements.lockButton.addEventListener('click', async () => {
    const user = getCurrentUser();
    lockSyncVault(user.username);
    await refreshSyncVaultControls();
  });
  elements.changeButton.addEventListener('click', async () => {
    if (isBusy()) return;
    try {
      const user = getCurrentUser();
      requireMatchingPasswords(elements.nextPassword.value, elements.nextConfirmation.value);
      setBusy(true);
      const previousRecord = await readSyncVaultRecord(storage, user.username);
      const nextRecord = await changeSyncVaultPassword({
        storage,
        username: user.username,
        currentPassword: elements.currentPassword.value,
        nextPassword: elements.nextPassword.value
      });
      try {
        await storeVaultRecovery(elements.nextPassword.value, nextRecord, elements.currentPassword.value);
      } catch (error) {
        await queueCloudSyncKind('vault');
        await storage.setItem(getSyncVaultStorageKey(user.username), JSON.stringify(previousRecord));
        await unlockSyncVault({ storage, username: user.username, password: elements.currentPassword.value });
        await cancelSyncVaultRotation({ storage, username: user.username });
        await queueCloudSyncKind('sensitive');
        await queueCloudSyncKind('vault');
        throw error;
      }
      elements.currentPassword.value = '';
      elements.nextPassword.value = '';
      elements.nextConfirmation.value = '';
      dispatchUnlocked(user.username);
      showNotification(text('cloudSyncPasswordChanged', '同步密碼已變更。'));
      setManageOpen(false);
      await refreshSyncVaultControls();
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
      await requestVaultRecovery('delete', { currentPassword });
    } catch (error) {
      notifyError(error);
      return;
    }
    elements.currentPassword.value = '';
    await removeSyncVault({ storage, username: user.username });
    await queueCloudSyncKind('vault');
    await queueCloudSyncKind('sensitive');
    showNotification(text('cloudSyncPasswordRemoved', '同步密碼已清除。'));
    await refreshSyncVaultControls();
  });
}
