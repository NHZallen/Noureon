// A small copy of a picture of a project, for showing it to a text model (view_project_file, docs/superpowers/specs/2026-11-01-project-files-multimodal-design.md, R3): the longest side is cut and it
// is kept as a JPEG that fits the size a tool answer may carry (data/tool-result.js). The server has its own (server/picture-thumb.js); this is the page's, made with the canvas of the browser.
// What the page gives is injected, so that the tests need no browser. Page only.

import { MAX_RESULT_IMAGE_CHARS } from '../../../data/tool-result.js';

export const VIEW_SIDES = Object.freeze([1280, 900, 600]);
/** The sides tried for the copy that is sent to the model of the vectors (docs/superpowers/specs/2026-11-01-project-files-multimodal-design.md, §10.8): a picture is sent small, never as the original. */
export const EMBED_SIDES = Object.freeze([1024, 768]);
const EMBED_MAX_CHARS = 4_000_000;
const QUALITY = 0.82;
const AS_IS_CHARS = 200_000;

const fromBase64 = (data) => Uint8Array.from(atob(data), (character) => character.charCodeAt(0));
const toBase64 = (bytes) => {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
};

/**
 * `{ mimeType, data (base64) }` of the picture -> { mimeType: 'image/jpeg', data } that is small enough, or null when no small copy can be made (the picture is then not shown).
 * `deps`: { createImageBitmap(blob), makeCanvas(width, height) -> { getContext('2d'), toBlob(type, quality) -> Promise<Blob> } } (the browser's by default).
 */
export async function makeViewThumbnail({ mimeType, data }, deps = {}, { sides = VIEW_SIDES, maxChars = MAX_RESULT_IMAGE_CHARS, asIsChars = AS_IS_CHARS } = {}) {
  const create = deps.createImageBitmap || globalThis.createImageBitmap?.bind(globalThis);
  const canvasOf = deps.makeCanvas || ((width, height) => {
    if (typeof globalThis.OffscreenCanvas === 'function') {
      const surface = new globalThis.OffscreenCanvas(width, height);
      return { getContext: (kind) => surface.getContext(kind), toBlob: (type, quality) => surface.convertToBlob({ type, quality }) };
    }
    const surface = globalThis.document?.createElement?.('canvas');
    if (!surface) return null;
    surface.width = width;
    surface.height = height;
    return { getContext: (kind) => surface.getContext(kind), toBlob: (type, quality) => new Promise((resolve) => surface.toBlob(resolve, type, quality)) };
  });
  if (create) {
    try {
      const picture = await create(new Blob([fromBase64(data)], { type: mimeType }));
      for (const side of sides) {
        const scale = Math.min(1, side / Math.max(picture.width, picture.height));
        const width = Math.max(1, Math.round(picture.width * scale));
        const height = Math.max(1, Math.round(picture.height * scale));
        const surface = canvasOf(width, height);
        const context = surface?.getContext('2d');
        if (!context) break;
        // A picture with clear places would turn black as a JPEG.
        context.fillStyle = 'white';
        context.fillRect(0, 0, width, height);
        context.drawImage(picture, 0, 0, width, height);
        const blob = await surface.toBlob('image/jpeg', QUALITY);
        if (!blob) break;
        const text = toBase64(new Uint8Array(await blob.arrayBuffer()));
        if (text.length <= maxChars) return { mimeType: 'image/jpeg', data: text };
      }
    } catch {
      // A picture this browser cannot read: below.
    }
  }
  return data.length <= asIsChars && /^image\/(png|jpeg|webp|gif)$/.test(mimeType) ? { mimeType, data } : null;
}

/**
 * The copy of a picture that goes to the model of the vectors: a JPEG of at most 1024 on the longest side (so a picture of any size and any kind the browser can open is sent small), or, when the
 * browser cannot open it, the original when it is a PNG or a JPEG that is not too big. null when nothing can be sent: the picture is then marked, not tried again.
 */
export const makeEmbedThumbnail = (loaded, deps = {}) => makeViewThumbnail(loaded, deps, { sides: EMBED_SIDES, maxChars: EMBED_MAX_CHARS, asIsChars: 9 * 1024 * 1024 }).then((made) => (made && (made.mimeType === 'image/jpeg' || made.mimeType === 'image/png') ? made : null));
