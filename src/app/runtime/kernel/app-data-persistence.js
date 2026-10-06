import { withWorkspaceStorageExclusive } from '../../sync/workspace-storage-coordinator.js';
import {
  diffCloudSyncWorkspaceEntities,
  getCloudSyncJournalKey,
  markCloudSyncJournalDirty,
  normalizeCloudSyncJournal
} from '../../sync/cloud-sync-journal.js';
import { createPersistableAppDataSnapshot } from '../features/temporary-chat-state.js';
import { getActiveWorkspaceStore } from './workspace-store-registry.js';

function parseStoredWorkspace(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const workspace = JSON.parse(value);
    return workspace && typeof workspace === 'object' && !Array.isArray(workspace) ? workspace : null;
  } catch {
    return null;
  }
}

export function createLegacyRuntimeAppDataPersistence({
  getCurrentUser,
  getAppData,
  getAppDataKey,
  // Returns the split workspace store (workspace-store-v2.js) when this user's workspace is kept in it, otherwise null (the old single item).
  // The default asks the registry that the loading code fills in.
  getWorkspaceStore = user => getActiveWorkspaceStore(user?.username),
  setItem,
  readItem,
  readItems,
  setItemsAtomic,
  createSyncRevision,
  now = Date.now,
  shouldPersistSyncJournal = user => user?.authProvider === 'supabase',
  onSaved = () => {},
  logger = console
} = {}) {
  // The same promises as the single-item path below, for a workspace kept as one record per conversation: nothing is written when nothing
  // changed, and a cloud account's journal is written in the same transaction as the conversations it describes. What changed comes from
  // the store (the conversations whose fingerprint changed), and the entity-level diff reads only those from storage.
  async function persistToWorkspaceStore({ workspaceStore, snapshot, currentUser, immediateCloudSync }) {
    if (!shouldPersistSyncJournal(currentUser)) {
      const result = await workspaceStore.save(snapshot);
      return result.wrote ? { snapshot, syncMetadata: null } : null;
    }

    const journalKey = getCloudSyncJournalKey(currentUser.username);
    let storedJournal = null;
    if (typeof readItem === 'function') {
      try {
        storedJournal = await readItem(journalKey);
      } catch (error) {
        logger.warn('Noureon cloud workspace state could not be read; a full resync will be required.', error);
      }
    }
    const currentJournal = normalizeCloudSyncJournal(storedJournal, { username: currentUser.username });
    let outcome = null;
    await workspaceStore.save(snapshot, {
      beforeWrite: async plan => {
        if (plan.unchanged && !currentJournal.dirty && !currentJournal.fullResyncRequired) return { skip: true };
        const requeue = plan.unchanged && currentJournal.dirty;
        const journal = requeue
          ? currentJournal
          : markCloudSyncJournalDirty(currentJournal, {
              username: currentUser.username,
              revision: createSyncRevision?.(),
              now,
              dirtyEntities: await diffChangedEntities(plan, snapshot)
            });
        const syncMetadata = {
          revision: journal.workspaceRevision,
          journal,
          ...(immediateCloudSync ? { immediate: true } : {})
        };
        outcome = { snapshot, syncMetadata };
        if (requeue) return { skip: true };
        return { extraPuts: [{ key: journalKey, value: JSON.stringify(journal) }] };
      }
    });
    return outcome;
  }

  async function diffChangedEntities(plan, snapshot) {
    if (!plan.hadPrevious) return diffCloudSyncWorkspaceEntities(null, snapshot);
    const { conversations = [], memoryState, ...nextShared } = snapshot;
    if (plan.unchanged) return diffCloudSyncWorkspaceEntities({ conversations: [], ...nextShared }, { conversations: [], ...nextShared });
    const ids = [...plan.changedConversationIds, ...plan.removedConversationIds];
    const [previousById, previousShared] = await Promise.all([plan.readPreviousConversations(ids), plan.readPreviousShared()]);
    const nextById = new Map(conversations.map(conversation => [conversation.id, conversation]));
    return diffCloudSyncWorkspaceEntities(
      { ...(previousShared || {}), conversations: ids.map(id => previousById.get(id)).filter(Boolean) },
      { ...nextShared, conversations: plan.changedConversationIds.map(id => nextById.get(id)) }
    );
  }

  async function persistAppData({ immediateCloudSync = false } = {}) {
    let notification = null;
    await withWorkspaceStorageExclusive(async () => {
      const currentUser = getCurrentUser();
      if (!currentUser) return;
      const snapshot = createPersistableAppDataSnapshot(getAppData());
      const workspaceStore = getWorkspaceStore(currentUser);
      if (workspaceStore) {
        notification = await persistToWorkspaceStore({ workspaceStore, snapshot, currentUser, immediateCloudSync });
        return;
      }
      const appDataKey = getAppDataKey();
      const serializedSnapshot = JSON.stringify(snapshot);
      let syncMetadata = null;

      if (typeof setItemsAtomic === 'function' && shouldPersistSyncJournal(currentUser)) {
        const journalKey = getCloudSyncJournalKey(currentUser.username);
        let storedWorkspace = null;
        let storedJournal = null;
        if (typeof readItems === 'function' || typeof readItem === 'function') {
          try {
            [storedWorkspace, storedJournal] = typeof readItems === 'function'
              ? await readItems([appDataKey, journalKey])
              : await Promise.all([readItem(appDataKey), readItem(journalKey)]);
          } catch (error) {
            logger.warn('Noureon cloud workspace state could not be read; a full resync will be required.', error);
          }
        }
        const currentJournal = normalizeCloudSyncJournal(storedJournal, {
          username: currentUser.username
        });
        const workspaceUnchanged = storedWorkspace === serializedSnapshot;
        if (workspaceUnchanged && !currentJournal.dirty && !currentJournal.fullResyncRequired) {
          return;
        }
        const journal = workspaceUnchanged && currentJournal.dirty
          ? currentJournal
          : markCloudSyncJournalDirty(currentJournal, {
              username: currentUser.username,
              revision: createSyncRevision?.(),
              now,
              dirtyEntities: diffCloudSyncWorkspaceEntities(
                parseStoredWorkspace(storedWorkspace),
                snapshot
              )
        });
        if (workspaceUnchanged && currentJournal.dirty) {
          syncMetadata = {
            revision: journal.workspaceRevision,
            journal,
            ...(immediateCloudSync ? { immediate: true } : {})
          };
          notification = { snapshot, syncMetadata };
          return;
        }
        await setItemsAtomic([
          { key: appDataKey, value: serializedSnapshot },
          { key: journalKey, value: JSON.stringify(journal) }
        ]);
        syncMetadata = {
          revision: journal.workspaceRevision,
          journal,
          ...(immediateCloudSync ? { immediate: true } : {})
        };
      } else {
        // The whole workspace is one item, so a write of unchanged data is the most expensive thing the app does for nothing:
        // when what is stored is already this snapshot, leave it alone.
        if (typeof readItem === 'function') {
          let stored = null;
          try {
            stored = await readItem(appDataKey);
          } catch (error) {
            logger.warn('Noureon stored workspace could not be compared; writing it again.', error);
          }
          if (typeof stored === 'string' && stored === serializedSnapshot) return;
        }
        await setItem(appDataKey, serializedSnapshot);
      }
      notification = { snapshot, syncMetadata };
    });
    if (!notification) return;
    await Promise.resolve(onSaved(notification.snapshot, notification.syncMetadata)).then(undefined, error => {
      logger.warn('Noureon cloud conversation sync could not observe a local save.', error);
    });
  }

  // Saves that pile up (the app starts several at once: memory, a new chat, the memory summary) are served by as few writes as possible:
  // one runs, and everything that asks while it runs shares one follow-up, which takes its snapshot only when it starts, so it holds
  // everything asked before it.
  let running = null;
  let followUp = null;

  function start(options) {
    const run = persistAppData(options);
    running = run;
    const done = () => {
      if (running === run) running = null;
    };
    run.then(done, done);
    return run;
  }

  function saveAppData(options = {}) {
    const immediateCloudSync = options?.immediateCloudSync === true;
    if (!running) return start({ immediateCloudSync });
    if (followUp) {
      followUp.immediateCloudSync ||= immediateCloudSync;
      return followUp.promise;
    }
    const pending = { immediateCloudSync };
    pending.promise = running.catch(() => {}).then(() => {
      followUp = null;
      return start({ immediateCloudSync: pending.immediateCloudSync });
    });
    followUp = pending;
    return pending.promise;
  }

  return {
    saveAppData
  };
}
