// Colours code blocks wherever they appear (chat messages, council details,
// the file preview's source view): new <pre><code> elements are found as
// they are added and coloured by code-highlighter.js, which loads the first
// time a code block is shown. Kept tiny because it runs at startup.

const SELECTOR = 'pre > code:not([data-highlighted])';
const DELAY_MS = 120;

export function installCodeHighlighting({ document, window, root = document?.body, load = () => import('./code-highlighter.js') } = {}) {
  if (!root || typeof window?.MutationObserver !== 'function') return () => {};
  let highlighter = null;
  let timer = null;
  const ensure = () => {
    highlighter ||= load().then((module) => {
      module.installHighlightStyles(document);
      return module;
    });
    highlighter.catch(() => { highlighter = null; });
    return highlighter;
  };
  const scan = async () => {
    timer = null;
    if (!root.querySelector(SELECTOR)) return;
    try {
      const module = await ensure();
      root.querySelectorAll(SELECTOR).forEach((code) => {
        // A block still being streamed is coloured once it is complete.
        if (code.closest('.streaming-current-line')) return;
        module.highlightCode(code);
      });
    } catch {
      // Without the highlighter code stays plain.
    }
  };
  const schedule = () => {
    if (timer === null) timer = window.setTimeout(scan, DELAY_MS);
  };
  const observer = new window.MutationObserver(schedule);
  observer.observe(root, { childList: true, subtree: true });
  schedule();
  return () => {
    observer.disconnect();
    if (timer !== null) window.clearTimeout(timer);
  };
}
