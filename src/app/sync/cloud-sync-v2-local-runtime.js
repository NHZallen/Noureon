// The conversation sync as this browser runs it (Sync V2): the workspace and its journal read and written in the browser's storage (the
// split store when the account has one, else the single item), always together and one writer at a time, and the sync object made from
// them (cloud-sync-v2-controller.js) and started. It is also kept as globalThis.__astraCloudSyncV2 for the rest of the page.

import { repairWorkspaceEntityIds } from './cloud-sync-v2-id-repair.js';
import { createConversationShadowSync } from './cloud-sync-v2-controller.js';
import { withoutDeleted } from './cloud-sync-v2-remote-apply.js';
import { mergeRemoteIntoEntityDirtyLocal, mergeWorkspacePreservingLocalTopLevel } from './cloud-sync-v2-merge.js';
import { createConversationShadowRepository } from './cloud-sync-v2-repository.js';
import { LocalWorkspaceDataError, SCHEMA_VERSION, parseLocalWorkspace } from './cloud-sync-v2-shared.js';
import { cloudValuesEqual } from './cloud-sync-versioning.js';
import { withWorkspaceStorageExclusive } from './workspace-storage-coordinator.js';
import {
  acknowledgeCloudSyncJournal,
  createCloudSyncRevision,
  diffCloudSyncWorkspaceEntities,
  getCloudSyncJournalKey,
  markCloudSyncJournalDirty,
  normalizeCloudSyncJournal,
  requireCloudSyncFullResync
} from './cloud-sync-journal.js';
import { createPersistentWorkspaceRemoteReader } from './cloud-sync-v2-remote-state.js';

function exposeConversationShadowSync(window, sync) {
  if (window) window.__astraCloudSyncV2 = sync;
  if (typeof globalThis !== 'undefined') globalThis.__astraCloudSyncV2 = sync;
}

export function initializeConversationShadowSync({
  window,
  supabase,
  storage,
  user,
  username,
  assetTransport,
  onWorkspaceCommitted,
  // Returns the split workspace store when this user's workspace is kept in it, otherwise null (the old single item).
  getWorkspaceStore = () => null,
  cryptoProvider = globalThis.crypto,
  schedule,
  cancel,
  now,
  logger = console
} = {}) {
  const repository = createConversationShadowRepository({ supabase, userId: user.id });
  const remoteStateReader = createPersistentWorkspaceRemoteReader({
    repository,
    storage,
    userId: user.id,
    username
  });
  const storageKey = `chatAppData_v8.6_${username}`;
  const journalKey = getCloudSyncJournalKey(username);
  const journalNow = typeof now === 'function' ? now : Date.now;
  // The stored workspace as an object. From the split store it is put together from its records; a store that cannot give the whole
  // workspace (a record missing or damaged) is refused like a damaged old item, so that the sync never uploads a partial workspace.
  const readStoredWorkspace = async workspaceStore => {
    const loaded = await workspaceStore.load();
    if (loaded.state === 'absent') return null;
    if (loaded.state !== 'ready') {
      throw new LocalWorkspaceDataError('Local split workspace is not readable.', { cause: new Error(loaded.reason || loaded.state) });
    }
    return loaded.workspace;
  };
  const writeWorkspaceAndJournal = async (workspace, journal) => {
    const workspaceStore = getWorkspaceStore();
    if (workspaceStore) {
      // The journal goes in the same transaction as the conversations it describes.
      await workspaceStore.save(workspace, {
        beforeWrite: () => ({ extraPuts: [{ key: journalKey, value: JSON.stringify(journal) }] })
      });
      return;
    }
    const entries = [
      { key: storageKey, value: JSON.stringify(workspace) },
      { key: journalKey, value: JSON.stringify(journal) }
    ];
    if (typeof storage.setItemsAtomic === 'function') {
      await storage.setItemsAtomic(entries);
      return;
    }
    for (const { key, value } of entries) await storage.setItem(key, value);
  };
  const readWorkspaceAndJournal = async () => {
    const workspaceStore = getWorkspaceStore();
    if (workspaceStore) return [await readStoredWorkspace(workspaceStore), await storage.getItem(journalKey)];
    return typeof storage.readItems === 'function'
      ? storage.readItems([storageKey, journalKey])
      : Promise.all([
          storage.getItem(storageKey),
          storage.getItem(journalKey)
        ]);
  };
  const markJournalForUpload = (journal, fullResyncRequired = false, dirtyEntities) => {
    const dirty = markCloudSyncJournalDirty(journal, {
      username,
      revision: createCloudSyncRevision({ cryptoProvider }),
      now: journalNow,
      dirtyEntities
    });
    return fullResyncRequired
      ? requireCloudSyncFullResync(dirty, { username })
      : dirty;
  };
  const logRepair = repaired => {
    if (!repaired.changed) return;
    try {
      logger.info('Noureon Sync V2 repaired legacy workspace IDs before upload.', repaired.repaired);
    } catch {}
  };
  const normalizeWorkspace = async (workspace) => {
    const repaired = await repairWorkspaceEntityIds({
      workspace,
      userId: user.id,
      cryptoProvider
    });
    return repaired.workspace;
  };
  const hydrateLocalAstraAssets = async (workspace) => {
    if (!assetTransport?.hydrate || !Array.isArray(workspace?.astras) || !workspace.astras.length) {
      return workspace;
    }
    const astras = await assetTransport.hydrate(workspace.astras, { allowNetwork: true });
    return Array.isArray(astras) ? { ...workspace, astras } : workspace;
  };
  const sync = createConversationShadowSync({
    repository,
    readWorkspace: async () => {
      const workspaceStore = getWorkspaceStore();
      const raw = workspaceStore ? await readStoredWorkspace(workspaceStore) : await storage.getItem(storageKey);
      return hydrateLocalAstraAssets(parseLocalWorkspace(raw));
    },
    commitWorkspace: ({ remoteWorkspace, tombstoneIndex, astraTombstoneIds, assertCurrent }) => withWorkspaceStorageExclusive(async () => {
      const [workspaceRaw, journalRaw] = await readWorkspaceAndJournal();
      const storedWorkspace = parseLocalWorkspace(workspaceRaw);
      const repaired = await repairWorkspaceEntityIds({
        workspace: storedWorkspace,
        userId: user.id,
        cryptoProvider
      });
      const latestWorkspace = await hydrateLocalAstraAssets(repaired.workspace);
      let journal = normalizeCloudSyncJournal(journalRaw, { username });
      if (repaired.changed) {
        journal = markJournalForUpload(
          journal,
          true,
          diffCloudSyncWorkspaceEntities(storedWorkspace, repaired.workspace)
        );
      }
      assertCurrent();
      const sanitizedLatest = withoutDeleted(latestWorkspace, tombstoneIndex, astraTombstoneIds);
      // A local change not uploaded yet (the journal is dirty) is kept over the cloud's version of the same entity.
      const committedWorkspace = withoutDeleted(
        journal.dirty
          ? mergeRemoteIntoEntityDirtyLocal(sanitizedLatest, remoteWorkspace, journal.dirtyEntities)
          : mergeWorkspacePreservingLocalTopLevel(sanitizedLatest, remoteWorkspace),
        tombstoneIndex,
        astraTombstoneIds
      );
      const changed = !cloudValuesEqual(storedWorkspace, committedWorkspace);
      assertCurrent();
      if (changed) {
        await writeWorkspaceAndJournal(committedWorkspace, journal);
        assertCurrent();
      }
      logRepair(repaired);
      return { workspace: committedWorkspace, changed };
    }),
    onWorkspaceCommitted: onWorkspaceCommitted || (detail => {
      if (!window?.dispatchEvent || typeof window.CustomEvent !== 'function') return;
      window.dispatchEvent(new window.CustomEvent('astra:cloud-workspace-committed', { detail }));
    }),
    userId: user.id,
    cryptoProvider,
    normalizeWorkspace,
    fetchRemoteState: options => remoteStateReader.read(options),
    readCaptureState: ({ assertCurrent }) => withWorkspaceStorageExclusive(async () => {
      const [workspaceRaw, journalRaw] = await readWorkspaceAndJournal();
      const storedWorkspace = parseLocalWorkspace(workspaceRaw);
      const repaired = await repairWorkspaceEntityIds({
        workspace: storedWorkspace,
        userId: user.id,
        cryptoProvider
      });
      const hydratedWorkspace = await hydrateLocalAstraAssets(repaired.workspace);
      let journal = normalizeCloudSyncJournal(journalRaw, { username });
      const needsRecoveryRevision = journal.fullResyncRequired
        && (!journal.dirty || !journal.workspaceRevision);
      if (repaired.changed || needsRecoveryRevision) {
        journal = markJournalForUpload(
          journal,
          repaired.changed || journal.fullResyncRequired,
          repaired.changed
            ? diffCloudSyncWorkspaceEntities(storedWorkspace, repaired.workspace)
            : undefined
        );
        assertCurrent();
        await writeWorkspaceAndJournal(hydratedWorkspace, journal);
        assertCurrent();
        logRepair(repaired);
      }
      return {
        workspace: hydratedWorkspace,
        journal,
        revision: journal.workspaceRevision
      };
    }),
    acknowledgeCapture: ({ attemptedRevision, assertCurrent }) => withWorkspaceStorageExclusive(async () => {
      const [, journalRaw] = await readWorkspaceAndJournal();
      const current = normalizeCloudSyncJournal(journalRaw, { username });
      const result = acknowledgeCloudSyncJournal(current, attemptedRevision, {
        username,
        acknowledgedAt: journalNow,
        fullResyncCompleted: true
      });
      assertCurrent();
      if (result.acknowledged) {
        await storage.setItem(journalKey, JSON.stringify(result.journal));
        assertCurrent();
      }
      return result;
    }),
    canSkipInitialUpload: ({ journal }, { profile }) => Boolean(
      journal
      && journal.dirty === false
      && journal.fullResyncRequired === false
      && ['ready', 'active'].includes(profile?.migration_state)
      && Number(profile?.schema_version) === SCHEMA_VERSION
    ),
    prepareWorkspaceForUpload: async workspace => assetTransport?.externalize
      ? assetTransport.externalize(workspace)
      : workspace,
    hydrateRemoteWorkspace: async (workspace, options) => assetTransport?.hydrate
      ? assetTransport.hydrate(workspace, options)
      : workspace,
    schedule,
    cancel,
    now,
    logger
  });
  exposeConversationShadowSync(window, sync);
  sync.ready = sync.initialize().catch(error => {
    try {
      logger.warn('Noureon Sync V2 initialization escaped its local fallback boundary.', error);
    } catch {}
    return sync.getStatus();
  });
  return sync;
}
