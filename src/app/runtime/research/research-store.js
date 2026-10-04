// What the page knows of each deep research, by the id of its message: the plan as the server last told it (live, or as the message holds
// it), the report when it is done, the activity list, and how far the server's clock is from this page's. The cards and the reader draw from
// here and are told when it changes; the live channel (research-follow.js) and the message (adoptMessage) both feed it, and the newer
// state (the server stamps each with its clock) wins.

const entries = new Map();
const listeners = new Map();
const anyListeners = new Set();

const entryFor = (id) => {
  if (!entries.has(id)) entries.set(id, { id, runId: null, plan: null, report: null, activity: [], sources: [], writing: null, offset: 0, live: false });
  return entries.get(id);
};

export const getResearch = (id) => entries.get(id) || null;

export function subscribeResearch(id, listener) {
  if (!listeners.has(id)) listeners.set(id, new Set());
  listeners.get(id).add(listener);
  return () => listeners.get(id)?.delete(listener);
}

/** Told whenever any research changes (the composer follows whether one is running in the open chat). */
export function subscribeAnyResearch(listener) {
  anyListeners.add(listener);
  return () => anyListeners.delete(listener);
}

const notify = (id) => {
  for (const listener of [...anyListeners]) {
    try {
      listener(id);
    } catch (error) {
      console.warn('A research view failed to update.', error);
    }
  }
  for (const listener of [...(listeners.get(id) || [])]) {
    try {
      listener(entries.get(id));
    } catch (error) {
      console.warn('A research view failed to update.', error);
    }
  }
};

/** The server's clock now, as this page reckons it (the server's times are drawn against it, so every page shows the same seconds). */
export const serverNow = (id, now = Date.now()) => now + (entries.get(id)?.offset || 0);

/** Sets what the live channel tells. `patch` may hold plan, report, activityAll (a list), activityMore (one more), sources, writing, runId, live. */
export function updateResearch(id, patch = {}, { serverClock = null, now = Date.now() } = {}) {
  const entry = entryFor(id);
  if (Number.isFinite(serverClock)) entry.offset = serverClock - now;
  if (patch.runId) entry.runId = patch.runId;
  if (typeof patch.live === 'boolean') entry.live = patch.live;
  if (patch.plan && !entry.report) {
    // An older state (an echo of the message, late) does not replace a newer one.
    if (!entry.plan || !(patch.plan.clock < entry.plan.clock)) entry.plan = patch.plan;
  }
  if (patch.report) {
    entry.report = patch.report;
    if (entry.plan) entry.plan = { ...entry.plan, phase: 'done' };
  }
  if (Array.isArray(patch.activityAll)) entry.activity = patch.activityAll.slice(-300);
  if (patch.activityMore) entry.activity = [...entry.activity, patch.activityMore].slice(-300);
  if (Array.isArray(patch.sources)) entry.sources = patch.sources;
  if (patch.writing !== undefined) entry.writing = patch.writing;
  notify(id);
  return entry;
}

/** What a message holds of its research (its plan or its report), taken up when the message is drawn. Returns the entry, or null. */
export function adoptMessage(message) {
  const parts = Array.isArray(message?.parts) ? message.parts : [];
  const plan = parts.find((part) => part?.researchPlan)?.researchPlan;
  const report = parts.find((part) => part?.researchReport)?.researchReport;
  if (!message?.id || (!plan && !report)) return null;
  const entry = entryFor(message.id);
  if (report) {
    entry.report = report;
    if (Array.isArray(report.activity) && !entry.activity.length) entry.activity = report.activity;
    if (Array.isArray(report.sources) && !entry.sources.length) entry.sources = report.sources;
  }
  if (plan && !entry.report && (!entry.plan || !(plan.clock < entry.plan.clock))) {
    entry.plan = plan;
    // A state read from a message tells how far the clocks are apart only roughly (it was written a moment ago), but a page that has no live
    // channel has nothing better for the countdown.
    if (!entry.live && Number.isFinite(plan.clock)) entry.offset = plan.clock - Date.now();
  }
  return entry;
}

export function forgetResearch(id) {
  entries.delete(id);
  listeners.delete(id);
}

export const resetResearchStore = () => {
  entries.clear();
  listeners.clear();
};
