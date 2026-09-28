// PDF preview: PDF.js draws each page of the generated file to a canvas, so
// the preview is the downloaded file on every device (Android Chrome cannot
// show PDFs in a page at all). Pages are drawn as they come into view, at
// the resolution of the screen. Links work as in a PDF reader: web and mail
// links open in a new tab, internal links (the table of contents) scroll to
// their page.

import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.min.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

const PAGE_GAP_PX = 16;
const CSS_PX_PER_PT = 96 / 72;
const SAFE_LINK = /^(?:https?:|mailto:)/i;

const PREVIEW_STYLE = `
  :host { all: initial; display: block; }
  .pages { display: flex; flex-direction: column; align-items: center; gap: ${PAGE_GAP_PX}px; }
  .page {
    position: relative;
    background: #fff;
    box-shadow: 0 1px 3px rgba(15, 23, 42, 0.18), 0 8px 24px rgba(15, 23, 42, 0.08);
    max-width: 100%;
  }
  .page canvas { display: block; width: 100%; height: 100%; }
  .page a { position: absolute; display: block; }
  .page a:focus-visible { outline: 2px solid #2563eb; outline-offset: 1px; }
`;

let workerConfigured = false;

/**
 * Renders `blob` into `host` (which gets its own shadow root) and returns
 * { pageCount, dispose }. Throws when the file cannot be read.
 */
export async function renderPdfPreview(blob, host, { window = globalThis.window, document = globalThis.document } = {}) {
  if (!workerConfigured) {
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    workerConfigured = true;
  }
  const task = pdfjs.getDocument({
    data: new Uint8Array(await blob.arrayBuffer()),
    isEvalSupported: false,
    enableXfa: false,
    // The file embeds every font it uses; nothing is fetched.
    useSystemFonts: false,
    disableAutoFetch: true,
    stopAtErrors: false
  });
  const pdf = await task.promise;

  const shadow = host.shadowRoot || host.attachShadow({ mode: 'open' });
  shadow.replaceChildren();
  const style = document.createElement('style');
  style.textContent = PREVIEW_STYLE;
  const list = document.createElement('div');
  list.className = 'pages';
  shadow.append(style, list);

  const pages = [];
  for (let number = 1; number <= pdf.numPages; number += 1) {
    const page = await pdf.getPage(number);
    const viewport = page.getViewport({ scale: 1 });
    const element = document.createElement('div');
    element.className = 'page';
    element.dataset.page = String(number);
    element.style.width = `${Math.round(viewport.width * CSS_PX_PER_PT)}px`;
    element.style.aspectRatio = `${viewport.width} / ${viewport.height}`;
    list.appendChild(element);
    pages.push({ number, page, viewport, element, drawnWidth: 0, task: null, links: false });
  }

  const scrollToPage = async (dest) => {
    try {
      const explicit = typeof dest === 'string' ? await pdf.getDestination(dest) : dest;
      if (!Array.isArray(explicit)) return;
      const index = typeof explicit[0] === 'object' ? await pdf.getPageIndex(explicit[0]) : Number(explicit[0]);
      const target = pages[index];
      if (!target) return;
      // XYZ destinations carry the top of the target in PDF units.
      const top = explicit[1]?.name === 'XYZ' && Number.isFinite(explicit[3]) ? explicit[3] : null;
      const offset = top === null ? 0 : ((target.viewport.height - top) / target.viewport.height) * target.element.clientHeight;
      const scroller = host.closest?.('.ac-file-preview-body') || host.parentElement;
      const hostTop = target.element.getBoundingClientRect().top - (scroller?.getBoundingClientRect().top || 0);
      if (scroller) scroller.scrollTop += hostTop + offset - 8;
      else target.element.scrollIntoView({ block: 'start' });
    } catch {
      // A broken destination simply does not scroll.
    }
  };

  const addLinks = async (entry) => {
    if (entry.links) return;
    entry.links = true;
    const annotations = await entry.page.getAnnotations({ intent: 'display' });
    for (const annotation of annotations) {
      if (annotation.subtype !== 'Link') continue;
      const url = annotation.url || annotation.unsafeUrl;
      if (!annotation.dest && !(url && SAFE_LINK.test(url))) continue;
      const [x1, y1, x2, y2] = pdfjs.Util.normalizeRect(annotation.rect);
      const link = document.createElement('a');
      link.style.left = `${(x1 / entry.viewport.width) * 100}%`;
      link.style.top = `${((entry.viewport.height - y2) / entry.viewport.height) * 100}%`;
      link.style.width = `${((x2 - x1) / entry.viewport.width) * 100}%`;
      link.style.height = `${((y2 - y1) / entry.viewport.height) * 100}%`;
      if (url && SAFE_LINK.test(url)) {
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.title = url;
      } else {
        link.href = '#';
        link.addEventListener('click', (event) => {
          event.preventDefault();
          scrollToPage(annotation.dest);
        });
      }
      entry.element.appendChild(link);
    }
  };

  const draw = async (entry) => {
    const cssWidth = entry.element.clientWidth || entry.viewport.width * CSS_PX_PER_PT;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.round(cssWidth * ratio);
    if (Math.abs(width - entry.drawnWidth) < 2) return;
    entry.task?.cancel();
    const viewport = entry.page.getViewport({ scale: width / entry.viewport.width });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const task = entry.page.render({ canvas, viewport, annotationMode: pdfjs.AnnotationMode.DISABLE });
    entry.task = task;
    try {
      await task.promise;
    } catch (error) {
      if (error?.name === 'RenderingCancelledException') return;
      throw error;
    }
    entry.task = null;
    entry.drawnWidth = width;
    entry.element.querySelector('canvas')?.remove();
    entry.element.prepend(canvas);
    await addLinks(entry);
  };

  const visible = new Set();
  const drawVisible = () => visible.forEach((entry) => { draw(entry).catch(() => {}); });
  const intersection = typeof window.IntersectionObserver === 'function'
    ? new window.IntersectionObserver((records) => {
      records.forEach((record) => {
        const entry = pages.find((candidate) => candidate.element === record.target);
        if (!entry) return;
        if (record.isIntersecting) {
          visible.add(entry);
          draw(entry).catch(() => {});
        } else {
          visible.delete(entry);
        }
      });
    }, { rootMargin: '600px 0px' })
    : null;
  if (intersection) {
    pages.forEach((entry) => intersection.observe(entry.element));
  } else {
    pages.forEach((entry) => visible.add(entry));
    drawVisible();
  }
  // Drawn pages follow the dialog's width (rotating a phone, resizing).
  let resizeTimer = null;
  const resize = typeof window.ResizeObserver === 'function'
    ? new window.ResizeObserver(() => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(drawVisible, 150);
    })
    : null;
  resize?.observe(host);
  if (pages[0]) await draw(pages[0]);

  return {
    pageCount: pdf.numPages,
    dispose() {
      intersection?.disconnect();
      resize?.disconnect();
      window.clearTimeout(resizeTimer);
      pages.forEach((entry) => entry.task?.cancel());
      shadow.replaceChildren();
      task.destroy();
    }
  };
}
