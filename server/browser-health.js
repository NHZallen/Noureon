// A look at the browser host every minute (docs/superpowers/specs/2026-11-16-browser-agent-design.md, §2.5): when it cannot be reached, is loaded to the limit or has people waiting for a place, the person in
// charge (REPORT_TO) gets a mail, one for each kind of trouble. A trouble is told only when it has lasted (a few looks in a row: a load that goes over for a moment while a browser starts is not one), at most once in
// an hour for a host that does not answer, once in three hours for a queue, once in six hours for a load; and a short mail says it is well again only when the trouble was told, and only after it has been gone
// for a few looks (a load that goes up and down around its limit is one trouble, not many). What a mail says is only numbers (how many browsers, how many waiting, the load) and the kind of trouble: nothing of
// what anybody is doing. A look that cannot send mail is only logged.

const MINUTE = 60_000;

/**
 * deps: host ({ health() }), mailer ({ configured, send }), to (the address), log, now, intervalMs, thresholds { downAfter: looks in a row, queue: people waiting, load: the load of the machine (1 minute) },
 * setTimer/clearTimer. Returns { start(), stop(), look() } (`look()` does one look and resolves what it found).
 */
export function createBrowserHealth({ host, mailer, to, log = () => {}, now = Date.now, intervalMs = MINUTE, thresholds = {}, setTimer = setInterval, clearTimer = clearInterval, mailEveryMs = {} }) {
  // `lasting`: how many looks in a row a trouble must be there before it is told; `calm`: how many looks in a row it must be gone before "well again" is said.
  const limit = { downAfter: 3, queue: 5, load: 6, loadPerCpu: 1.5, queueLasting: 3, loadLasting: 5, calm: 5, ...thresholds };
  const every = { down: 60 * MINUTE, queue: 3 * 60 * MINUTE, load: 6 * 60 * MINUTE, ...(typeof mailEveryMs === 'object' ? mailEveryMs : {}) };
  let misses = 0;
  const lastMail = new Map();
  const streak = new Map();   // how many looks in a row each kind of trouble has been there
  const told = new Set();     // the kinds of trouble a mail was really sent for, and that are not over yet
  const calm = new Map();     // how many looks in a row a told trouble has been gone
  let timer = null;

  // Says whether a mail was sent (not held back, not failed).
  async function tell(kind, subject, lines, { force = false } = {}) {
    if (!to || !mailer?.configured) { log('browser_health_not_mailed', { kind, why: to ? 'no_mail' : 'no_address' }); return false; }
    const gap = every[kind] ?? 60 * MINUTE;
    if (!force && lastMail.has(kind) && now() - lastMail.get(kind) < gap) return false;
    lastMail.set(kind, now());
    try { await mailer.send({ to, subject, text: [...lines, '', 'Noureon browser agent (health check)'].join('\n') }); return true; } catch (error) { log('browser_health_mail_failed', { kind, code: error?.code || '' }); return false; }
  }

  async function look() {
    let state = null;
    try { state = await host.health(); misses = 0; } catch (error) { misses += 1; log('browser_health_miss', { n: misses, code: error?.code || '' }); }
    const found = [];
    const report = async (kind, subject, lines) => { if (await tell(kind, subject, lines)) told.add(kind); };
    if (!state) {
      if (misses >= limit.downAfter) {
        found.push('down');
        await report('down', 'Browser agent: the browser host does not answer', [`The browser host did not answer ${misses} times in a row (about ${misses} minutes).`, 'No browser can be opened until it is back.']);
      }
      streak.delete('queue'); streak.delete('load');
    } else {
      const queued = Number(state.queued) || 0;
      const load = Number(state.load1) || 0;
      // A load is heavy for the machine it is on: more than `loadPerCpu` for each core, and never less than `load`.
      const cpus = Number(state.cpus) > 0 ? Number(state.cpus) : 0;
      const loadLimit = Math.max(limit.load, cpus * limit.loadPerCpu);
      streak.set('queue', queued >= limit.queue ? (streak.get('queue') || 0) + 1 : 0);
      streak.set('load', load >= loadLimit ? (streak.get('load') || 0) + 1 : 0);
      if (streak.get('queue') > 0) found.push('queue');
      if (streak.get('load') > 0) found.push('load');
      if (streak.get('queue') >= limit.queueLasting) {
        await report('queue', `Browser agent: ${queued} people are waiting for a browser`, [`${state.sessions ?? '?'} of ${state.maxSessions ?? '?'} browsers are running and ${queued} people are waiting for one (for ${streak.get('queue')} minutes).`]);
      }
      if (streak.get('load') >= limit.loadLasting) {
        await report('load', 'Browser agent: the browser host is heavily loaded', [`The load of the browser host has been ${loadLimit.toFixed(1)} or more for ${streak.get('load')} minutes (now ${load}${cpus ? `, ${cpus} cores` : ''}).`, `${state.sessions ?? '?'} of ${state.maxSessions ?? '?'} browsers are running.`]);
      }
    }
    // Well again: a trouble that was told and has been gone for a while.
    for (const kind of [...told]) {
      if (found.includes(kind) && (kind === 'down' || (streak.get(kind) || 0) > 0)) { calm.set(kind, 0); continue; }
      calm.set(kind, (calm.get(kind) || 0) + 1);
      if (calm.get(kind) >= (kind === 'down' ? 1 : limit.calm)) {
        told.delete(kind); calm.delete(kind);
        await tell(`${kind}-recovered`, 'Browser agent: the browser host is well again', [`The trouble that was reported (${kind}) is over.`], { force: true });
      }
    }
    return { state, found };
  }

  return {
    look,
    start() { if (!timer) { timer = setTimer(() => { void look(); }, intervalMs); timer.unref?.(); } },
    stop() { if (timer) { clearTimer(timer); timer = null; } }
  };
}
