export function createMemoryWorkScheduler({
  runJob,
  delayMs = 15_000,
  retryDelayMs = 60_000,
  schedule = (callback, delay = delayMs) => setTimeout(callback, delay),
  cancel = (timer) => clearTimeout(timer),
  onStatusChange = () => {}
} = {}) {
  if (typeof runJob !== 'function') throw new TypeError('Memory work scheduler requires runJob.');

  const pendingByConversation = new Map();

  function emit(entry, state, error = null) {
    entry.state = state;
    entry.error = error ? String(error?.message || error) : '';
    onStatusChange({
      conversationId: entry.job.conversationId,
      state,
      attempt: entry.attempt || 0,
      error: entry.error
    });
  }

  function scheduleEntry(entry, delay) {
    entry.timer = schedule(async () => {
      const id = entry.job.conversationId;
      if (pendingByConversation.get(id) !== entry) return;
      emit(entry, 'running');
      try {
        await runJob(entry.job);
        if (pendingByConversation.get(id) === entry) pendingByConversation.delete(id);
        emit(entry, 'complete');
      } catch (error) {
        if (pendingByConversation.get(id) !== entry) return;
        const blocked = /cannot interpret this attachment|unavailable|choose a memory model/i.test(String(error?.message || error));
        if (blocked) {
          entry.timer = null;
          emit(entry, 'blocked', error);
          return;
        }
        entry.attempt = Number(entry.attempt || 0) + 1;
        emit(entry, 'retrying', error);
        scheduleEntry(entry, Math.min(retryDelayMs * (2 ** Math.min(entry.attempt - 1, 3)), 10 * 60_000));
      }
    }, delay);
  }

  function enqueueCapture({ conversationId, sourceHash, ...payload }) {
    const id = String(conversationId || '');
    if (!id) throw new TypeError('Memory work requires a conversationId.');

    const previous = pendingByConversation.get(id);
    if (previous) cancel(previous.timer);

    const job = { conversationId: id, sourceHash: String(sourceHash || ''), ...payload };
    const entry = { job, timer: null, state: 'pending', error: '', attempt: 0 };
    pendingByConversation.set(id, entry);
    emit(entry, 'pending');
    scheduleEntry(entry, delayMs);
    return job;
  }

  function cancelConversation(conversationId) {
    const id = String(conversationId || '');
    const entry = pendingByConversation.get(id);
    if (!entry) return false;
    cancel(entry.timer);
    pendingByConversation.delete(id);
    emit(entry, 'cancelled');
    return true;
  }

  return {
    enqueueCapture,
    cancelConversation,
    getPendingJob: (conversationId) => pendingByConversation.get(String(conversationId || ''))?.job || null,
    getStatus: (conversationId) => {
      const entry = pendingByConversation.get(String(conversationId || ''));
      return entry ? { state: entry.state, attempt: entry.attempt || 0, error: entry.error } : { state: 'idle', attempt: 0, error: '' };
    },
    retryBlocked: (conversationId) => {
      const entry = pendingByConversation.get(String(conversationId || ''));
      if (!entry || entry.state !== 'blocked') return false;
      emit(entry, 'pending');
      scheduleEntry(entry, 0);
      return true;
    }
  };
}
