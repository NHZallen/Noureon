// Pictures from OpenAI's own Images API (docs/superpowers/specs/2026-10-29-openai-provider-design.md): `POST /v1/images/generations` (JSON) for a picture from words,
// `POST /v1/images/edits` (a form with the pictures to start from) when there are reference pictures. The probe of 2026-10-29 found both answer a browser and take
// `gpt-image-2.5-flare` at low quality (about 5 seconds, 196 picture tokens; 2.6 has the same parameters and adds the formats gif and svg; the endpoint that edits makes a GIF too, not an SVG: probe of 2026-11-06). Nothing is kept on OpenAI's side that the person did not ask for: a picture is returned as data
// and the app keeps it; a picture built on an earlier one is sent as data, never as an id.
//
// The same function as the one for OpenRouter (openrouter-image-generation.js): `({ apiKey, model, prompt, config, inputReferences, groups, signal }) => { images }`, so the
// reply that makes pictures does not care whose they are. The size is worked out from the shape and the size tier the app offers (OpenAI takes any size that follows its rules).
//
// Shared by the page and the server: no window, no document, no browser storage.

import { OPENAI_BASE_URL } from '../shell/openai-models.js';
import { IMAGE_MEDIA_TYPES, settleImageFormatConfig, sniffImageType } from './image-formats.js';
import { withIntrinsicSize } from './svg-writer.js';

// How many pixels each tier means (the nearest the rules allow is taken); a shape is a ratio of width to height.
const TIER_PIXELS = Object.freeze({ '512': 262_144, '768': 589_824, '1K': 1_048_576, '1.5K': 2_359_296, '2K': 4_194_304, '4K': 8_294_400 });
const MIN_PIXELS = 655_360;
const MAX_PIXELS = 8_294_400;
const MAX_EDGE = 3840;
const MIN_RATIO = 1 / 3;
const MAX_RATIO = 3;
const STEP = 16;

const roundTo = (value, step) => Math.max(step, Math.round(value / step) * step);

/**
 * `WIDTHxHEIGHT` for a shape ('16:9') and a size tier ('2K'), inside the rules of OpenAI (both edges a multiple of 16 and at most 3840, a ratio between 1:3 and 3:1, from 655,360
 * to 8,294,400 pixels); `auto` for a shape of `auto` (the model chooses).
 */
export function openAiImageSize(aspectRatio, resolution) {
  if (aspectRatio === 'auto') return 'auto';
  const [wide, high] = String(aspectRatio || '1:1').split(':').map(Number);
  const ratio = wide > 0 && high > 0 ? Math.min(MAX_RATIO, Math.max(MIN_RATIO, wide / high)) : 1;
  let pixels = TIER_PIXELS[resolution] ?? TIER_PIXELS['1K'];
  pixels = Math.min(MAX_PIXELS, Math.max(MIN_PIXELS, pixels));
  let width = roundTo(Math.sqrt(pixels * ratio), STEP);
  let height = roundTo(width / ratio, STEP);
  // Rounding may take a size over a rule: step back on the long edge until it fits, or forward until it is big enough.
  for (let guard = 0; guard < 400 && (width > MAX_EDGE || height > MAX_EDGE || width * height > MAX_PIXELS); guard += 1) {
    if (width >= height) width -= STEP; else height -= STEP;
  }
  for (let guard = 0; guard < 400 && width * height < MIN_PIXELS; guard += 1) {
    if (width <= height) width += STEP; else height += STEP;
  }
  return `${width}x${height}`;
}

const MEDIA_TYPES = IMAGE_MEDIA_TYPES;

/**
 * The size of a GIF. It is a sheet of its frames cut up by OpenAI, and a sheet has to fit its limits (the longest edge 3840, the pixels): 1024x1024 made 400 for 4 and for 9 frames (probe, 2026-11-06).
 * A GIF is automatic by default: `auto` (and the square, which is what the settings hold until a shape is chosen) is left to the model; any other shape is drawn with its longest edge at 512, which
 * was taken for 2, 4 and 16 frames in the range probe of the same day (the square is the one verified; other shapes follow the same rule and show OpenAI's own words if it refuses them).
 */
export function openAiGifSize(aspectRatio) {
  if (aspectRatio === 'auto' || aspectRatio === '1:1' || !aspectRatio) return 'auto';
  const [wide, high] = String(aspectRatio || '1:1').split(':').map(Number);
  if (!(wide > 0 && high > 0)) return 'auto';
  const ratio = Math.min(MAX_RATIO, Math.max(MIN_RATIO, wide / high));
  return ratio >= 1 ? `512x${roundTo(512 / ratio, STEP)}` : `${roundTo(512 * ratio, STEP)}x512`;
}

// An SVG is written by a text model that OpenAI's Images API asks for by name (`svg.model`; without it the answer is 400 "SVG generation requires 'svg.model'"). The probe of 2026-11-06 found
// gpt-6-luna and gpt-5.6-luna take it; the person does not choose: the one the app already knows is used.
export const OPENAI_SVG_MODEL = 'gpt-6-luna';

const copyIfDefined = (target, key, value) => {
  if (value !== undefined && value !== null && value !== '') target[key] = value;
};

/** The fields of a request to either endpoint (the form adds the pictures to start from). */
export function buildOpenAiImageFields({ model, prompt, config: asked = {}, safetyIdentifier = '' }) {
  const config = settleImageFormatConfig(asked);
  const fields = { model, prompt };
  copyIfDefined(fields, 'n', config.n);
  fields.size = openAiImageSize(config.aspectRatio, config.resolution);
  copyIfDefined(fields, 'quality', config.quality);
  copyIfDefined(fields, 'output_format', config.outputFormat);
  copyIfDefined(fields, 'background', config.background);
  // A compression is for the formats that lose something.
  if (config.outputFormat === 'jpeg' || config.outputFormat === 'webp') copyIfDefined(fields, 'output_compression', config.outputCompression);
  // A GIF (GPT Image 2.6): the number of frames and the time of one; they are only for that format.
  copyIfDefined(fields, 'frame_count', config.frameCount);
  copyIfDefined(fields, 'frame_duration_ms', config.frameDuration);
  if (config.outputFormat === 'gif') fields.size = openAiGifSize(config.aspectRatio);
  if (config.outputFormat === 'svg') fields.svg = { model: OPENAI_SVG_MODEL };
  copyIfDefined(fields, 'safety_identifier', safetyIdentifier);
  return fields;
}

const dataUrlToBlob = (url) => {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(String(url));
  if (!match) throw new Error('A reference picture must be a picture sent as data.');
  const bytes = Uint8Array.from(atob(match[2]), (character) => character.charCodeAt(0));
  return { blob: new Blob([bytes], { type: match[1] }), type: match[1] };
};

const extensionOf = (type) => (type === 'image/jpeg' ? 'jpg' : type === 'image/webp' ? 'webp' : 'png');

async function readError(response) {
  const text = await response.text();
  try {
    const body = JSON.parse(text);
    return body?.error?.message || body?.message || text;
  } catch {
    return text || response.statusText;
  }
}

export function createOpenAiImageGenerator({ fetchImpl = (...args) => globalThis.fetch(...args), getSafetyIdentifier = async () => '' } = {}) {
  const callOnce = async ({ apiKey, model, prompt, config, inputReferences, signal }) => {
    const fields = buildOpenAiImageFields({ model, prompt, config, safetyIdentifier: await getSafetyIdentifier() });
    let response;
    if (inputReferences.length > 0) {
      const form = new FormData();
      for (const [name, value] of Object.entries(fields)) {
        if (name === 'svg') form.append('svg[model]', value.model);
        else form.append(name, String(value));
      }
      inputReferences.forEach((url, index) => {
        const { blob, type } = dataUrlToBlob(url);
        form.append('image[]', blob, `reference-${index + 1}.${extensionOf(type)}`);
      });
      response = await fetchImpl(`${OPENAI_BASE_URL}/images/edits`, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form, signal });
    } else {
      response = await fetchImpl(`${OPENAI_BASE_URL}/images/generations`, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(fields), signal });
    }
    if (!response.ok) throw new Error(await readError(response));
    const body = await response.json();
    const asked = MEDIA_TYPES[body.output_format] || MEDIA_TYPES[fields.output_format] || 'image/png';
    // What the picture is comes from its bytes; the format asked for is the guess when they are none we know.
    return (body.data || []).filter((image) => image?.b64_json).map((image) => {
      const mediaType = sniffImageType(image.b64_json) || asked;
      // A drawing with no size of its own would be 0 by 0 on a card (svg-writer.js).
      if (mediaType !== 'image/svg+xml') return { b64Json: image.b64_json, mediaType };
      const bytes = Uint8Array.from(atob(image.b64_json), (character) => character.charCodeAt(0));
      const text = new TextDecoder().decode(bytes);
      const sized = withIntrinsicSize(text);
      if (sized === text) return { b64Json: image.b64_json, mediaType };
      let binary = '';
      new TextEncoder().encode(sized).forEach((byte) => { binary += String.fromCharCode(byte); });
      return { b64Json: btoa(binary), mediaType };
    });
  };

  return async function generateOpenAiImage({
    apiKey,
    model,
    prompt,
    config = {},
    inputReferences = [],
    // One picture for each group, each from its own reference pictures and in its own shape ([{ inputReferences, aspectRatio }]): one request each, made together.
    groups = null,
    signal
  }) {
    if (Array.isArray(groups) && groups.length > 0) {
      const settled = await Promise.allSettled(groups.map((group) => callOnce({
        apiKey, model, prompt, signal,
        inputReferences: group.inputReferences || [],
        config: { ...config, n: 1, ...(group.aspectRatio ? { aspectRatio: group.aspectRatio } : {}) }
      }).then((images) => images.map((image) => ({ ...image, ...(group.aspectRatio || config.aspectRatio ? { aspectRatio: group.aspectRatio || config.aspectRatio } : {}) })))));
      const images = settled.flatMap((outcome) => (outcome.status === 'fulfilled' ? outcome.value : []));
      // Some pictures are better than none; with none, the first problem is the answer.
      if (!images.length) {
        const failed = settled.find((outcome) => outcome.status === 'rejected');
        if (failed) throw failed.reason;
      }
      return { images };
    }
    return { images: await callOnce({ apiKey, model, prompt, config, inputReferences, signal }) };
  };
}
