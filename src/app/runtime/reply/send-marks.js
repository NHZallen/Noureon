// How long each part of sending a message takes on this page, from the press of Send to the request that makes the reply (the server keeps them with the run: server_runs.usage.marks,
// each with the prefix "c_"), so that a slow start can be told from a slow model. Nothing in the order or the work changes; a mark is a number of milliseconds. Page only.

const state = { t0: 0, marks: {} };
const clock = () => (typeof globalThis.performance?.now === 'function' ? globalThis.performance.now() : Date.now());

export const sendMarks = {
  /** The person pressed Send: the clock starts and the marks of the message before are forgotten. */
  begin() {
    state.t0 = clock();
    state.marks = {};
  },
  /** `label`: a short name (letters and underscores). A mark is set once per message (the first time wins). */
  mark(label) {
    if (!state.t0 || label in state.marks) return;
    state.marks[label] = Math.max(0, Math.round(clock() - state.t0));
  },
  /** The marks so far, for the request of the reply (an empty object when nothing was marked). */
  snapshot: () => ({ ...state.marks })
};
