// The readers that need the browser for the sources of a project: JSZip and the DOMParser for the office files, the PDF library for the text layer of a PDF. Loaded only when a person adds a
// file (the PDF library is big), by the page of the projects.

export const loadOfficeDeps = async () => ({ JSZip: (await import('jszip')).default, DOMParser: globalThis.DOMParser });

let pdfModule = null;

/** The text of a PDF, page by page (a page break is a blank line). A PDF that is only pictures gives ''. */
export async function readPdfText(bytes) {
  if (!pdfModule) {
    const [pdfjs, worker] = await Promise.all([import('pdfjs-dist/legacy/build/pdf.min.mjs'), import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')]);
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    pdfModule = pdfjs;
  }
  const pdf = await pdfModule.getDocument({ data: bytes, isEvalSupported: false, enableXfa: false, useSystemFonts: false, disableAutoFetch: true, stopAtErrors: false }).promise;
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
