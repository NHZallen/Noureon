// Starts the sharing of projects for the page (docs/superpowers/specs/2026-11-06-project-sharing-design.md): the page of the members and the invitations (opened by the event
// `noureon:project-members` from the menu of a project) and the invitation a person opens (noureon.com/join/<code>, kept by the start of the page until a signed-in cloud account is ready).
// It is loaded after the page; a reply never waits for it.

import { getAnnouncedUser, USER_READY_EVENT } from '../features/user-ready.js';
import { getSupabaseClient } from '../../auth/supabase-client.js';
import { SERVICES, getService } from '../services.js';
import { createProjectShareClient } from './project-share-client.js';
import { clearPendingJoin, readPendingJoin } from './join-route.js';

export const MEMBERS_EVENT = 'noureon:project-members';

const nameOf = (user) => {
  const candidate = String(user?.displayName || user?.username || '').trim();
  return candidate && !candidate.includes('@') ? candidate : '';
};

export function startProjectSharing({ document, window = globalThis.window, configAccess, dataStore, i18n, saveAppData, showNotification, supabase = null, client = null, storage = null, copyText = null }) {
  const getSupabase = () => { if (supabase) return supabase; try { return getSupabaseClient(); } catch { return null; } };
  const shareClient = client || createProjectShareClient({ getSupabase });
  const text = (key, values = {}) => {
    const table = i18n[configAccess.getUiLanguage()] || i18n['zh-TW'] || {};
    return String(table[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => (values[name] ?? ''));
  };
  const cloudOn = () => getService(SERVICES.cloudSync)?.getStatus?.()?.enabled === true;
  const pendingStorage = () => { try { return storage || window.localStorage; } catch { return null; } };
  const copy = copyText || (async (value) => { try { await window.navigator.clipboard.writeText(value); return true; } catch { return false; } });
  let stylesLoaded = null;
  const ensureStyles = () => (stylesLoaded ||= Promise.all([import('../../../styles/projects.css'), import('../../../styles/project-sharing.css')]).catch(() => {}));

  async function openMembers({ projectId, root = null }) {
    const folder = (dataStore.getFolders() || []).find((entry) => entry.id === projectId);
    if (!folder) return null;
    if (!cloudOn()) { showNotification(text('psNeedCloud'), 'error'); return null; }
    await ensureStyles();
    const { openMembersPanel } = await import('../../ui/projects/project-members-panel.js');
    return openMembersPanel({
      document, root: root || document.body, text, client: shareClient, project: { id: folder.id, name: folder.name },
      inviterName: nameOf(getAnnouncedUser()), origin: window.location?.origin || '', copy, notify: showNotification,
      // The folder the page keeps has the memory the database has now (a stale copy written back could not undo it: the database keeps it, but the page should show it too).
      onShared: async () => { folder.memoryScope = 'project'; try { await saveAppData({ immediateCloudSync: true }); } catch { /* the next save carries it */ } }
    });
  }

  let joining = false;
  async function takePending() {
    const storageArea = pendingStorage();
    const code = storageArea ? readPendingJoin(storageArea) : '';
    if (!code || joining) return;
    const user = getAnnouncedUser();
    if (!user) return; // not signed in yet: the code stays for after the login
    if (!user.supabaseUserId) { clearPendingJoin(storageArea); showNotification(text('psJoinNeedCloud'), 'error'); return; }
    if (!cloudOn()) return; // the cloud account is still starting
    joining = true;
    try {
      const invite = await shareClient.invite(code);
      clearPendingJoin(storageArea);
      if (!invite.ok || !invite.data) { showNotification(text('psJoinInvalid'), 'error'); return; }
      await ensureStyles();
      const { openJoinDialog } = await import('../../ui/projects/project-join-dialog.js');
      await openJoinDialog({ document, root: document.body, text, client: shareClient, code, invite: invite.data, notify: showNotification });
    } catch {
      showNotification(text('psFailed'), 'error');
    } finally { joining = false; }
  }
  // The account may take a moment to be ready after the page opens or after the login: look a few times.
  const lookForPending = () => { for (const wait of [0, 2000, 6000, 15000, 30000]) setTimeout(() => { void takePending(); }, wait); };
  lookForPending();

  document.addEventListener(MEMBERS_EVENT, (event) => { void openMembers({ projectId: String(event.detail?.projectId || ''), root: event.detail?.root || null }); });
  document.addEventListener(USER_READY_EVENT, () => { const area = pendingStorage(); if (area && readPendingJoin(area)) lookForPending(); });
  return { openMembers, takePending };
}
