// Clears the files that nothing mentions any more: a conversation deleted for good leaves its attachments and the files a reply made in the
// storage, where they take the person's space. Once a day it asks the database which files no row of any table refers to (and that are
// older than a day: a file is uploaded a little before the message that holds it is synced), and removes them through the storage API.
//
// It only reports at first (log `asset_orphans_found`); files are removed when the environment says `ASSET_SWEEP=delete`, so the first real
// removal is the owner's choice after reading what was found.

const DAY_MS = 24 * 60 * 60 * 1000;
const FIRST_RUN_MS = 2 * 60 * 1000;
const BATCH = 500;
const MAX_BATCHES = 20;

export function createAssetSweeper({ db, files, log = () => {}, mode = 'report', setTimer = setTimeout, setRepeat = setInterval, clearRepeat = clearInterval, clearTimer = clearTimeout }) {
  let first = null;
  let repeat = null;
  let running = false;

  /** One pass. Resolves { found, bytes, removed }. Never throws (a failed pass is logged and tried again tomorrow). */
  async function sweepOnce() {
    if (running) return { found: 0, bytes: 0, removed: 0 };
    running = true;
    const summary = { found: 0, bytes: 0, removed: 0 };
    try {
      for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
        const rows = await db.rpc('orphan_user_assets', { p_older_than: '1 day', p_limit: BATCH });
        const orphans = (Array.isArray(rows) ? rows : []).filter((row) => typeof row?.name === 'string');
        if (!orphans.length) break;
        const bytes = orphans.reduce((sum, row) => sum + (Number(row.size) || 0), 0);
        if (mode !== 'delete') {
          // Reporting looks only at the first batch: nothing is removed, so the next batch would be the same files.
          summary.found = orphans.length;
          summary.bytes = bytes;
          log('asset_orphans_found', { count: orphans.length, bytes, mode, names: orphans.slice(0, 20).map((row) => row.name) });
          break;
        }
        const removed = await files.removeAll(orphans.map((row) => row.name));
        summary.found += orphans.length;
        summary.bytes += bytes;
        summary.removed += removed;
        log('asset_orphans_removed', { count: removed, bytes });
        if (orphans.length < BATCH) break;
      }
    } catch (error) {
      log('asset_sweep_failed', { code: error?.code || '', status: error?.status || 0, message: String(error?.message || '').slice(0, 160) });
    } finally {
      running = false;
    }
    return summary;
  }

  return {
    sweepOnce,
    /** Starts the daily pass (the first one two minutes after the start, when the server is already serving). The timers do not hold the process open. */
    start() {
      if (repeat || first) return;
      first = setTimer(() => {
        first = null;
        void sweepOnce();
        repeat = setRepeat(() => { void sweepOnce(); }, DAY_MS);
        repeat?.unref?.();
      }, FIRST_RUN_MS);
      first?.unref?.();
    },
    stop() {
      if (first) clearTimer(first);
      if (repeat) clearRepeat(repeat);
      first = null;
      repeat = null;
    }
  };
}
