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
  // The split workspace store when this user's workspace is kept in it, otherwise null (the old single item).
  workspaceStore = null,
  repair = repairGeneratedImageStorageKeys,
  withExclusive = withWorkspaceStorageExclusive
} = {}) {
  if (!storage || !username || !appDataKey) return { changed: false };
  if (workspaceStore) return repairInSplitStore({ storage, username, workspaceStore, repair, withExclusive });
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

// The same repair for a workspace kept as one record per conversation: each record is read, repaired and (only if it changed) written
// back one at a time, so the whole workspace is never held in memory, and the journal is marked in the same transaction.
async function repairInSplitStore({ storage, username, workspaceStore, repair, withExclusive }) {
  return withExclusive(async () => {
    const journalKey = getCloudSyncJournalKey(username);
    const journalRaw = await storage.getItem(journalKey);
    const before = { conversations: [] };
    const after = { conversations: [] };
    let sharedBefore = null;
    let sharedAfter = null;
    let journal = null;
    const result = await workspaceStore.rewrite({
      transform: async (value, info) => {
        const copy = structuredClone(value);
        if (!(await repair({ value, storage, username }))) return false;
        if (info.kind === 'conversation') {
          before.conversations.push(copy);
          after.conversations.push(value);
        } else if (info.kind === 'shared') {
          sharedBefore = copy;
          sharedAfter = value;
        }
        return true;
      },
      beforeWrite: () => {
        journal = markCloudSyncJournalDirty(
          normalizeCloudSyncJournal(journalRaw, { username }),
          {
            username,
            dirtyEntities: diffCloudSyncWorkspaceEntities(
              { ...(sharedBefore || {}), ...before },
              { ...(sharedAfter || {}), ...after }
            )
          }
        );
        return { extraPuts: [{ key: journalKey, value: JSON.stringify(journal) }] };
      }
    });
    return result.changed ? { changed: true, journal } : { changed: false };
  });
}
