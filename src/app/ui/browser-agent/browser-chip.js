// The chip of the browser agent in the box of the message, like the one of the search (Allen, 2026-11-20): while the browser agent is on for the conversation that is open and the model can use it,
// a chip with its mark and its name stands among the chips of the box, and a press on its cross turns it off. It is the sign that it is on, so there is no line in the corner of the screen when it is
// switched (ui/browser-agent/browser-agent-menu.js only says so when it cannot be done).

import { isBrowserOn, setBrowserOn } from '../../runtime/server-reply/browser-switch.js';

export const BROWSER_CHIP_ID = 'browser-agent-indicator';
export const BROWSER_SWITCH_EVENT = 'noureon:browser-switch-changed';

let rerender = null;
let listening = false;

/**
 * Adds the chip to the map of the chips of the box. deps: map, conv (the conversation), canUse (the model of the conversation can use it), text(key, fallback), iconHtml,
 * chipCloseButton(id, label), rerender() (draws the chips again), win.
 */
export function addBrowserIndicator({ map, conv, canUse, text, iconHtml, chipCloseButton, rerender: draw, win = globalThis.window }) {
  rerender = draw;
  if (!listening && win?.addEventListener) {
    listening = true;
    win.addEventListener(BROWSER_SWITCH_EVENT, () => { try { rerender?.(); } catch { /* the chips are drawn at the next change */ } });
  }
  if (!conv || conv.retentionMode === 'ephemeral' || !canUse || !isBrowserOn(conv.id)) return;
  const label = text('baMenuLabel', 'Browser agent');
  const closeId = 'close-browser-agent-btn-input';
  map.set(BROWSER_CHIP_ID, {
    id: BROWSER_CHIP_ID,
    html: `<span class="input-indicator-content flex items-center gap-2"><span class="input-indicator-leading">${iconHtml}</span><span></span></span>${chipCloseButton(closeId, text('baChipClose', 'Turn off the browser agent'))}`,
    eventListener: (element) => {
      const name = element.querySelector('.input-indicator-content > span:last-child');
      if (name) name.textContent = label;
      element.querySelector(`#${closeId}`)?.addEventListener('click', () => {
        setBrowserOn(conv.id, false);
        draw();
      });
    }
  });
}
