// HTML preview: the page runs in a sandboxed frame, so its scripts, buttons
// and animations work while it stays isolated from the app. Without
// allow-same-origin the frame has an opaque origin: it cannot read Noureon's
// storage, cookies, conversations or keys, reach the page around it, open
// windows, submit forms, show dialogs or navigate the app. It may load
// content from other websites, as any web page can (the owner's choice).

const SANDBOX = 'allow-scripts';

/**
 * Renders the HTML file in `blob` into `host`. Returns { pageCount, dispose }.
 */
export async function renderHtmlPreview(blob, host, { document = globalThis.document } = {}) {
  const source = await blob.text();
  const frame = document.createElement('iframe');
  frame.setAttribute('sandbox', SANDBOX);
  frame.setAttribute('referrerpolicy', 'no-referrer');
  frame.title = 'HTML';
  frame.style.cssText = 'display:block;width:100%;height:min(70vh,720px);border:1px solid #d4d4d4;border-radius:4px;background:#fff;';
  host.replaceChildren(frame);
  // The page loads once the frame has its size: a frame loaded while the
  // preview dialog is still opening can stay at 0 × 0 and never paint.
  // Background tabs run no animation frames, so a timer stands in.
  const view = document.defaultView || globalThis;
  const nextFrame = () => new Promise((resolve) => {
    const timer = view.setTimeout(resolve, 50);
    view.requestAnimationFrame?.(() => {
      view.clearTimeout(timer);
      resolve();
    });
  });
  await nextFrame();
  await nextFrame();
  frame.srcdoc = source;
  return {
    pageCount: 1,
    dispose() {
      // Stops the page's scripts, timers and network requests.
      frame.srcdoc = '';
      frame.remove();
    }
  };
}
