export async function retryAsync(operation, {
  maxAttempts = 3,
  delays = [250, 1000],
  wait = delay => new Promise(resolve => setTimeout(resolve, delay)),
  shouldRetry = () => true,
  onRetry = () => {}
} = {}) {
  if (typeof operation !== 'function') throw new TypeError('A retry operation is required.');
  const attempts = Math.max(1, Math.trunc(maxAttempts) || 1);
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || !shouldRetry(error, attempt)) break;
      onRetry(error, attempt);
      const delay = delays[Math.min(attempt - 1, Math.max(0, delays.length - 1))] || 0;
      if (delay > 0) await wait(delay);
    }
  }

  throw lastError;
}
