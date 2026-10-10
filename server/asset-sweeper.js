// Clears the files that nothing mentions any more: a conversation deleted for good leaves its attachments and the files a reply made in the
// storage, where they take the person's space. Once a day it asks the database which files no row of any table refers to (and that are
// older than a day: a file is uploaded a little before the message that holds it is synced), and removes them through the storage API.
//
// The zips of the skills with files (the bucket `user-skill-bundles`, server/skill-bundles.js) are looked after the same way, in a second pass: the files that no row of
// `user_skills` points to any more (an account that was deleted takes its rows, not its files; a save that did not finish; a file put under any other name).
//
// It only reports at first (log `asset_orphans_found`); files are removed when the environment says `ASSET_SWEEP=delete`, so the first real
// removal is the owner's choice after reading what was found.

const DAY_MS = 24 * 60 * 60 * 1000;
const FIRST_RUN_MS = 2 * 60 * 1000;
const BATCH = 500;
const MAX_BATCHES = 20;

export function createAssetSweeper({ db, files, bundles = null, log = () => {}, mode = 'report', setTimer = setTimeout, setRepeat = setInterval, clearRepeat = clearInterval, clearTimer = clearTimeout }) {
  let first = null;
  let repeat = null;
  let running = false;

  /**
   * One kind of file: asks the database (`rpc`) for the files nothing points to, reports them, and in delete mode removes them through `store.removeAll`.
   * `events` are the names of the log lines. Resolves { found, bytes, removed }; a failure of the pass is logged and ends it (tried again tomorrow).
   */
  async function sweepKind({ rpc, store, events }) {
    const summary = { found: 0, bytes: 0, removed: 0 };
    try {
      for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
        const rows = await db.rpc(rpc, { p_older_than: '1 day', p_limit: BATCH });
        const orphans = (Array.isArray(rows) ? rows : []).filter((row) => typeof row?.name === 'string');
        if (!orphans.length) break;
        const bytes = orphans.reduce((sum, row) => sum + (Number(row.size) || 0), 0);
        if (mode !== 'delete') {
          // Reporting looks only at the first batch: nothing is removed, so the next batch would be the same files.
          summary.found = orphans.length;
          summary.bytes = bytes;
          log(events.found, { count: orphans.length, bytes, mode, names: orphans.slice(0, 20).map((row) => row.name) });
          break;
        }
        const removed = await store.removeAll(orphans.map((row) => row.name));
        summary.found += orphans.length;
        summary.bytes += bytes;
        summary.removed += removed;
        log(events.removed, { count: removed, bytes });
        if (orphans.length < BATCH) break;
      }
    } catch (error) {
      log(events.failed, { code: error?.code || '', status: error?.status || 0, message: String(error?.message || '').slice(0, 160) });
    }
    return summary;
  }

  /** One pass. Resolves { found, bytes, removed } for the attachments and the files replies made, and `bundles` (the same) for the skill zips when they are looked after. Never throws. */
  async function sweepOnce() {
    if (running) return { found: 0, bytes: 0, removed: 0 };
    running = true;
    try {
      const summary = await sweepKind({ rpc: 'orphan_user_assets', store: files, events: { found: 'asset_orphans_found', removed: 'asset_orphans_removed', failed: 'asset_sweep_failed' } });
      if (bundles) summary.bundles = await sweepKind({ rpc: 'orphan_skill_bundles', store: bundles, events: { found: 'skill_bundle_orphans_found', removed: 'skill_bundle_orphans_removed', failed: 'skill_bundle_sweep_failed' } });
      return summary;
    } finally {
      running = false;
    }
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
