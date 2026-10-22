// What a tool gives back to the model: words, or words with pictures (the picture a text model has just drawn, shown to it so it can say how it
// came out). The loaders of the loops (skills, connectors, pictures) return a string, or { content, images: [{ label, mimeType, data }] } with the
// pictures as base64 text. The loops keep the words as the call's answer and hand the pictures to the provider in the form it takes
// (src/app/runtime/features/tool-call-formats.js). The server reads this file too, so it may not use the browser (scripts/server-shared-modules.json).

/** Pictures one answer may carry, and the size of each (base64 characters): the model sees small pictures, not the originals. */
export const MAX_RESULT_IMAGES = 12;
export const MAX_RESULT_IMAGE_CHARS = 400_000;

const validImage = (image) => image
  && typeof image === 'object'
  && typeof image.data === 'string'
  && image.data.length > 0
  && image.data.length <= MAX_RESULT_IMAGE_CHARS
  && /^image\/(png|jpeg|webp|gif)$/.test(image.mimeType || '');

/** { content, images } for what a loader returned (a plain string has no pictures). */
export function toolResult(value) {
  if (value && typeof value === 'object' && !Array.isArray(value) && typeof value.content === 'string') {
    const images = Array.isArray(value.images) ? value.images.filter(validImage).slice(0, MAX_RESULT_IMAGES).map((image) => ({ label: String(image.label || '').slice(0, 300), mimeType: image.mimeType, data: image.data })) : [];
    return { content: value.content, images };
  }
  return { content: typeof value === 'string' ? value : JSON.stringify(value ?? ''), images: [] };
}

/** A result of a round as the loops keep it: the answer's words, and its pictures when it has any. */
export function keepToolResult(call, value) {
  const { content, images } = toolResult(value);
  return { id: call.id, geminiId: call.geminiId, name: call.name, content, ...(images.length ? { images } : {}) };
}

/** The pictures of all the answers of a round, in order: [{ label, mimeType, data }]. */
export const roundImages = (results = []) => results.flatMap((result) => (Array.isArray(result?.images) ? result.images : []));

/** A round for a snapshot kept to resume from: without the pictures (they are large, and only the round after the call needs them). */
export const withoutImages = (turns = []) => turns.map((turn) => ({ ...turn, results: (turn.results || []).map(({ images: _images, ...rest }) => rest) }));
