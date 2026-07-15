import { repairGeneratedImageStorageKeys } from './generated-image-key-repair.js';
import {
  diffCloudSyncWorkspaceEntities,
  getCloudSyncJournalKey,
  markCloudSyncJournalDirty,
  normalizeCloudSyncJournal
} from './cloud-sync-journal.js';
import { withWorkspaceStorageExclusive } from './workspace-storage-coordinator.js';

function parseWorkspace(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function repairCloudWorkspaceGeneratedImageKeys({
  storage,
  username,
  appDataKey,
  repair = repairGeneratedImageStorageKeys,
  withExclusive = withWorkspaceStorageExclusive
} = {}) {
  if (!storage || !username || !appDataKey) return { changed: false };
  if (typeof storage.setItemsAtomic !== 'function') {
    throw new TypeError('Cloud workspace image repair requires atomic storage writes.');
  }

  return withExclusive(async () => {
    const journalKey = getCloudSyncJournalKey(username);
    const [workspaceRaw, journalRaw] = typeof storage.readItems === 'function'
      ? await storage.readItems([appDataKey, journalKey])
      : await Promise.all([storage.getItem(appDataKey), storage.getItem(journalKey)]);
    const before = parseWorkspace(workspaceRaw);
    if (!before) return { changed: false };
    const workspace = parseWorkspace(workspaceRaw);
    const changed = await repair({ value: workspace, storage, username });
    if (!changed) return { changed: false };

    const journal = markCloudSyncJournalDirty(
      normalizeCloudSyncJournal(journalRaw, { username }),
      {
        username,
        dirtyEntities: diffCloudSyncWorkspaceEntities(before, workspace)
      }
    );
    await storage.setItemsAtomic([
      { key: appDataKey, value: JSON.stringify(workspace) },
      { key: journalKey, value: JSON.stringify(journal) }
    ]);
    return { changed: true, workspace, journal };
  });
}
