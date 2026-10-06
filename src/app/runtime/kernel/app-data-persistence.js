import { withWorkspaceStorageExclusive } from '../../sync/workspace-storage-coordinator.js';
import {
  diffCloudSyncWorkspaceEntities,
  getCloudSyncJournalKey,
  markCloudSyncJournalDirty,
  normalizeCloudSyncJournal
} from '../../sync/cloud-sync-journal.js';
import { createPersistableAppDataSnapshot } from '../features/temporary-chat-state.js';

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
  async function persistAppData({ immediateCloudSync = false } = {}) {
    let notification = null;
    await withWorkspaceStorageExclusive(async () => {
      const currentUser = getCurrentUser();
      if (!currentUser) return;
      const snapshot = createPersistableAppDataSnapshot(getAppData());
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
