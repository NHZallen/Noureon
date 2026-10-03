// Writes the reply into the person's message as it grows, the way the browser does: the same message id, at most one write in
// 300 ms while it streams, and a last write that says how it ended. Writes go one after another, so a slow one never lets an
// older text arrive after a newer one.

export const WRITE_INTERVAL_MS = 300;

export function createMessageWriter({
  store,
  userId,
  conversationId,
  messageId,
  sequence,
  metadata = null,
  interval = WRITE_INTERVAL_MS,
  now = () => Date.now(),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  onError = () => {},
  // Called after a write that says how the reply ended (not the streaming ones), so the log can tell it landed.
  onWritten = () => {},
  // A last write that fails is tried again this many times (a moment apart) before the caller hears of it.
  retries = 3,
  retryWait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
}) {
  let latest = null;
  let lastWriteAt = 0;
  let timer = null;
  let chain = Promise.resolve();
  let finished = false;

  const write = (parts, status, extraMetadata = null) => {
    // A write that failed must not stop the ones after it (the error written when the end of a reply fails): the chain goes on, the caller hears.
    const result = chain.then(async () => {
      const row = { id: messageId, conversation_id: conversationId, role: 'model', parts, status, sequence, ...(metadata || extraMetadata ? { metadata: { ...(metadata || {}), ...(extraMetadata || {}) } } : {}) };
      // A streaming write is replaced by the next one; the one that ends the reply is the only copy, so it is tried again.
      for (let attempt = 0; ; attempt += 1) {
        try {
          await store.rpc('server_upsert_workspace_message', { p_user_id: userId, p_row: row });
          lastWriteAt = now();
          if (status !== 'streaming') onWritten(status, attempt);
          return;
        } catch (error) {
          onError(error);
          if (status === 'streaming') return;
          if (attempt >= retries) throw error;
          await retryWait(500 * 2 ** attempt);
        }
      }
    });
    chain = result.catch(() => {});
    return result;
  };

  const flushLatest = () => {
    timer = null;
    if (finished || !latest) return;
    const parts = latest;
    latest = null;
    void write(parts, 'streaming').catch(() => {});
  };

  return {
    /** The text so far (parts of the message). Written now if it has been long enough, else soon. */
    update(parts) {
      if (finished) return;
      latest = parts;
      if (timer) return;
      const wait = Math.max(0, lastWriteAt + interval - now());
      if (wait === 0) flushLatest();
      else timer = setTimer(flushLatest, wait);
    },
    /** The last write: `status` is 'complete' or 'error'; `extraMetadata` is added to the message's metadata. Waits for it. */
    async finish(parts, status = 'complete', extraMetadata = null) {
      finished = true;
      if (timer) {
        clearTimer(timer);
        timer = null;
      }
      latest = null;
      await write(parts, status, extraMetadata);
    }
  };
}
