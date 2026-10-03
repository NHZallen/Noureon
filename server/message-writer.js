// Writes the reply into the person's message as it grows, the way the browser does: the same message id, at most one write in
// 750 ms while it streams, and a last write that says how it ended. Writes go one after another, so a slow one never lets an
// older text arrive after a newer one.

export const WRITE_INTERVAL_MS = 750;

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
  onError = () => {}
}) {
  let latest = null;
  let lastWriteAt = 0;
  let timer = null;
  let chain = Promise.resolve();
  let finished = false;

  const write = (parts, status, extraMetadata = null) => {
    chain = chain.then(async () => {
      try {
        await store.rpc('server_upsert_workspace_message', {
          p_user_id: userId,
          p_row: { id: messageId, conversation_id: conversationId, role: 'model', parts, status, sequence, ...(metadata || extraMetadata ? { metadata: { ...(metadata || {}), ...(extraMetadata || {}) } } : {}) }
        });
        lastWriteAt = now();
      } catch (error) {
        onError(error);
        // A final write that failed is the caller's to hear of; a streaming one is replaced by the next.
        if (status !== 'streaming') throw error;
      }
    });
    return chain;
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
