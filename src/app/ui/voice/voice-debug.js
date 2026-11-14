// A trace of what voice input really does on a device, for finding out why the waveform behaves as it does (it cannot be seen from a desk: the browser's own
// speech events, the microphone permission, whether the level meter could be opened and what it reads differ by phone and by browser).
//
// Off for everyone. Turned on by opening the site with `?voicedebug=1` (it is remembered in this browser; `?voicedebug=0` turns it off): then each dictation shows a
// small panel with the time of each thing that happened, which can be photographed. It changes nothing in how voice input works.

export const VOICE_DEBUG_KEY = 'noureon-voice-debug';
const MAX_LINES = 60;

/** Whether the trace is on (the address asks for it, or it was asked for before). */
export function voiceDebugEnabled(window) {
  try {
    const asked = new URLSearchParams(window?.location?.search || '').get('voicedebug');
    if (asked === '1') window.localStorage?.setItem(VOICE_DEBUG_KEY, '1');
    else if (asked === '0') window.localStorage?.removeItem(VOICE_DEBUG_KEY);
    return window?.localStorage?.getItem(VOICE_DEBUG_KEY) === '1';
  } catch {
    return false;
  }
}

/** The panel and the list behind it: { log(text), begin(title), close() }. */
export function createVoiceDebug({ document, window, now = () => (window?.performance?.now?.() ?? Date.now()) }) {
  const lines = [];
  let startedAt = now();
  let panel = null;
  let body = null;

  const ensurePanel = () => {
    if (panel || !document?.body) return;
    panel = document.createElement('div');
    panel.setAttribute('data-voice-debug', '');
    panel.style.cssText = 'position:fixed;left:8px;right:8px;top:max(56px,calc(env(safe-area-inset-top,0px) + 8px));z-index:2147483000;max-height:42vh;display:flex;flex-direction:column;border:1px solid var(--border-color);border-radius:12px;background:var(--modal-bg);color:var(--text-primary);font:11px/1.45 ui-monospace,Menlo,monospace;box-shadow:var(--shadow-xl)';
    const head = document.createElement('div');
    head.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:6px 10px;border-bottom:1px solid var(--border-color);color:var(--text-secondary)';
    const title = document.createElement('span');
    title.textContent = 'voice debug';
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '×';
    close.setAttribute('aria-label', 'close');
    close.style.cssText = 'border:0;background:transparent;color:inherit;font-size:16px;line-height:1;padding:0 4px;cursor:pointer';
    close.addEventListener('click', () => { panel?.remove(); panel = null; body = null; });
    head.append(title, close);
    body = document.createElement('div');
    body.style.cssText = 'overflow:auto;padding:6px 10px;white-space:pre-wrap;word-break:break-word';
    panel.append(head, body);
    document.body.append(panel);
  };

  const render = () => {
    if (!body) return;
    body.textContent = lines.join('\n');
    body.scrollTop = body.scrollHeight;
  };

  return {
    lines,
    /** A new dictation: the list starts again and the clock is at 0. */
    begin(title = 'dictation') {
      lines.length = 0;
      startedAt = now();
      lines.push(`--- ${title}`);
      ensurePanel();
      render();
    },
    log(text) {
      const seconds = ((now() - startedAt) / 1000).toFixed(2).padStart(6, ' ');
      lines.push(`${seconds}s ${text}`);
      if (lines.length > MAX_LINES) lines.splice(1, lines.length - MAX_LINES);
      ensurePanel();
      render();
    },
    close() {
      panel?.remove();
      panel = null;
      body = null;
    }
  };
}
