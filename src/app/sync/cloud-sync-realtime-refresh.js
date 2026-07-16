function normalizeSequence(value) {
  if (typeof value === 'bigint') return value >= 0n ? value : null;
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 ? BigInt(value) : null;
  }
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) return null;
  try {
    return BigInt(value.trim());
  } catch {
    return null;
  }
}

export function createConversationRealtimeRefreshScheduler({
  getSync,
  schedule = (callback, delay) => globalThis.setTimeout(callback, delay),
  cancel = timer => globalThis.clearTimeout(timer),
  delay = 150,
  logger = console
} = {}) {
  let timer = null;
  let pendingSequence = null;
  let forced = false;
  let stopped = false;
  let work = Promise.resolve();

  const getWatermark = () => normalizeSequence(getSync?.()?.getStatus?.()?.currentRemoteWatermark);
  const settlePendingSequence = () => {
    const watermark = getWatermark();
    if (pendingSequence != null && watermark != null && watermark >= pendingSequence) {
      pendingSequence = null;
    }
  };
  const hasPendingWork = () => {
    settlePendingSequence();
    return forced || pendingSequence != null;
  };

  const enqueueRefresh = () => {
    timer = null;
    work = work
      .catch(() => {})
      .then(async () => {
        if (stopped) return;
        const sync = getSync?.();
        if (!sync?.getStatus?.().enabled) return;
        settlePendingSequence();
        const forceThisRefresh = forced;
        forced = false;
        if (!forceThisRefresh && pendingSequence == null) return;
        await sync.retry();
        settlePendingSequence();
      })
      .catch(error => {
        logger.warn('Noureon conversation realtime refresh failed:', error);
      });
  };

  const arm = () => {
    if (timer != null) cancel(timer);
    timer = schedule(enqueueRefresh, delay);
  };

  const request = payload => {
    if (stopped) return false;
    const sequence = normalizeSequence(payload?.new?.sync_seq);
    if (sequence == null) {
      forced = true;
    } else {
      const watermark = getWatermark();
      if (watermark != null && sequence <= watermark && !forced) return false;
      if (pendingSequence == null || sequence > pendingSequence) pendingSequence = sequence;
    }
    arm();
    return true;
  };

  const resume = () => {
    if (stopped || !hasPendingWork()) return false;
    arm();
    return true;
  };

  const stop = () => {
    stopped = true;
    if (timer != null) cancel(timer);
    timer = null;
    pendingSequence = null;
    forced = false;
  };

  return { request, resume, stop };
}
