// What the app does at load time with the split workspace (workspace-store-v2.js): choose where this user's workspace lives, remember the
// store for the cloud sync and the saves, and hand back the workspace, normalized, when it lives in the split store.

import { normalizeConversationRecord, normalizeLoadedLegacyAppData } from './app-data-normalization.js';
import { refreezeStubs } from './conversation-stub.js';
import { conversationStubFlags } from './conversation-stub-flags.js';
import { isOnDemandLoadingEnabled, isWorkspaceV2Enabled, readWorkspaceV2Request, selectWorkspaceStorage } from './workspace-storage-selection.js';
import { setActiveWorkspaceStore } from './workspace-store-registry.js';

const emptyWorkspace = () => ({ conversations: [], folders: [], astras: [], personalMemories: [] });

// `user` is the signed-in user, `context` what the normalization needs from shell.js. Returns { data } (the normalized workspace) when the user's workspace lives in the split store, or null when the old single item is
// to be used. A store whose records could not all be read still loads what it can: the damaged records stay in storage, untouched.
export async function loadSplitWorkspace({ storage, user, context, logger = console } = {}) {
  const username = user.username;
  // The old single item (the same key as getAppDataKey in shell.js).
  const legacyKey = `chatAppData_v8.6_${username}`;
  const request = readWorkspaceV2Request();
  const onDemand = isOnDemandLoadingEnabled();
  const selection = await selectWorkspaceStorage({ storage, username, legacyKey, enabled: isWorkspaceV2Enabled(), request, logger, onDemand, stubFlags: conversationStubFlags });
  setActiveWorkspaceStore(username, selection.mode === 'v2' ? selection.store : null);
  // For diagnosis from the console: which storage is in use, and why.
  globalThis.__noureonWorkspaceStorage = {
    mode: selection.mode,
    reason: selection.reason || null,
    problems: selection.loaded?.problems || [],
    migrationAttempts: selection.migration?.attempts || 0,
    // On-demand loading: how many conversations came as stubs and how many had to be read whole (a stub that is not of the stored version is not used).
    stubCount: selection.loaded?.stubCount ?? null,
    fullCount: selection.loaded?.fullCount ?? null,
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
  // The same normalization the old single item goes through (shell.js), with what it needs from there.
  const normalizeOptions = {
    defaultGenConfig: context.getDefaultGenConfig(),
    lastCouncilConfig: context.runtimeConfigAccess.getConfig().lastCouncilConfig,
    normalizeCouncilConfig: context.normalizeCouncilConfig,
    normalizeConversationModel: context.normalizeConversationModel
  };
  const data = normalizeLoadedLegacyAppData({
    rawData: selection.loaded.workspace,
    defaultFolder: context.getDefaultFolder(),
    ...normalizeOptions
  });
  // Normalizing gives a stub a new empty list of messages; it goes back to the frozen one, so that reading it is an error that shows.
  if (onDemand) refreezeStubs(data.conversations);
  return {
    data,
    // Set when the conversations came as stubs: the store they are read from, and how a stored conversation is made what the app uses.
    ...(onDemand ? { onDemand: { store: selection.store, normalizeRecord: record => normalizeConversationRecord(record, normalizeOptions) } } : {})
  };
}
