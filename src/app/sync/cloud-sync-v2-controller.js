// The conversation sync of a signed-in account (Sync V2), as one object: it starts by putting the cloud and this device together, then
// uploads each local save (a second after it, saves made meanwhile going together), brings the cloud in when it changes, deletes forever,
// and says where it is (getStatus). Every operation runs after the one before it (`state.work`); stop() makes every operation under way end
// without touching anything. The parts it joins: cloud-sync-v2-remote-apply.js, -capture.js and -permanent-delete.js.

import { createTombstoneIndex } from './cloud-sync-v2-deletions.js';
import { createCapture } from './cloud-sync-v2-capture.js';
import { createPermanentDeletes } from './cloud-sync-v2-permanent-delete.js';
import { createRemoteApply } from './cloud-sync-v2-remote-apply.js';
import {
  CAPTURE_DEBOUNCE_MS,
  SCHEMA_VERSION,
  ShadowSyncStoppedError,
  describeShadowError,
  isMissingSchemaError,
  summarizeShadowRows,
  summarizeWorkspace
} from './cloud-sync-v2-shared.js';

const INITIAL_STATUS = Object.freeze({
  state: 'idle',
  enabled: false,
  pending: false,
  conversations: 0,
  messages: 0,
  folders: 0,
  astras: 0,
  deltaSupported: null,
  deltaPages: 0,
  deltaRows: 0,
  baselineReset: false,
  fullSnapshotFallbackCount: 0,
  lastSnapshotFallbackReason: null,
  currentRemoteWatermark: null,
  deferredFolderSyncCount: 0
});

// What the sync, this device and the cloud hold, for a support report (each part read on its own; one that fails says why).
async function diagnoseSync({ state, options }) {
  const { status } = state;
  const diagnosis = {
    status,
    permanentDelete: {
      at: status.lastPermanentDeleteAt || null,
      count: status.lastPermanentDeleteCount || 0,
      verifiedCount: status.lastPermanentDeleteVerifiedCount || 0,
      error: status.lastPermanentDeleteError || null
    },
    online: options.online(),
    userId: options.userId
  };
  const read = async (key, errorKey, reader) => {
    try {
      diagnosis[key] = await reader();
    } catch (error) {
      diagnosis[errorKey] = describeShadowError(error);
    }
  };
  await read('local', 'localError', async () => summarizeWorkspace(await options.readWorkspace() || {}));
  await read('profile', 'profileError', () => options.repository.probe());
  await read('tombstones', 'tombstoneError', async () => {
    const tombstones = await options.repository.fetchTombstones();
    return {
      total: tombstones.length,
      conversations: tombstones.filter(row => row?.entity_type === 'conversation').length,
      folders: tombstones.filter(row => row?.entity_type === 'folder').length
    };
  });
  await read('remote', 'remoteError', async () => summarizeShadowRows(await options.repository.fetchWorkspace()));
  return diagnosis;
}

// The status of a start that found nothing to upload (the journal says this device has nothing the cloud lacks).
function skippedUploadFields(workspace, baselineTrusted, at) {
  const summary = summarizeWorkspace(workspace);
  return {
    state: 'ready',
    enabled: true,
    pending: false,
    conversations: summary.conversations,
    messages: summary.messages,
    folders: summary.folders,
    astras: summary.astras,
    fullConversations: summary.conversations,
    fullMessages: summary.messages,
    fullFolders: summary.folders,
    fullAstras: summary.astras,
    uploadedConversations: 0,
    uploadedMessages: 0,
    uploadedFolders: 0,
    uploadedAstras: 0,
    uploadedRows: 0,
    fullUpload: false,
    baselineTrusted,
    skipped: 0,
    uploadSkipped: true,
    lastUploadSkippedAt: at,
    error: undefined,
    code: undefined,
    status: undefined,
    details: undefined,
    hint: undefined
  };
}

// Everything the sync remembers, shared by its parts.
function createSyncState() {
  return {
    // Uploads are made (the start went through); while it starts, saves are only queued (`acceptingCaptures`).
    enabled: false,
    acceptingCaptures: false,
    // The save waiting for its upload, and the timer that starts it.
    pendingWorkspace: null,
    timer: null,
    // The operation under way (each one waits for the one before it).
    work: Promise.resolve(),
    backupMarker: null,
    migrationPending: true,
    // What was deleted forever in the cloud (never brought back by an upload).
    tombstoneIndex: createTombstoneIndex(),
    astraTombstoneIds: new Set(),
    // What the cloud is known to hold: an upload sends only what differs from it (all of it when it is not trusted).
    uploadBaseline: null,
    baselineTrusted: false,
    // Conversations whose change of folder waits (the folder is not in the cloud yet).
    deferredConversationFolderIds: new Set(),
    // Incremented by stop() and each start: an operation begun before it ends without touching anything.
    generation: 0,
    fullSnapshotFallbackCount: 0,
    status: INITIAL_STATUS
  };
}

export function createConversationShadowSync({
  repository,
  readWorkspace,
  writeWorkspace = async () => {},
  commitWorkspace,
  onWorkspaceCommitted = () => {},
  userId,
  cryptoProvider = globalThis.crypto,
  online = () => globalThis.navigator?.onLine !== false,
  normalizeWorkspace = async workspace => workspace,
  prepareWorkspaceForUpload = async workspace => workspace,
  hydrateRemoteWorkspace = async workspace => workspace,
  fetchRemoteState,
  readCaptureState,
  acknowledgeCapture,
  canSkipInitialUpload = () => false,
  schedule = (callback, delay) => globalThis.setTimeout(callback, delay),
  cancel = timer => globalThis.clearTimeout(timer),
  now = () => new Date().toISOString(),
  logger = console
} = {}) {
  const options = {
    repository, readWorkspace, writeWorkspace, commitWorkspace, onWorkspaceCommitted, userId, cryptoProvider, online, normalizeWorkspace,
    prepareWorkspaceForUpload, hydrateRemoteWorkspace, fetchRemoteState, readCaptureState, acknowledgeCapture, schedule, cancel, now, logger
  };
  const state = createSyncState();
  const ctx = {
    state,
    options,
    setStatus: next => {
      state.status = Object.freeze({ ...state.status, ...next });
      return state.status;
    },
    invalidateUploadBaseline: () => {
      state.uploadBaseline = null;
      state.baselineTrusted = false;
      ctx.setStatus({ baselineTrusted: false });
    },
    // A check that throws when the sync was stopped or started again since it was made.
    guard: () => {
      const operationGeneration = state.generation;
      return () => {
        if (state.generation !== operationGeneration) throw new ShadowSyncStoppedError();
      };
    },
    scheduleDrain: () => {
      state.timer = schedule(drain, CAPTURE_DEBOUNCE_MS);
    }
  };
  const remote = createRemoteApply(ctx);
  const capture = createCapture(ctx, remote);
  const deletes = createPermanentDeletes(ctx, remote);
  const pendingNow = () => Boolean(state.pendingWorkspace);
  // An operation that failed: the sync waits to try again (after a reconnect, the next save, or a reload).
  const retryStatus = (error, extra = {}) => ctx.setStatus({
    state: 'retry',
    enabled: state.enabled,
    pending: pendingNow(),
    ...extra,
    lastErrorAt: now(),
    ...describeShadowError(error)
  });
  const stoppedStatus = () => ctx.setStatus({ state: 'stopped', enabled: false, pending: false });

  function refreshWorkspace() {
    if (!state.enabled) return Promise.resolve(state.status);
    const assertCurrent = ctx.guard();
    state.work = state.work
      .catch(() => {})
      .then(async () => {
        assertCurrent();
        ctx.setStatus({ state: 'refreshing', enabled: state.enabled, pending: pendingNow() });
        const summary = summarizeWorkspace(await remote.refreshWorkspaceNow(assertCurrent));
        return ctx.setStatus({
          state: 'ready',
          enabled: state.enabled,
          pending: pendingNow(),
          conversations: summary.conversations,
          messages: summary.messages,
          folders: summary.folders,
          astras: summary.astras,
          lastRemoteRefreshAt: now(),
          error: undefined,
          code: undefined,
          details: undefined,
          hint: undefined
        });
      })
      .catch(error => {
        ctx.invalidateUploadBaseline();
        if (error instanceof ShadowSyncStoppedError) return stoppedStatus();
        logger.warn('Noureon Sync V2 remote refresh will retry after reconnect or reload.', error);
        return retryStatus(error);
      });
    return state.work;
  }

  function flush() {
    if (!state.enabled) return state.work.then(() => state.status);
    if (state.timer != null) cancel(state.timer);
    state.timer = null;
    return drain();
  }

  async function retry() {
    try {
      if (!online()) return ctx.setStatus({ state: 'offline', enabled: state.enabled, pending: pendingNow() });
      if (!state.enabled) {
        return state.status.state === 'retry' ? initialize() : state.status;
      }
      const refreshed = await refreshWorkspace();
      if (refreshed.state !== 'ready' || !state.enabled) return refreshed;
      const workspace = await readWorkspace();
      if (!workspace) return state.status;
      const captured = await capture.resolveCaptureState(workspace, null, () => {});
      if (captured.journal && !captured.journal.dirty && !captured.journal.fullResyncRequired) return state.status;
      captureWorkspace(captured.workspace, { revision: captured.revision });
      return flush();
    } catch (error) {
      ctx.invalidateUploadBaseline();
      logger.warn('Noureon Sync V2 retry will continue after the next reconnect or remote change.', error);
      return retryStatus(error);
    }
  }

  // The queued save uploaded (after the operation under way).
  function drain() {
    state.timer = null;
    const pending = state.pendingWorkspace;
    state.pendingWorkspace = null;
    if (!pending) return state.work;
    const assertCurrent = () => {
      if (state.generation !== pending.generation) throw new ShadowSyncStoppedError();
    };
    state.work = state.work
      .catch(() => {})
      .then(() => capture.captureNow(pending.workspace, false, assertCurrent, null, pending.metadata))
      .catch(error => {
        if (error instanceof ShadowSyncStoppedError) return stoppedStatus();
        logger.warn('Noureon Sync V2 shadow upload will retry after the next local save or reload.', error);
        // (Resolves nothing: the upload is retried by the next save.)
        retryStatus(error, { pending: false });
      });
    return state.work;
  }

  // A local save, queued for upload (the last one wins). False when the sync does not take saves now.
  function captureWorkspace(workspace, metadata = null) {
    if ((!state.enabled && !state.acceptingCaptures) || !workspace) {
      ctx.setStatus({
        state: !workspace ? state.status.state : state.status.state === 'idle' ? 'disabled' : state.status.state,
        enabled: state.enabled,
        pending: false,
        lastCaptureRejectedAt: now(),
        lastCaptureRejectedReason: !workspace ? 'empty-workspace' : 'sync-not-ready'
      });
      return false;
    }
    state.pendingWorkspace = { workspace, metadata, generation: state.generation };
    if (state.timer != null) cancel(state.timer);
    state.timer = null;
    if (state.enabled) ctx.scheduleDrain();
    ctx.setStatus({
      enabled: state.enabled,
      pending: true,
      lastCaptureQueuedAt: now(),
      local: summarizeWorkspace(workspace)
    });
    return true;
  }

  // The folder of these conversations is not uploaded until their folder is in the cloud (they keep the cloud's folder meanwhile).
  function deferConversationFolderSync(conversationIds = []) {
    let changed = false;
    const ids = Array.isArray(conversationIds) ? conversationIds : [conversationIds];
    for (const value of ids) {
      const id = typeof value === 'string' ? value.trim() : '';
      if (!id || state.deferredConversationFolderIds.has(id)) continue;
      state.deferredConversationFolderIds.add(id);
      changed = true;
    }
    ctx.setStatus({ deferredFolderSyncCount: state.deferredConversationFolderIds.size });
    return changed;
  }

  // Reads the account's profile (is the cloud's schema there, is the migration done).
  async function probeProfile(assertCurrent) {
    const profile = await repository.probe();
    assertCurrent();
    state.backupMarker = profile?.legacy_backup_created_at ? null : now();
    state.migrationPending = Number(profile?.schema_version) !== SCHEMA_VERSION
      || !['ready', 'active'].includes(profile?.migration_state);
    return profile;
  }

  /**
   * Starts (or starts again) the sync: the profile read, the cloud put together with this device and written, then the first upload (skipped
   * when nothing needs it). Never throws: a sync that cannot start leaves the app in local mode ('retry', 'migration-required').
   */
  async function initialize() {
    state.generation += 1;
    ctx.invalidateUploadBaseline();
    const assertCurrent = ctx.guard();
    let profile = null;
    try {
      profile = await probeProfile(assertCurrent);
    } catch (error) {
      if (error instanceof ShadowSyncStoppedError) return stoppedStatus();
      if (isMissingSchemaError(error)) return ctx.setStatus({ state: 'migration-required', enabled: false, pending: false, ...describeShadowError(error) });
      logger.warn('Noureon Sync V2 shadow probe failed; local mode remains active.', error);
      return ctx.setStatus({ state: 'retry', enabled: false, pending: false, lastErrorAt: now(), ...describeShadowError(error) });
    }
    try {
      const localWorkspace = await normalizeWorkspace(await readWorkspace() || {});
      assertCurrent();
      const { tombstones, rows } = await remote.loadRemoteState(assertCurrent);
      const committedWorkspace = await remote.commitRemoteState({
        tombstones,
        rows,
        assertCurrent,
        localWorkspace,
        announceUnchanged: true,
        failureMessage: 'Noureon could not hand the committed cloud workspace to the live runtime.'
      });
      state.acceptingCaptures = true;
      let initialCapture = await capture.resolveCaptureState(committedWorkspace, null, assertCurrent);
      assertCurrent();
      const canSkip = await canSkipInitialUpload(initialCapture, { profile });
      assertCurrent();
      if (canSkip && !state.pendingWorkspace) {
        state.enabled = true;
        state.acceptingCaptures = false;
        return ctx.setStatus(skippedUploadFields(initialCapture.workspace, state.baselineTrusted, now()));
      }
      // A save made while the start was under way is the one uploaded.
      if (canSkip && state.pendingWorkspace) {
        const pending = state.pendingWorkspace;
        state.pendingWorkspace = null;
        initialCapture = await capture.resolveCaptureState(pending.workspace, pending.metadata, assertCurrent);
        assertCurrent();
      }
      const result = await capture.captureNow(initialCapture.workspace, true, assertCurrent, initialCapture);
      assertCurrent();
      if (result.state !== 'ready') return result;
      state.enabled = true;
      state.acceptingCaptures = false;
      if (state.pendingWorkspace && state.timer == null) ctx.scheduleDrain();
      return ctx.setStatus({ enabled: true, pending: pendingNow() });
    } catch (error) {
      state.enabled = false;
      state.acceptingCaptures = false;
      ctx.invalidateUploadBaseline();
      if (error instanceof ShadowSyncStoppedError) return stoppedStatus();
      if (isMissingSchemaError(error)) {
        return ctx.setStatus({ state: 'migration-required', enabled: false, pending: false, ...describeShadowError(error) });
      }
      logger.warn('Noureon Sync V2 shadow initialization is incomplete; local mode remains active.', error);
      return ctx.setStatus({ state: 'retry', enabled: false, pending: false, lastErrorAt: now(), ...describeShadowError(error) });
    }
  }

  function stop() {
    state.generation += 1;
    state.enabled = false;
    state.acceptingCaptures = false;
    if (state.timer != null) cancel(state.timer);
    state.timer = null;
    state.pendingWorkspace = null;
    state.deferredConversationFolderIds.clear();
    ctx.invalidateUploadBaseline();
    ctx.setStatus({ state: 'stopped', enabled: false, pending: false, deferredFolderSyncCount: 0 });
  }

  return {
    initialize,
    captureWorkspace,
    deferConversationFolderSync,
    permanentlyDeleteConversations: deletes.permanentlyDeleteConversations,
    permanentlyDeleteFolder: deletes.permanentlyDeleteFolder,
    permanentlyDeleteAstras: deletes.permanentlyDeleteAstras,
    pullWorkspace: remote.pullWorkspace,
    refresh: refreshWorkspace,
    retry,
    diagnose: () => diagnoseSync(ctx),
    flush,
    stop,
    getStatus: () => state.status
  };
}
