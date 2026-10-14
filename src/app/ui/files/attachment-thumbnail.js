// The picture of the first page of a file the person attached (the card in the message box): drawn by the same previews that show a file in full (previews/), so what the
// card shows is what the preview shows. Loaded when the first such file is attached. The page only: it draws with `document`.

const TEXT_PREVIEW_CHARS = 900;
const TEXT_PREVIEW_LINES = 16;

const base64Bytes = (dataUrl) => {
  const binary = atob(String(dataUrl).slice(String(dataUrl).indexOf(',') + 1));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
};

/** The file as a Blob, from the data URL the page keeps it in. */
export const attachmentBlob = (file, { window = globalThis.window } = {}) => new window.Blob([base64Bytes(file.base64)], { type: file.type || 'application/octet-stream' });

const loadJsZip = async () => (await import('../../vendors/archive-vendor.js')).loadArchiveVendor();

/** The Blob with the layout the preview of a presentation or a workbook draws (the same a file Python made gets). */
export async function previewableBlob(file, family, { window = globalThis.window } = {}) {
  const blob = attachmentBlob(file, { window });
  if (family === 'powerpoint' && !blob.presentation) {
    const [{ buildFreePresentation }, JSZip] = await Promise.all([import('../sandbox/free-presentation.js'), loadJsZip()]);
    Object.defineProperty(blob, 'presentation', { value: await buildFreePresentation(blob, { JSZip, window }), configurable: true });
  }
  if (family === 'excel' && !blob.workbook) {
    const [{ readWorkbookLayout }, JSZip] = await Promise.all([import('../sandbox/xlsx-reader.js'), loadJsZip()]);
    Object.defineProperty(blob, 'workbook', { value: { layout: await readWorkbookLayout(blob, { JSZip, DOMParser: window?.DOMParser }) }, configurable: true });
  }
  return blob;
}

/**
 * Draws the first page of the file into `host` (an empty element that fills the thumbnail). Resolves { dispose } when something was drawn, null when the file has
 * no picture to show or cannot be read: the card then keeps the icon of its kind.
 */
export async function drawAttachmentThumbnail({ document, window = globalThis.window, file, family, host }) {
  try {
    if (family === 'text' || family === 'markdown' || family === 'csv') {
      const text = new TextDecoder().decode(base64Bytes(file.base64).slice(0, TEXT_PREVIEW_CHARS * 3)).slice(0, TEXT_PREVIEW_CHARS);
      const lines = text.split(/\r?\n/).slice(0, TEXT_PREVIEW_LINES).join('\n');
      if (!lines.trim()) return null;
      const pre = document.createElement('pre');
      pre.className = 'ac-attach-text';
      pre.textContent = lines;
      host.replaceChildren(pre);
      return { dispose: () => pre.remove() };
    }
    const blob = await previewableBlob(file, family, { window });
    if (family === 'pdf') {
      const { renderPdfPreview } = await import('./previews/pdf-page-preview.js');
      return await renderPdfPreview(blob, host, { window, document });
    }
    if (family === 'word') {
      const { renderDocxPreview } = await import('./previews/docx-page-preview.js');
      return await renderDocxPreview(blob, host, { window, document });
    }
    if (family === 'powerpoint') {
      const { renderPresentationSlide } = await import('./previews/slide-preview.js');
      const slide = renderPresentationSlide(document, blob.presentation, 0);
      if (!slide) return null;
      slide.style.width = '100%';
      slide.style.height = '100%';
      slide.style.display = 'block';
      host.replaceChildren(slide);
      return { dispose: () => slide.remove() };
    }
    if (family === 'excel') {
      const { renderXlsxPreview } = await import('./previews/xlsx-sheet-preview.js');
      const scaled = document.createElement('div');
      scaled.className = 'ac-attach-scaled';
      host.replaceChildren(scaled);
      return await renderXlsxPreview(blob, scaled, { document });
    }
  } catch {
    // A file that cannot be drawn keeps the icon of its kind.
  }
  return null;
}
