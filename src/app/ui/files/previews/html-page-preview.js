// HTML preview: the page runs in a sandboxed frame, so its scripts, buttons
// and animations work while it stays isolated from the app. The app's own
// Content-Security-Policy refuses inline scripts, which an HTML file has, so
// the file is shown by a page on the sandbox origin (run.noureon.com,
// public/sandbox/html-preview.js) that has a policy for it; the file runs in
// a frame of that page with sandbox="allow-scripts" and no allow-same-origin.
// So the file has an opaque origin: it cannot read Noureon's storage, cookies,
// conversations or keys, reach the page around it, open windows, submit forms,
// show dialogs or navigate the app. It may load content from other websites,
// as any web page can (the owner's choice).
// Where no sandbox origin exists (a preview deployment, a phone reaching the
// dev server by IP) the file goes straight into a sandboxed frame of the app.

import { resolveSandboxOrigin } from '../../../runtime/sandbox/sandbox-protocol.js';

const SANDBOX = 'allow-scripts';
const MESSAGE_TYPE = 'noureon-html-preview';
const FRAME_STYLE = 'display:block;width:100%;height:min(70vh,720px);border:1px solid #d4d4d4;border-radius:4px;background:#fff;';

/**
 * Renders the HTML file in `blob` into `host`. Returns { pageCount, dispose }.
 */
export async function renderHtmlPreview(blob, host, { document = globalThis.document } = {}) {
  const source = await blob.text();
  const view = document.defaultView || globalThis;
  const sandboxOrigin = resolveSandboxOrigin(view.location, import.meta.env?.VITE_SANDBOX_ORIGIN || '');
  const frame = document.createElement('iframe');
  frame.setAttribute('referrerpolicy', 'no-referrer');
  frame.title = 'HTML';
  frame.style.cssText = FRAME_STYLE;
  // On the sandbox origin the page around the file does the sandboxing; the
  // frame the app owns only has to be allowed to run that page's script.
  frame.setAttribute('sandbox', sandboxOrigin ? 'allow-scripts allow-same-origin' : SANDBOX);
  host.replaceChildren(frame);
  // The page loads once the frame has its size: a frame loaded while the
  // preview dialog is still opening can stay at 0 × 0 and never paint.
  // Background tabs run no animation frames, so a timer stands in.
  const nextFrame = () => new Promise((resolve) => {
    const timer = view.setTimeout(resolve, 50);
    view.requestAnimationFrame?.(() => {
      view.clearTimeout(timer);
      resolve();
    });
  });
  await nextFrame();
  await nextFrame();
  if (sandboxOrigin) {
    frame.addEventListener('load', () => {
      // The preview page is the only thing that may answer, and it is told only the file's text.
      frame.contentWindow?.postMessage({ type: MESSAGE_TYPE, source }, sandboxOrigin);
    }, { once: true });
    frame.src = `${sandboxOrigin}/sandbox/html-preview.html`;
  } else {
    frame.srcdoc = source;
  }
  return {
    pageCount: 1,
    dispose() {
      // Stops the page's scripts, timers and network requests.
      frame.removeAttribute('src');
      frame.srcdoc = '';
      frame.remove();
    }
  };
}
