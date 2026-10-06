// What the app does at load time with the split workspace (workspace-store-v2.js): choose where this user's workspace lives, remember the
// store for the cloud sync and the saves, and hand back the workspace, normalized, when it lives in the split store.

import { normalizeLoadedLegacyAppData } from './app-data-normalization.js';
import { isWorkspaceV2Enabled, readWorkspaceV2Request, selectWorkspaceStorage } from './workspace-storage-selection.js';
import { setActiveWorkspaceStore } from './workspace-store-registry.js';

const emptyWorkspace = () => ({ conversations: [], folders: [], astras: [], personalMemories: [] });

// `user` is the signed-in user, `context` what the normalization needs from legacy-core.js. Returns { data } (the normalized workspace) when the user's workspace lives in the split store, or null when the old single item is
// to be used. A store whose records could not all be read still loads what it can: the damaged records stay in storage, untouched.
export async function loadSplitWorkspace({ storage, user, context, logger = console } = {}) {
  const username = user.username;
  // The old single item (the same key as getAppDataKey in legacy-core.js).
  const legacyKey = `chatAppData_v8.6_${username}`;
  const request = readWorkspaceV2Request();
  const selection = await selectWorkspaceStorage({ storage, username, legacyKey, enabled: isWorkspaceV2Enabled(), request, logger });
  setActiveWorkspaceStore(username, selection.mode === 'v2' ? selection.store : null);
  // For diagnosis from the console: which storage is in use, and why.
  globalThis.__noureonWorkspaceStorage = {
    mode: selection.mode,
    reason: selection.reason || null,
    problems: selection.loaded?.problems || [],
    migrationAttempts: selection.migration?.attempts || 0,
    rollbackFailed: Boolean(selection.rollback && selection.rollback.state !== 'exported')
  };
  if (selection.mode !== 'v2') return null;
  if (selection.loaded?.state === 'degraded') {
    logger.warn?.('Some conversations could not be read from the split workspace; they are kept in storage.', selection.loaded.problems);
  }
  // A good load counts towards removing the old frozen item (after 30 days and 10 good loads; see recordSuccessfulLoad). Never fatal, and
  // not waited for: the workspace is handed to the app first.
  if (selection.loaded?.state === 'ready') {
    selection.store.recordSuccessfulLoad({ legacyKey }).catch(error => logger.warn?.('The old storage item could not be checked for removal.', error));
  }
  if (!selection.loaded?.workspace) return { data: emptyWorkspace() };
  // The same normalization the old single item goes through (legacy-core.js), with what it needs from there.
  return {
    data: normalizeLoadedLegacyAppData({
      rawData: selection.loaded.workspace,
      defaultFolder: context.getDefaultFolder(),
      defaultGenConfig: context.getDefaultGenConfig(),
      lastCouncilConfig: context.runtimeConfigAccess.getConfig().lastCouncilConfig,
      normalizeCouncilConfig: context.normalizeCouncilConfig,
      normalizeConversationModel: context.normalizeConversationModel
    })
  };
}
