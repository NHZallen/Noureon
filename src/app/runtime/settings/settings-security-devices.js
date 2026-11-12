// "Sign out of other devices" on the security page: every other device that is signed in to the account is signed out (this one stays), so someone who got in with a
// stolen sign-in is out, and a device that was lost stops working. It is one of the actions that ask the person to confirm (settings-identity-confirmation.js), and it
// tells the owner by mail (server/security-notices.js).

export function createDevicesControls({ window, getSupabase, getCurrentUser, getElements, text, showNotification, notifyError, confirmIdentity, notifySecurity = () => {} }) {
  const isCloud = () => getCurrentUser?.()?.authProvider === 'supabase';

  function refresh() {
    getElements().devicesCard?.classList.toggle('hidden', !isCloud());
  }

  async function signOutOthers() {
    if (!window.confirm(text('securityDevicesConfirm', '其他所有裝置都會登出，要用 Email 或 Google 重新登入。這台裝置不受影響。確定要繼續嗎？'))) return;
    if (!await confirmIdentity()) return;
    const { error } = await getSupabase().auth.signOut({ scope: 'others' });
    if (error) throw error;
    notifySecurity('signed-out-others');
    showNotification(text('securityDevicesDone', '已登出其他所有裝置。'));
  }

  function bind() {
    const button = getElements().signOutOthersButton;
    if (!button || button.dataset.bound === 'true') return;
    button.dataset.bound = 'true';
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      button.disabled = true;
      try { await signOutOthers(); } catch (error) { notifyError(error); } finally { button.disabled = false; }
    });
  }

  return { bind, refresh };
}
