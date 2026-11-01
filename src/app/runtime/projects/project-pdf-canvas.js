// The canvas the page draws the pages of a scanned PDF on (src/data/project-pdf-page.js): an OffscreenCanvas, or a canvas of the document where there is none. Page only.

export function browserPdfCanvasFactory() {
  return (width, height) => {
    let surface;
    if (typeof globalThis.OffscreenCanvas === 'function') surface = new globalThis.OffscreenCanvas(width, height);
    else {
      surface = globalThis.document.createElement('canvas');
      surface.width = width;
      surface.height = height;
    }
    const toBlob = (quality) => (surface.convertToBlob
      ? surface.convertToBlob({ type: 'image/jpeg', quality: quality / 100 })
      : new Promise((resolve) => surface.toBlob(resolve, 'image/jpeg', quality / 100)));
    return {
      canvas: surface,
      context: surface.getContext('2d'),
      toJpeg: async (quality) => {
        const blob = await toBlob(quality);
        if (!blob) throw new Error('The page could not be kept as a picture.');
        return new Uint8Array(await blob.arrayBuffer());
      }
    };
  };
}
