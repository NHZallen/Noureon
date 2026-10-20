// What the readers of Word, PowerPoint and Excel files (src/app/ui/files/office-text/) need on the server: the zip reader and an XML parser (the page has the
// browser's own). One reader for each reply, so a file in the history is read once for that reply and nothing is kept after it.

import { createOfficeReader } from '../src/app/ui/files/office-text/office-reader.js';
import { getOfficePdfConverter } from './office-pdf.js';

let loaded = null;
const loadDeps = () => {
  loaded ||= Promise.all([import('jszip'), import('@xmldom/xmldom')]).then(([zip, xml]) => ({ JSZip: zip.default, DOMParser: xml.DOMParser }));
  return loaded;
};

/** `userId`: the person the reply is for (the PDFs made of their files are kept for them only). `onConvert()`: called before a file is turned into a PDF. */
export function createServerOfficeReader({ userId = '', signal, onConvert = () => {} } = {}) {
  const converter = getOfficePdfConverter();
  return createOfficeReader({
    loadDeps,
    convertToPdf: converter?.available && userId ? (inline) => {
      onConvert();
      return converter.convert({ userId, inline, signal });
    } : null
  });
}
