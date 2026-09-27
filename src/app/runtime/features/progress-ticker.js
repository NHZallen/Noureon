export function createProgressTicker(scheduleTimeout, clearScheduledTimeout) {
  const startProgressTicker = (tick, intervalMs = 250) => {
    let stopped = false;
    let timerId = null;
    const run = () => {
      if (stopped) return;
      tick();
      timerId = scheduleTimeout(run, intervalMs);
    };
    timerId = scheduleTimeout(run, intervalMs);
    return () => {
      stopped = true;
      if (timerId) clearScheduledTimeout(timerId);
    };
  };
  const stopProgressTicker = ticker => {
    if (typeof ticker === 'function') ticker();
    else if (ticker) clearScheduledTimeout(ticker);
  };
  return { startProgressTicker, stopProgressTicker };
}
