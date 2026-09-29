// The "stored" generator: a file Python made, delivered from its saved
// bytes. Workbooks and presentations also get the layout their preview draws.

import { loadSandboxFileBlob } from './sandbox-files.js';

export async function storedFileBlob(descriptor, { window = globalThis.window } = {}) {
  const blob = await loadSandboxFileBlob(descriptor.sandboxFileId);
  if (descriptor.extension === 'xlsx' && !blob.workbook) {
    try {
      const [{ readWorkbookLayout }, { loadArchiveVendor }] = await Promise.all([
        import('./xlsx-reader.js'),
        import('../../vendors/archive-vendor.js')
      ]);
      const layout = await readWorkbookLayout(blob, { JSZip: await loadArchiveVendor(), DOMParser: window?.DOMParser });
      Object.defineProperty(blob, 'workbook', { value: { layout }, configurable: true });
    } catch {
      // The download still works; only the page view is unavailable.
    }
  }
  if (descriptor.extension === 'pptx' && !blob.presentation) {
    try {
      const [{ buildFreePresentation }, { loadArchiveVendor }] = await Promise.all([
        import('./free-presentation.js'),
        import('../../vendors/archive-vendor.js')
      ]);
      const presentation = await buildFreePresentation(blob, { JSZip: await loadArchiveVendor(), window });
      Object.defineProperty(blob, 'presentation', { value: presentation, configurable: true });
    } catch {
      // The download still works; only the slide view is unavailable.
    }
  }
  return blob;
}
