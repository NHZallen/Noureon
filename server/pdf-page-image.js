// The pages of a scanned PDF as pictures, on the server (docs/superpowers/specs/2026-11-01-project-files-multimodal-design.md, R8): pdf.js draws on the canvas of @napi-rs/canvas (the same
// library the slides use). Without the library (an image that has none) opening fails and the callers go on without.

import { openPdfPages } from '../src/data/project-pdf-page.js';

const getPdfjs = () => import('pdfjs-dist/legacy/build/pdf.mjs');

async function nodeCanvasFactory() {
  const canvasModule = await import('@napi-rs/canvas');
  return (width, height) => {
    const canvas = canvasModule.createCanvas(width, height);
    return { canvas, context: canvas.getContext('2d'), toJpeg: (quality) => new Uint8Array(canvas.toBuffer('image/jpeg', quality)) };
  };
}

/** Opens a PDF given as bytes for drawing its pages: { pages, render(number, { side }), close() } (see openPdfPages). */
export async function openServerPdfPages(bytes, { pdfjs = null, canvasFactory = null } = {}) {
  return openPdfPages({ pdfjs: pdfjs || await getPdfjs(), bytes, canvasFactory: canvasFactory || await nodeCanvasFactory() });
}
