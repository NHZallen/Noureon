// The steps of the browser agent in the process list (design: docs/superpowers/specs/2026-11-16-browser-agent-design.md). One row per step, like the
// progress list of the interface draft: a ring that turns while the step runs, a tick when it is over. The label comes from the server and says only the
// site (never what was clicked or typed). The same kind of step on the same site is one row that runs again, so thirty clicks are not thirty rows.
export function createBrowserSteps({ begin, endCurrent, list }) {
  let lastKey = '';
  let queued = null;
  const sameRowRunning = (key) => key === lastKey && list.current && list.rows.includes(list.current);
  return function handleBrowser(event) {
    if (event.event === 'queued') {
      // Waiting for a free browser: one row, its label follows the place in the line.
      if (queued && list.rows.includes(queued)) queued.setLabel(event.label);
      else queued = begin(event.label, { kind: 'browser' });
      lastKey = '';
      return;
    }
    if (queued && list.rows.includes(queued)) {
      queued.discard();
      queued = null;
    }
    if (event.event === 'failed') {
      const row = begin(event.label, { kind: 'browser' });
      row.finish('failed');
      lastKey = '';
      return;
    }
    if (event.event !== 'call') return;
    const key = `${event.action === 'open' ? 'open' : event.action === 'close' ? 'close' : 'act'}:${event.domain || ''}`;
    if (event.action !== 'open' && event.action !== 'close' && sameRowRunning(key)) return;
    endCurrent();
    begin(event.label, { kind: 'browser' });
    lastKey = key;
  };
}
