// "Sign out of other devices" and "Sign out of all devices" on the security page. The first signs out every other device that is signed in to the account (this one stays), so someone
// who got in with a stolen sign-in is out and a device that was lost stops working. The second signs out this one too: the page loads again and asks for a sign-in. Both are
// actions that ask the person to confirm (settings-identity-confirmation.js), and both tell the owner by mail (server/security-notices.js).

export function createDevicesControls({
  window, storage, getSupabase, getCurrentUser, getElements, text, showNotification, notifyError, confirmIdentity, notifySecurity = () => {},
  reloadPage = () => window.location.reload(), scheduleTimeout = (callback, delay) => window.setTimeout(callback, delay)
}) {
  const isCloud = () => getCurrentUser?.()?.authProvider === 'supabase';

  function refresh() {
    getElements().devicesCard?.classList.toggle('hidden', !isCloud());
  }

  async function signOut(scope) {
    const all = scope === 'global';
    if (!window.confirm(all
      ? text('securityDevicesConfirmAll', '所有裝置都會登出，包含這台，要用 Email 或 Google 重新登入。確定要繼續嗎？')
      : text('securityDevicesConfirm', '其他所有裝置都會登出，要用 Email 或 Google 重新登入。這台裝置不受影響。確定要繼續嗎？'))) return;
    if (!await confirmIdentity()) return;
    const { error } = await getSupabase().auth.signOut({ scope });
    if (error) throw error;
    notifySecurity(all ? 'signed-out-all' : 'signed-out-others');
    if (!all) {
      showNotification(text('securityDevicesDone', '已登出其他所有裝置。'));
      return;
    }
    // This device too: it is forgotten here, and the page loads again and asks for a sign-in.
    await storage.removeItem('chat_lastUser');
    showNotification(text('securityDevicesDoneAll', '所有裝置都已登出，正在重新載入。'));
    scheduleTimeout(reloadPage, 1500);
  }

  function bind() {
    const elements = getElements();
    for (const [button, scope] of [[elements.signOutOthersButton, 'others'], [elements.signOutAllButton, 'global']]) {
      if (!button || button.dataset.bound === 'true') continue;
      button.dataset.bound = 'true';
      button.addEventListener('click', async (event) => {
        event.preventDefault();
        button.disabled = true;
        try { await signOut(scope); } catch (error) { notifyError(error); } finally { button.disabled = false; }
      });
    }
  }

  return { bind, refresh };
}
