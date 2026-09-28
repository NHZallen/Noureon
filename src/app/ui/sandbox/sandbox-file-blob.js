// The "stored" generator: a file Python made, delivered from its saved
// bytes. Workbooks also get the layout the sheet preview draws.

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
  return blob;
}
