// A look at the browser host every minute (docs/superpowers/specs/2026-11-16-browser-agent-design.md, §2.5): when it cannot be reached, is loaded to the limit or has people waiting for a place, the person in
// charge (REPORT_TO) gets a mail, one for each kind of trouble and at most one in an hour, and a short one when it is well again. What a mail says is only numbers (how many browsers, how many waiting, the
// load) and the kind of trouble: nothing of what anybody is doing. A look that cannot send mail is only logged.

const MINUTE = 60_000;

/**
 * deps: host ({ health() }), mailer ({ configured, send }), to (the address), log, now, intervalMs, thresholds { downAfter: looks in a row, queue: people waiting, load: the load of the machine (1 minute) },
 * setTimer/clearTimer. Returns { start(), stop(), look() } (`look()` does one look and resolves what it found).
 */
export function createBrowserHealth({ host, mailer, to, log = () => {}, now = Date.now, intervalMs = MINUTE, thresholds = {}, setTimer = setInterval, clearTimer = clearInterval, mailEveryMs = 60 * MINUTE }) {
  const limit = { downAfter: 3, queue: 5, load: 6, ...thresholds };
  let misses = 0;
  const lastMail = new Map();
  const trouble = new Set();
  let timer = null;

  async function tell(kind, subject, lines, { force = false } = {}) {
    if (!to || !mailer?.configured) { log('browser_health_not_mailed', { kind, why: to ? 'no_mail' : 'no_address' }); return; }
    if (!force && lastMail.has(kind) && now() - lastMail.get(kind) < mailEveryMs) return;
    lastMail.set(kind, now());
    try { await mailer.send({ to, subject, text: [...lines, '', 'Noureon browser agent (health check)'].join('\n') }); } catch (error) { log('browser_health_mail_failed', { kind, code: error?.code || '' }); }
  }

  async function look() {
    let state = null;
    try { state = await host.health(); misses = 0; } catch (error) { misses += 1; log('browser_health_miss', { n: misses, code: error?.code || '' }); }
    const found = [];
    if (!state) {
      if (misses >= limit.downAfter) {
        found.push('down');
        await tell('down', 'Browser agent: the browser host does not answer', [`The browser host did not answer ${misses} times in a row (about ${misses} minutes).`, 'No browser can be opened until it is back.']);
      }
    } else {
      const queued = Number(state.queued) || 0;
      const load = Number(state.load1) || 0;
      if (queued >= limit.queue) {
        found.push('queue');
        await tell('queue', `Browser agent: ${queued} people are waiting for a browser`, [`${state.sessions ?? '?'} of ${state.maxSessions ?? '?'} browsers are running and ${queued} people are waiting for one.`]);
      }
      if (load >= limit.load) {
        found.push('load');
        await tell('load', 'Browser agent: the browser host is heavily loaded', [`The load of the browser host is ${load} (the mail is sent at ${limit.load} or more).`, `${state.sessions ?? '?'} of ${state.maxSessions ?? '?'} browsers are running.`]);
      }
    }
    // Well again: a trouble that was there and is gone.
    for (const kind of trouble) if (!found.includes(kind)) { trouble.delete(kind); await tell(`${kind}-recovered`, 'Browser agent: the browser host is well again', [`The trouble that was reported (${kind}) is over.`], { force: true }); }
    for (const kind of found) trouble.add(kind);
    return { state, found };
  }

  return {
    look,
    start() { if (!timer) { timer = setTimer(() => { void look(); }, intervalMs); timer.unref?.(); } },
    stop() { if (timer) { clearTimer(timer); timer = null; } }
  };
}
