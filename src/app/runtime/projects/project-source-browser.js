// The readers that need the browser for the sources of a project: JSZip and the DOMParser for the office files, the PDF library for the text layer of a PDF and for drawing its pages. Loaded only
// when a person adds a file (the PDF library is big), by the page of the projects.

export const loadOfficeDeps = async () => ({ JSZip: (await import('jszip')).default, DOMParser: globalThis.DOMParser });

let pdfModule = null;

const loadPdf = async () => {
  if (!pdfModule) {
    const [pdfjs, worker] = await Promise.all([import('pdfjs-dist/legacy/build/pdf.min.mjs'), import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')]);
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    pdfModule = pdfjs;
  }
  return pdfModule;
};

const open = async (bytes) => (await loadPdf()).getDocument({ data: bytes, isEvalSupported: false, enableXfa: false, useSystemFonts: false, disableAutoFetch: true, stopAtErrors: false }).promise;

/** The text of a PDF, page by page (a page break is a blank line). A PDF that is only pictures gives ''. */
export async function readPdfText(bytes) {
  const pdf = await open(bytes);
  const pages = [];
  try {
    for (let number = 1; number <= pdf.numPages; number += 1) {
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) => `${item.str || ''}${item.hasEOL ? '\n' : ' '}`).join('').replace(/ +\n/g, '\n').trim());
      page.cleanup();
      if (pages.join('\n\n').length > 400_000) break;
    }
  } finally {
    await pdf.destroy();
  }
  return pages.filter(Boolean).join('\n\n');
}

/** The first pages of a PDF drawn as pictures (JPEG, about 1500 pixels on the longest side) for a model that sees, when the PDF has no text layer. */
export async function renderPdfPages(bytes, { maxPages = 8 } = {}) {
  const pdf = await open(bytes);
  const pages = [];
  try {
    for (let number = 1; number <= Math.min(pdf.numPages, maxPages); number += 1) {
      const page = await pdf.getPage(number);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(2, 1500 / Math.max(base.width, base.height)) });
      const canvas = new OffscreenCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
      pages.push({ mimeType: 'image/jpeg', bytes: new Uint8Array(await blob.arrayBuffer()) });
      page.cleanup();
    }
  } finally {
    await pdf.destroy();
  }
  return pages;
}
