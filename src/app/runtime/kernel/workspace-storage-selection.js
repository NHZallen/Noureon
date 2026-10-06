// Decides, when a user's workspace is loaded, whether it lives in the split store (workspace-store-v2.js) or in the old single item,
// moves it from the old one to the new one when that is due, and returns what was loaded.
//
//  - A user who already has a split store keeps using it, whatever the switch says: after a migration the old item is frozen, so going
//    back to it would show stale data.
//  - The split storage is on for everyone. The switch only decides whether the NEXT migration happens: ?ws2=0 in the address turns it off
//    (remembered by the browser, the old item stays in use), ?ws2=1 turns it on again.
//  - ?ws2=rollback is the way back: the whole workspace is written into the old item and the split storage is switched off (its records
//    stay). ?ws2=1 asked for again afterwards clears them and migrates the old item afresh.
//  - Anything that goes wrong leaves the old item in use and untouched.

import { createWorkspaceStoreV2 } from './workspace-store-v2.js';

export const WS2_FLAG_KEY = 'noureon_ws2';
export const MAX_MIGRATION_ATTEMPTS = 3;

// What the address asks for: 'enable', 'disable', 'rollback', or nothing.
export function readWorkspaceV2Request({ location = globalThis.location } = {}) {
  try {
    const requested = new URLSearchParams(location?.search || '').get('ws2');
    return { 1: 'enable', 0: 'disable', rollback: 'rollback' }[requested] || null;
  } catch {
    return null;
  }
}

export function isWorkspaceV2Enabled({ location = globalThis.location, localStorage = globalThis.localStorage } = {}) {
  try {
    const request = readWorkspaceV2Request({ location });
    if (request === 'enable') localStorage?.setItem(WS2_FLAG_KEY, '1');
    else if (request === 'disable') localStorage?.setItem(WS2_FLAG_KEY, '0');
    else if (request === 'rollback') localStorage?.removeItem(WS2_FLAG_KEY);
    return localStorage?.getItem(WS2_FLAG_KEY) !== '0';
  } catch {
    // Storage that cannot be read: the default (on) applies.
    return true;
  }
}

export async function selectWorkspaceStorage({
  storage,
  username,
  legacyKey,
  enabled = false,
  request = null,
  createStore = createWorkspaceStoreV2,
  logger = console
} = {}) {
  const legacy = reason => ({ mode: 'legacy', reason });
  let store;
  try {
    store = createStore({ storage, username, logger });
    let rollback = null;
    if (request === 'rollback' && !(await store.isDisabled())) {
      rollback = await store.exportToLegacy({ legacyKey });
      if (rollback.state === 'exported') return { ...legacy('rolled-back'), rollback };
      if (rollback.state !== 'absent') logger.warn?.('The split workspace could not be moved back to the old storage; it stays in use.', rollback);
    }
    if (await store.isDisabled()) {
      // Asking for the split storage again after a rollback starts over from the old item, which is the newer copy now.
      if (request !== 'enable') return legacy('disabled');
      await store.removeAll();
    }

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
    return { mode: 'v2', store, loaded, migration, ...(rollback && rollback.state !== 'absent' ? { rollback } : {}) };
  } catch (error) {
    logger.warn?.('The split workspace could not be opened; the old storage stays in use.', error);
    return legacy('error');
  }
}
