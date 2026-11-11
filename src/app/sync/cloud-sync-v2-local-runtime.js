// The conversation sync as this browser runs it (Sync V2): the workspace and its journal read and written in the browser's storage (the
// split store when the account has one, else the single item), always together and one writer at a time, and the sync object made from
// them (cloud-sync-v2-controller.js) and started. The rest of the page finds it as the service SERVICES.cloudSync (runtime/services.js).

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
import { SERVICES, provideService } from '../runtime/services.js';
import { getConversationLoader } from '../runtime/kernel/on-demand-loading.js';
import { hydrateInPlace, isStub } from '../runtime/kernel/conversation-stub.js';

function exposeConversationShadowSync(window, sync) {
  provideService(SERVICES.cloudSync, sync);
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
  const readStoredWorkspace = async (workspaceStore, ids = null, { cloudCounts = null, cloudIds = null } = {}) => {
    // With on-demand loading only what the sync needs is read in full (`ids`; null is all of it) and the rest comes as stubs, which a save never writes.
    if (ids !== null && getConversationLoader() && typeof workspaceStore.loadStubs === 'function') {
      const stubbed = await workspaceStore.loadStubs();
      if (stubbed.state === 'absent') return null;
      if (stubbed.state !== 'ready') {
        throw new LocalWorkspaceDataError('Local split workspace is not readable.', { cause: new Error(stubbed.reason || stubbed.state) });
      }
      const wanted = new Set(ids);
      // Read in full: those asked for, those the cloud does not have (they have to go up), and those whose message count is not the cloud's.
      const toRead = stubbed.workspace.conversations.filter(conversation => isStub(conversation) && (
        wanted.has(conversation.id)
        || (cloudIds && !cloudIds.has(conversation.id))
        || (cloudCounts && (cloudCounts.get(conversation.id) ?? 0) !== conversation.__count)
      ));
      if (toRead.length) {
        const { found, problems } = await workspaceStore.readConversations(toRead.map(conversation => conversation.id));
        if (problems.length || found.size !== toRead.length) {
          throw new LocalWorkspaceDataError('A local conversation the sync needs is not readable.', { cause: new Error(problems[0]?.reason || 'unreadable') });
        }
        for (const conversation of toRead) hydrateInPlace(conversation, found.get(conversation.id));
      }
      return stubbed.workspace;
    }
    const loaded = await workspaceStore.load();
    if (loaded.state === 'absent') return null;
    if (loaded.state !== 'ready') {
      throw new LocalWorkspaceDataError('Local split workspace is not readable.', { cause: new Error(loaded.reason || loaded.state) });
    }
    return loaded.workspace;
  };
  // Which conversations a step needs in full: those with a change not uploaded yet (the journal), those the cloud brought (`extra`); all of them when the
  // journal does not know what changed, a full upload is due, or the page does not load on demand.
  const idsNeeded = (journal, { extra = [], needsFull = false } = {}) => {
    if (!getConversationLoader() || needsFull || journal.fullResyncRequired || journal.dirtyEntities?.unknown) return null;
    return [...new Set([...(journal.dirty ? journal.dirtyEntities?.conversations || [] : []), ...extra])];
  };
  // The stored workspace and journal read for a step, with the legacy ids repaired. Without on-demand loading it is the one atomic read of before. With it
  // only the conversations the step needs are read; a repair touches conversations that may be stubs, so when it finds something to repair the whole
  // workspace is read and the repair is made on that.
  const readStoredRepaired = async (options = {}) => {
    const workspaceStore = getWorkspaceStore();
    const partial = Boolean(workspaceStore && getConversationLoader());
    const repair = workspace => repairWorkspaceEntityIds({ workspace, userId: user.id, cryptoProvider });
    let workspaceRaw;
    let journalRaw;
    let ids = null;
    if (partial) {
      journalRaw = await storage.getItem(journalKey);
      ids = idsNeeded(normalizeCloudSyncJournal(journalRaw, { username }), options);
      workspaceRaw = await readStoredWorkspace(workspaceStore, ids, options);
    } else {
      [workspaceRaw, journalRaw] = await readWorkspaceAndJournal();
    }
    let storedWorkspace = parseLocalWorkspace(workspaceRaw);
    let repaired = await repair(storedWorkspace);
    if (repaired.changed && ids !== null) {
      storedWorkspace = parseLocalWorkspace(await readStoredWorkspace(workspaceStore, null));
      repaired = await repair(storedWorkspace);
    }
    return { storedWorkspace, repaired, journal: normalizeCloudSyncJournal(journalRaw, { username }) };
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
    commitWorkspace: ({ remoteWorkspace, tombstoneIndex, astraTombstoneIds, assertCurrent, touchedConversationIds, remoteMessageCounts }) => withWorkspaceStorageExclusive(async () => {
      const { storedWorkspace, repaired, journal: storedJournal } = await readStoredRepaired({
        // The cloud's changes are put in the conversations it touched; when it does not say which, everything is read.
        needsFull: touchedConversationIds === null || touchedConversationIds === undefined,
        extra: touchedConversationIds || [],
        cloudIds: new Set((remoteWorkspace?.conversations || []).map(conversation => conversation?.id).filter(Boolean)),
        cloudCounts: remoteMessageCounts
      });
      let journal = storedJournal;
      const latestWorkspace = await hydrateLocalAstraAssets(repaired.workspace);
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
    readCaptureState: ({ assertCurrent, needsFull = false, knownIds = null }) => withWorkspaceStorageExclusive(async () => {
      const { storedWorkspace, repaired, journal: storedJournal } = await readStoredRepaired({ needsFull, cloudIds: knownIds });
      let journal = storedJournal;
      const hydratedWorkspace = await hydrateLocalAstraAssets(repaired.workspace);
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
      // Only the journal is needed here: with the split store the workspace is not read at all.
      const journalRaw = getWorkspaceStore() ? await storage.getItem(journalKey) : (await readWorkspaceAndJournal())[1];
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
