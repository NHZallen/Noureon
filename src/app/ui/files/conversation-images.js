// Resolves "upload:N" image references in generated presentations to the
// images the user attached to the conversation (N counts image attachments
// from the first user message, starting at 1). Attachments are data URLs
// already on the page, so nothing is fetched. Images are re-encoded as PNG or
// JPEG (what every PowerPoint version opens) and capped in size.

const THUMB_SELECTOR = '.user-message .message-media-thumb:not(.message-media-video) img';
const MAX_SIDE = 2400;
const SAFE_SOURCE = /^data:image\/[\w.+-]+;base64,/i;

/** The attached image sources of the conversation, in order. */
export function conversationImageSources(document) {
  return [...(document?.querySelectorAll?.(THUMB_SELECTOR) || [])]
    .map((image) => image.getAttribute('src') || '')
    .filter((source) => SAFE_SOURCE.test(source));
}

function decode(window, source) {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('image could not be decoded'));
    image.src = source;
  });
}

/**
 * Returns `resolveImage(source)` for pptx-file.js: { data, pixels } for an
 * upload that exists, or null (the slide then shows a placeholder).
 */
export function createConversationImageResolver({ document, window, sources = null }) {
  const cache = new Map();
  const resolveOne = async (index) => {
    const source = (sources || conversationImageSources(document))[index - 1];
    if (!source || typeof window?.Image !== 'function') return null;
    const image = await decode(window, source);
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) return null;
    const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
    const jpeg = /^data:image\/jpe?g/i.test(source);
    const keep = scale === 1 && (jpeg || /^data:image\/png/i.test(source));
    if (keep) return { data: source, pixels: { width, height } };
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return { data: canvas.toDataURL(jpeg ? 'image/jpeg' : 'image/png', 0.9), pixels: { width: canvas.width, height: canvas.height } };
  };
  return (reference) => {
    if (reference?.kind !== 'upload' || !Number.isInteger(reference.index) || reference.index < 1) return Promise.resolve(null);
    if (!cache.has(reference.index)) {
      const request = resolveOne(reference.index).catch(() => null);
      cache.set(reference.index, request);
    }
    return cache.get(reference.index);
  };
}
