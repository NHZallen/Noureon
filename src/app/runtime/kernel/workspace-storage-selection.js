// Decides, when a user's workspace is loaded, whether it lives in the split store (workspace-store-v2.js) or in the old single item,
// moves it from the old one to the new one when that is due, and returns what was loaded.
//
//  - A user who already has a split store keeps using it, whatever the switch says: after a migration the old item is frozen, so going
//    back to it would show stale data.
//  - The switch (?ws2=1 in the address once, remembered by the browser; ?ws2=0 forgets it) only decides whether the NEXT migration happens.
//  - Anything that goes wrong leaves the old item in use and untouched.

import { createWorkspaceStoreV2 } from './workspace-store-v2.js';

export const WS2_FLAG_KEY = 'noureon_ws2';
export const MAX_MIGRATION_ATTEMPTS = 3;

export function isWorkspaceV2Enabled({ location = globalThis.location, localStorage = globalThis.localStorage } = {}) {
  try {
    const requested = new URLSearchParams(location?.search || '').get('ws2');
    if (requested === '1') localStorage?.setItem(WS2_FLAG_KEY, '1');
    else if (requested === '0') localStorage?.removeItem(WS2_FLAG_KEY);
    return localStorage?.getItem(WS2_FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

export async function selectWorkspaceStorage({
  storage,
  username,
  legacyKey,
  enabled = false,
  createStore = createWorkspaceStoreV2,
  logger = console
} = {}) {
  const legacy = reason => ({ mode: 'legacy', reason });
  let store;
  try {
    store = createStore({ storage, username, logger });
    if (await store.isDisabled()) return legacy('disabled');

    let loaded = await store.load();
    let migration = null;
    if (loaded.state === 'absent') {
      if (!enabled) return legacy('not-enabled');
      const failure = await store.getMigrationFailure();
      if (failure && failure.attempts >= MAX_MIGRATION_ATTEMPTS) return legacy('migration-gave-up');
      migration = await store.migrateFromLegacy({ legacyKey });
      if (migration.state === 'migrated') {
        loaded = await store.load();
      } else if (migration.state === 'no-legacy') {
        // A new account: start in the split store; the first save creates it.
        return { mode: 'v2', store, loaded: { state: 'absent' }, migration };
      } else {
        logger.warn?.('The split workspace was not created; the old storage stays in use.', migration);
        return { ...legacy(`migration-${migration.state}`), migration };
      }
    }
    if (loaded.state !== 'ready' && loaded.state !== 'degraded') {
      logger.warn?.('The split workspace cannot be read; the old storage stays in use.', loaded);
      return legacy(`unusable-${loaded.state}`);
    }

    // An older tab, not reloaded since the new version was deployed, may have written the old item after the migration.
    if (loaded.meta?.migratedFrom && legacyKey) {
      try {
        const merged = await store.mergeStaleLegacy({ legacyKey });
        if (merged.state === 'merged' && (merged.added.length || merged.replaced.length)) loaded = await store.load();
      } catch (error) {
        logger.warn?.('What an older tab wrote to the old storage could not be merged.', error);
      }
    }
    return { mode: 'v2', store, loaded, migration };
  } catch (error) {
    logger.warn?.('The split workspace could not be opened; the old storage stays in use.', error);
    return legacy('error');
  }
}
