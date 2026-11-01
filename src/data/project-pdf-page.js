// A page of a scanned PDF as a picture, for the search by meaning and for the model to look at (docs/superpowers/specs/2026-11-01-project-files-multimodal-design.md, R8): the page is drawn by
// pdf.js on a canvas and kept as a JPEG of at most `side` pixels on the longest side. The page and the server draw on their own canvas (the browser's; the one of @napi-rs/canvas), so the library
// and the canvas are given. Pure: no window, no document, no browser storage.

export const PDF_PAGE_SIDE = 1024;
const PDF_PAGE_QUALITY = 82;

/**
 * `pdfjs` is the library (`getDocument`); `canvasFactory(width, height)` gives { canvas, context, toJpeg(quality) -> Uint8Array | Promise<Uint8Array> }.
 * Resolves { pages, render(number, { side }) -> { mimeType: 'image/jpeg', bytes (Uint8Array) }, close() }; `render` rejects for a page that is not there or cannot be drawn.
 */
export async function openPdfPages({ pdfjs, bytes, canvasFactory }) {
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true, isEvalSupported: false, disableFontFace: true });
  const doc = await task.promise;
  return {
    pages: doc.numPages,
    async render(number, { side = PDF_PAGE_SIDE } = {}) {
      if (!Number.isInteger(number) || number < 1 || number > doc.numPages) throw new Error('There is no such page.');
      const page = await doc.getPage(number);
      try {
        const base = page.getViewport({ scale: 1 });
        const scale = Math.min(4, side / Math.max(base.width, base.height));
        const viewport = page.getViewport({ scale });
        const surface = canvasFactory(Math.max(1, Math.ceil(viewport.width)), Math.max(1, Math.ceil(viewport.height)));
        // A page with clear places would turn black as a JPEG.
        surface.context.fillStyle = 'white';
        surface.context.fillRect(0, 0, surface.canvas.width, surface.canvas.height);
        await page.render({ canvasContext: surface.context, canvas: surface.canvas, viewport }).promise;
        return { mimeType: 'image/jpeg', bytes: await surface.toJpeg(PDF_PAGE_QUALITY) };
      } finally {
        page.cleanup?.();
      }
    },
    close: () => doc.destroy?.()
  };
}
