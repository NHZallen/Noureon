// pdf.js for the page, loaded the first time a PDF of a project has to be read into text (project-files-access.js). Page only: it needs the worker of the browser.

import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.min.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

let configured = false;
export function loadPagePdfjs() {
  if (!configured) {
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    configured = true;
  }
  return pdfjs;
}
