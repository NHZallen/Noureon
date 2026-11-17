// The tag of a finished browser task (the pill that says "Done") while the browser itself is still open: the host closes a browser nobody has used for a while (design doc §2.3), and
// until now the tag said nothing about it. While a tag is on the screen this asks, once a minute, where the browser stands (runtime/browser-agent/browser-status-client.js):
//   - from 20 minutes before it closes the tag says how long is left ("Idle · closes in 19 min"), changing every minute; at 20 and at 10 minutes a notice says it too;
//   - when the host closed it, the tag says so ("Closed (idle for too long)");
//   - when the browser was used again, or is not there, the tag has its own words back.
// Only the last tag of the conversation that is open is touched, and only when the browser is the one of this conversation. Plain DOM and timers, no state kept anywhere.

const POLL_MS = 60_000;
const SHOW_MS = 10_000;
const FIRST_NOTICE_MIN = 20;
const SECOND_NOTICE_MIN = 10;

/**
 * deps: document, getActiveConversation(), getStatus(), words(key, params) (the text in the language of the page), showNotification(message, kind), now(), setRepeat / clearRepeat.
 * Returns { poll, stop }: `poll()` asks once and puts the tag up to date (also what the timer does).
 */
export function createBrowserIdleWatch({ document, getActiveConversation, getStatus, words, showNotification = () => {}, now = Date.now, setRepeat = (...a) => setInterval(...a), clearRepeat = (...a) => clearInterval(...a) }) {
  let deadline = 0;
  let closed = '';
  let noticed = new Set();
  let timers = [];

  const lastTag = () => {
    const tags = document.querySelectorAll('.bcard-pill.is-tag');
    const pill = tags[tags.length - 1] || null;
    return pill ? { pill, text: pill.querySelector('.bcard-text') } : null;
  };
  const setText = (tag, value) => {
    if (!tag?.text) return;
    if (tag.text.dataset.idleOriginal === undefined) tag.text.dataset.idleOriginal = tag.text.textContent;
    if (tag.text.textContent !== value) tag.text.textContent = value;
  };
  const restore = (tag) => {
    if (tag?.text && tag.text.dataset.idleOriginal !== undefined) {
      tag.text.textContent = tag.text.dataset.idleOriginal;
      delete tag.text.dataset.idleOriginal;
    }
  };

  // The tag as it should be now, from what was last heard.
  const show = () => {
    const tag = lastTag();
    if (!tag) return;
    if (closed) { const sentence = words('browserIdleClosed'); if (sentence) setText(tag, sentence); return; }
    if (!deadline) { restore(tag); return; }
    const minutes = Math.max(1, Math.ceil((deadline - now()) / 60_000));
    if (minutes > FIRST_NOTICE_MIN) { restore(tag); return; }
    const sentence = words('browserIdleLeft', { minutes });
    if (!sentence) return;
    setText(tag, sentence);
    for (const mark of [FIRST_NOTICE_MIN, SECOND_NOTICE_MIN]) {
      if (minutes <= mark && !noticed.has(mark)) {
        noticed.add(mark);
        // A notice for the first mark only when it is the one just reached (a page opened at 8 minutes says it once, not twice).
        if (mark === FIRST_NOTICE_MIN && minutes < SECOND_NOTICE_MIN + 1) continue;
        showNotification(sentence, 'info');
      }
    }
  };

  async function poll() {
    if (document.hidden || !lastTag()) return;
    const conversation = getActiveConversation?.();
    const status = await getStatus().catch(() => null);
    if (!status || !conversation) return;
    if (status.open && status.conversationId && status.conversationId === conversation.id && Number.isFinite(status.idleMsLeft)) {
      closed = '';
      const next = now() + status.idleMsLeft;
      // Used again: the idle time starts over, so the notices may be said again.
      if (deadline && next - deadline > 60_000) noticed = new Set();
      deadline = next;
    } else if (!status.open && status.closedReason === 'idle') {
      closed = 'idle';
      deadline = 0;
    } else {
      closed = '';
      deadline = 0;
    }
    show();
  }

  const start = () => {
    if (timers.length) return;
    timers = [setRepeat(() => { void poll(); }, POLL_MS), setRepeat(show, SHOW_MS)];
    timers.forEach((timer) => timer?.unref?.());
  };
  const stop = () => { timers.forEach((timer) => clearRepeat(timer)); timers = []; };
  start();
  return { poll, show, stop };
}
