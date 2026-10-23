// A message that arrives whole (the result of the visual check) is typed in below what is already there instead of being set down at once:
// its words appear in order, a block (a line of a list, a paragraph) showing from its first letter, the chat following them down unless the
// reader has scrolled up. Its files wait as grey placeholders (styles/chat-streaming.css) and come in when the words are done.

import { revealArrival } from './arrival-reveal.js';

// What is shown at once and never typed: the panel of the run, the files, buttons, pictures, formulas and code.
const LEAVE_ALONE = '.sandbox-run, .ac-file-card, button, svg, pre, .katex, img';
const BLOCKS = 'p, li, h1, h2, h3, h4, h5, h6, blockquote, tr';
const FRAMES = 180;

const typedTexts = (node, out = []) => {
  for (const child of node.childNodes || []) {
    if (child.nodeType === 3) {
      if (child.data.trim() && !child.parentElement?.closest(LEAVE_ALONE)) out.push(child);
    } else if (child.nodeType === 1 && !child.matches?.(LEAVE_ALONE)) typedTexts(child, out);
  }
  return out;
};

/**
 * Types the words of the drawn message `element` in. Resolves when it is done (or when the message is gone from the page).
 * `follow(element)` is told after each step so the chat can follow the words down. `revealFiles: false` for a message whose files are not there yet
 * (a grey card holds their place): nothing rises in when the words are done.
 */
export function streamInMessage(element, { requestFrame = (callback) => globalThis.requestAnimationFrame(callback), follow = () => {}, reducedMotion = false, revealFiles = true } = {}) {
  const content = element?.querySelector?.('.message-content');
  if (!content || reducedMotion) return Promise.resolve(false);
  const nodes = typedTexts(content).map((node) => ({ node, full: node.data, block: node.parentElement?.closest(BLOCKS) || null }));
  const total = nodes.reduce((sum, entry) => sum + entry.full.length, 0);
  if (!total) return Promise.resolve(false);
  element.classList.add('is-awaiting-files');
  for (const entry of nodes) {
    entry.node.data = '';
    entry.block?.classList.add('stream-pending');
  }
  const perFrame = Math.max(2, Math.ceil(total / FRAMES));
  let index = 0;
  let shown = 0;
  return new Promise((resolve) => {
    const finish = () => {
      element.classList.remove('is-awaiting-files');
      if (revealFiles) revealArrival(element, 'is-arriving-files');
      resolve(true);
    };
    const step = () => {
      if (!element.isConnected) return resolve(false);
      let budget = perFrame;
      while (budget > 0 && index < nodes.length) {
        const entry = nodes[index];
        entry.block?.classList.remove('stream-pending');
        const take = Math.min(budget, entry.full.length - shown);
        shown += take;
        budget -= take;
        entry.node.data = entry.full.slice(0, shown);
        if (shown >= entry.full.length) {
          index += 1;
          shown = 0;
        }
      }
      follow(element);
      if (index >= nodes.length) finish();
      else requestFrame(step);
    };
    requestFrame(step);
  });
}
