// Reads the live channel of a run of the server (server-sent events: lines `data: {json}`), the same way for every kind of run. Resolves
// when the channel is over (the server ended it, or a `done` was heard), or when it cannot be had or stays silent too long: the caller
// then looks at the run itself.

const IDLE_MS = 40_000;

/**
 * `onEvent(event)` gets every event; return 'done' from it to stop reading. Resolves { done: boolean } (false: the channel was not
 * available or broke; the run may still be going on).
 */
export async function readRunStream({
  url,
  token,
  fetchImpl,
  signal,
  onEvent,
  idleMs = IDLE_MS,
  now = () => Date.now(),
  setRepeating = (...args) => setInterval(...args),
  clearRepeating = (...args) => clearInterval(...args)
}) {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener?.('abort', onAbort, { once: true });
  let lastData = now();
  const watchdog = setRepeating(() => { if (now() - lastData > idleMs) controller.abort(); }, 5000);
  try {
    const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
    if (!response.ok || !response.body) return { done: false };
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return { done: false };
      lastData = now();
      buffer += decoder.decode(value, { stream: true });
      for (let end = buffer.indexOf('\n\n'); end >= 0; end = buffer.indexOf('\n\n')) {
        const line = buffer.slice(0, end).split('\n').find((text) => text.startsWith('data: '));
        buffer = buffer.slice(end + 2);
        if (!line) continue;
        let event = null;
        try {
          event = JSON.parse(line.slice(6));
        } catch {
          continue;
        }
        if (onEvent(event) === 'done') return { done: true };
      }
    }
  } catch {
    return { done: false };
  } finally {
    clearRepeating(watchdog);
    signal?.removeEventListener?.('abort', onAbort);
    controller.abort();
  }
}
