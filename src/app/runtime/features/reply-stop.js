// Stops the reply that is being written and waits until it has finished: the last words are kept and the chat is released
// (the abort controller is cleared when the reply's work is over). Used before an edit cuts the conversation, so the reply
// cannot add itself back after the cut.

const WAIT_STEP_MS = 50;
const WAIT_STEPS_MAX = 100;

export async function stopReplyAndWait({
  getAbortController,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
}) {
  const running = getAbortController();
  if (!running) return false;
  running.abort();
  for (let waited = 0; getAbortController() === running && waited < WAIT_STEPS_MAX; waited += 1) await wait(WAIT_STEP_MS);
  return true;
}
