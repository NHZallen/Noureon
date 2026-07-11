export function createMemoryWorkScheduler({
  runJob,
  delayMs = 15_000,
  schedule = (callback) => setTimeout(callback, delayMs),
  cancel = (timer) => clearTimeout(timer)
} = {}) {
  if (typeof runJob !== 'function') throw new TypeError('Memory work scheduler requires runJob.');

  const pendingByConversation = new Map();

  function enqueueCapture({ conversationId, sourceHash, ...payload }) {
    const id = String(conversationId || '');
    if (!id) throw new TypeError('Memory work requires a conversationId.');

    const previous = pendingByConversation.get(id);
    if (previous) cancel(previous.timer);

    const job = { conversationId: id, sourceHash: String(sourceHash || ''), ...payload };
    const entry = { job, timer: null };
    entry.timer = schedule(async () => {
      if (pendingByConversation.get(id) !== entry) return;
      pendingByConversation.delete(id);
      await runJob(job);
    });
    pendingByConversation.set(id, entry);
    return job;
  }

  function cancelConversation(conversationId) {
    const id = String(conversationId || '');
    const entry = pendingByConversation.get(id);
    if (!entry) return false;
    cancel(entry.timer);
    pendingByConversation.delete(id);
    return true;
  }

  return {
    enqueueCapture,
    cancelConversation,
    getPendingJob: (conversationId) => pendingByConversation.get(String(conversationId || ''))?.job || null
  };
}
