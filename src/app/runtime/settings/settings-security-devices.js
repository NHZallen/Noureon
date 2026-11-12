// "Signed-in devices" on the security page: a row that opens the list of the devices that are signed in to the account (the browser and kind of device, when it was last used, the
// address it came from), each with a button that signs that one out, and one button that signs out all of them, this one too. The list and the single sign-out are two functions of
// the database (supabase/migrations/20261112110000_list_and_revoke_my_sessions.sql: the table of the sign-in service cannot be read by the person's role); signing out of all
// devices is the sign-in service's own `signOut({ scope: 'global' })`. Signing out is one of the actions that ask the person to confirm (settings-identity-confirmation.js), and
// each one tells the owner by mail (server/security-notices.js).

import { deviceName } from '../security/device-name.js';
import { createRowIconButton } from './settings-row-menu.js';

// The sign-out glyph (a door and an arrow), as the apps of the big vendors draw it at the right of a device.
const SIGN_OUT_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><path d="M16 17l5-5-5-5"></path><path d="M21 12H9"></path></svg>';

export function createDevicesControls({
  window, storage, getSupabase, getCurrentUser, getElements, text, showNotification, notifyError, confirmIdentity, notifySecurity = () => {},
  reloadPage = () => window.location.reload(), scheduleTimeout = (callback, delay) => window.setTimeout(callback, delay)
}) {
  let open = false;
  const isCloud = () => getCurrentUser?.()?.authProvider === 'supabase';
  const when = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleString(window.document?.documentElement?.lang || undefined, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  function render(rows) {
    const list = getElements().devicesList;
    list.textContent = '';
    for (const row of rows) {
      const item = window.document.createElement('li');
      item.className = 'us-pk';
      item.dataset.sessionId = row.id;
      const block = window.document.createElement('span');
      block.className = 'us-pk-text';
      const name = window.document.createElement('span');
      name.className = 'us-pk-name';
      name.textContent = deviceName(row.user_agent);
      const sub = window.document.createElement('span');
      sub.className = 'us-pk-sub';
      sub.textContent = [row.is_current ? text('securityDevicesThisDevice', '這台裝置') : when(row.last_active_at), row.ip].filter(Boolean).join(' · ');
      block.append(name, sub);
      item.append(block);
      if (!row.is_current) {
        item.append(createRowIconButton({
          document: window.document,
          label: text('securityDevicesSignOutOne', '登出'),
          icon: SIGN_OUT_ICON,
          action: 'sign-out'
        }));
      }
      list.append(item);
    }
  }

  async function load() {
    const { data, error } = await getSupabase().rpc('list_my_sessions');
    if (error) throw error;
    render(Array.isArray(data) ? data : []);
  }

  async function refresh() {
    const elements = getElements();
    elements.devicesCard?.classList.toggle('hidden', !isCloud());
    if (isCloud() && open) await load();
  }

  async function signOutOne(sessionId) {
    if (!window.confirm(text('securityDevicesConfirmOne', '登出這個裝置？它要重新登入才能再使用。'))) return;
    if (!await confirmIdentity()) return;
    const { data, error } = await getSupabase().rpc('revoke_my_session', { p_session_id: sessionId });
    if (error) throw error;
    if (data) {
      notifySecurity('device-signed-out');
      showNotification(text('securityDevicesDoneOne', '已登出這個裝置。'));
    } else {
      showNotification(text('securityDevicesGone', '這個裝置已經不在登入清單裡了。'), 'error');
    }
    await load();
  }

  async function signOutAll() {
    if (!window.confirm(text('securityDevicesConfirmAll', '所有裝置都會登出，包含這台，要用 Email 或 Google 重新登入。確定要繼續嗎？'))) return;
    if (!await confirmIdentity()) return;
    const { error } = await getSupabase().auth.signOut({ scope: 'global' });
    if (error) throw error;
    notifySecurity('signed-out-all');
    // This device too: it is forgotten here, and the page loads again and asks for a sign-in.
    await storage.removeItem('chat_lastUser');
    showNotification(text('securityDevicesDoneAll', '所有裝置都已登出，正在重新載入。'));
    scheduleTimeout(reloadPage, 1500);
  }

  const guard = (task) => async (event) => {
    event?.preventDefault?.();
    try { await task(); } catch (error) { notifyError(error); }
  };

  function bind() {
    const elements = getElements();
    if (!elements.devicesToggle || elements.devicesToggle.dataset.bound === 'true') return;
    elements.devicesToggle.dataset.bound = 'true';
    elements.devicesToggle.addEventListener('click', guard(async () => {
      open = !open;
      elements.devicesToggle.setAttribute('aria-expanded', String(open));
      elements.devicesPanel.classList.toggle('hidden', !open);
      if (open) await load();
    }));
    elements.devicesList.addEventListener('click', (event) => {
      const target = event.target.closest?.('[data-action="sign-out"]');
      const id = target?.closest('[data-session-id]')?.dataset.sessionId;
      if (id) guard(() => signOutOne(id))(event);
    });
    elements.signOutAllButton.addEventListener('click', guard(signOutAll));
  }

  return { bind, refresh };
}
