import {
  applyRemoteDeltaPage,
  createRemoteBaseline,
  validateRemoteBaseline
} from './cloud-sync-v2-baseline.js';
import {
  getCloudSyncJournalKey,
  normalizeCloudSyncJournal
} from './cloud-sync-journal.js';
import { withWorkspaceStorageExclusive } from './workspace-storage-coordinator.js';

const REMOTE_BASELINE_VERSION = 1;
const REMOTE_BASELINE_KEY_PREFIX = `chatCloudSyncRemoteBaseline_v${REMOTE_BASELINE_VERSION}_`;

function normalizeWatermark(value) {
  if (typeof value === 'bigint') return value >= 0n ? value.toString() : null;
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 ? String(value) : null;
  }
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) return null;
  try {
    return BigInt(value.trim()).toString();
  } catch {
    return null;
  }
}

function emptyRemoteRows() {
  return { folders: [], conversations: [], messages: [], astras: [], tombstones: [] };
}

export function getCloudSyncRemoteBaselineKey(username) {
  if (typeof username !== 'string' || !username.trim()) {
    throw new TypeError('Cloud sync remote baseline requires a username.');
  }
  return `${REMOTE_BASELINE_KEY_PREFIX}${username.trim()}`;
}

export function createPersistentWorkspaceRemoteReader({
  repository,
  storage,
  userId,
  username,
  withLock = withWorkspaceStorageExclusive
} = {}) {
  const baselineKey = getCloudSyncRemoteBaselineKey(username);
  const journalKey = getCloudSyncJournalKey(username);

  const readBaselineAndJournal = async () => (
    typeof storage.readItems === 'function'
      ? storage.readItems([baselineKey, journalKey])
      : Promise.all([
          storage.getItem(baselineKey),
          storage.getItem(journalKey)
        ])
  );

  const persistBaselineAndWatermark = async (baseline, assertCurrent) => withLock(async () => {
    assertCurrent();
    const journalRaw = await storage.getItem(journalKey);
    const journal = normalizeCloudSyncJournal(journalRaw, { username });
    const nextJournal = {
      ...journal,
      lastRemoteWatermark: baseline.watermark
    };
    const entries = [
      { key: baselineKey, value: JSON.stringify(baseline) },
      { key: journalKey, value: JSON.stringify(nextJournal) }
    ];
    assertCurrent();
    if (typeof storage.setItemsAtomic === 'function') {
      await storage.setItemsAtomic(entries);
    } else {
      for (const { key, value } of entries) await storage.setItem(key, value);
    }
    assertCurrent();
  });

  async function read({ assertCurrent = () => {} } = {}) {
    const [baselineRaw, journalRaw] = await readBaselineAndJournal();
    assertCurrent();
    const journal = normalizeCloudSyncJournal(journalRaw, { username });
    const storedBaseline = validateRemoteBaseline(baselineRaw, { userId });
    const journalWatermark = normalizeWatermark(journal.lastRemoteWatermark);
    const baselineTrusted = Boolean(
      storedBaseline
      && journalWatermark === storedBaseline.watermark
    );
    let baseline = baselineTrusted
      ? storedBaseline
      : createRemoteBaseline({ userId, watermark: '0', rows: emptyRemoteRows() });

    try {
      const delta = await repository.fetchWorkspaceDelta(baseline.watermark);
      assertCurrent();
      if (!delta || !Array.isArray(delta.pages)) {
        const error = new Error('Workspace delta reader returned an invalid result.');
        error.code = 'ASTRA_WORKSPACE_DELTA_INVALID';
        throw error;
      }
      for (const page of delta.pages) baseline = applyRemoteDeltaPage(baseline, page);
      if (normalizeWatermark(delta.nextSeq) !== baseline.watermark) {
        const error = new Error('Workspace delta summary watermark does not match its pages.');
        error.code = 'ASTRA_WORKSPACE_DELTA_INVALID';
        throw error;
      }
      assertCurrent();
      await persistBaselineAndWatermark(baseline, assertCurrent);
      assertCurrent();
      return {
        rows: {
          folders: baseline.rows.folders,
          conversations: baseline.rows.conversations,
          messages: baseline.rows.messages,
          astras: baseline.rows.astras
        },
        tombstones: baseline.rows.tombstones,
        deltaSupported: true,
        snapshotFallback: false,
        baselineReset: !baselineTrusted,
        pageCount: delta.pages.length,
        rowCount: delta.rowCount || 0,
        watermark: baseline.watermark
      };
    } catch (error) {
      if (error?.code !== 'ASTRA_WORKSPACE_DELTA_UNSUPPORTED') throw error;
      const tombstones = await repository.fetchTombstones();
      assertCurrent();
      const rows = await repository.fetchWorkspace();
      assertCurrent();
      return {
        rows,
        tombstones,
        deltaSupported: false,
        snapshotFallback: true,
        fallbackReason: 'delta-unsupported',
        baselineReset: false,
        pageCount: 0,
        rowCount: 0,
        watermark: null
      };
    }
  }

  return { read, baselineKey, journalKey };
}
