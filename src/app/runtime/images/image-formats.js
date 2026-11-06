// The formats of a picture and what goes with them (docs/superpowers/specs/2026-11-06-gpt-image-2-6-design.md). Most picture models make png, jpeg or webp; GPT Image 2.6 (OpenAI's own API and OpenRouter) also makes
// a GIF that moves (`output_format: gif`, with `frame_count` and `frame_duration_ms`) and an SVG (`output_format: svg`, one picture, no compression). The page and the server share this file:
// no window, no document, no browser storage.

export const STILL_IMAGE_FORMATS = ['png', 'jpeg', 'webp'];
export const GPT_IMAGE_26_FORMATS = ['png', 'jpeg', 'webp', 'gif', 'svg'];

// The animation: the number of frames (OpenAI's reference: 9 when none is asked for; its guide says up to 64, its reference says up to 16, so up to 16 is offered), and the time of a frame
// in milliseconds (20 to 2000 are taken; the result is rounded to 10).
export const GIF_FRAME_COUNT_DEFAULT = 9;
export const GIF_FRAME_COUNTS = Array.from({ length: 15 }, (_, index) => index + 2);
export const GIF_FRAME_DURATION_DEFAULT_MS = 200;
export const GIF_FRAME_DURATIONS_MS = [50, 100, 150, 200, 300, 500, 1000, 2000];

export const IMAGE_MEDIA_TYPES = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml' };

/** A picture that moves or is drawn in lines cannot be the picture another one is built on (the edit endpoints take png, jpeg and webp); an SVG is one picture at a time. */
export const isAnimatedOrVectorFormat = (format) => format === 'gif' || format === 'svg';
export const isAnimatedOrVectorType = (mediaType) => mediaType === 'image/gif' || mediaType === 'image/svg+xml';

/** The formats a model makes (a model that lists none makes the still ones). */
export const supportedFormatsOf = (model) => (Array.isArray(model?.supportedImageFormats) && model.supportedImageFormats.length ? model.supportedImageFormats : STILL_IMAGE_FORMATS);

const whole = (value, min, max, fallback) => {
  const number = Math.round(Number(value));
  return value === '' || value == null || !Number.isFinite(number) ? fallback : Math.min(max, Math.max(min, number));
};

/**
 * The settings of a request, put right for the format. A GIF has its frames (and the time of one) and no compression; an SVG is one picture and takes no compression; a format that does not
 * move has no frames. The page, the server and both makers of pictures use this one function, so they ask for the same thing.
 */
export function settleImageFormatConfig(config = {}) {
  const { frameCount, frameDuration, ...next } = config;
  const gif = next.outputFormat === 'gif';
  const svg = next.outputFormat === 'svg';
  if (gif) {
    next.frameCount = whole(frameCount, 2, 16, GIF_FRAME_COUNT_DEFAULT);
    next.frameDuration = whole(frameDuration, 20, 2000, GIF_FRAME_DURATION_DEFAULT_MS);
  }
  if (gif || svg) delete next.outputCompression;
  // OpenAI's own SVG is one picture; a text model that writes it can write as many as asked (svg-writer.js).
  if (svg && !next.svgWriter) next.n = 1;
  return next;
}

/**
 * The type of a picture from its first bytes (the base64 of it), or '' when they are none of ours. A maker of pictures says what it was asked for, not always what it made (OpenRouter answered
 * a PNG sheet of frames for a GIF with a picture to start from, 2026-11-06), so the bytes decide what the picture is called, and the name of its file.
 */
export function sniffImageType(b64Json) {
  let head;
  try {
    head = atob(String(b64Json || '').slice(0, 96));
  } catch {
    return '';
  }
  if (head.startsWith('GIF87a') || head.startsWith('GIF89a')) return 'image/gif';
  if (head.startsWith('\x89PNG')) return 'image/png';
  if (head.startsWith('\xff\xd8\xff')) return 'image/jpeg';
  if (head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP') return 'image/webp';
  if (/^(\xef\xbb\xbf)?\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(head)) return 'image/svg+xml';
  return '';
}
