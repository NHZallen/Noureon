// An SVG written by a text model (docs/superpowers/specs/2026-11-06-gpt-image-2-6-design.md §6). OpenAI's Images API makes an SVG from words (with `svg.model`, a text model it asks by name), but not from a
// picture (the endpoint that edits takes png, webp and jpeg), and OpenRouter's images endpoint takes no SVG at all (the probes of 2026-11-06). A text model that sees pictures can write one either way, so:
//   - GPT Image 2.6 asked for an SVG on OpenRouter, or with a picture to start from on either provider: the model that writes is GPT-6 Luna (fixed, the person does not choose);
//   - a text model of the person's choice asked for an SVG in a chat (`config.svgWriter`): that model writes it.
// The answer is the same as a picture maker's ({ images: [{ b64Json, mediaType: 'image/svg+xml' }] }), so the pictures are kept and shown like any other. Shared by the page and the server: no window, no document.

import { OPENAI_BASE_URL } from '../shell/openai-models.js';

const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

/** The model that writes the SVG of a picture model, by provider (both already in the app's lists). */
export const SVG_WRITER_MODELS = Object.freeze({ openai: 'gpt-6-luna', openrouter: 'openai/gpt-6-luna' });
/** The two providers this file asks itself (their chat endpoints); a model of any other provider (Gemini, NVIDIA, OpenCode Go...) is asked through `askText`, the app's own request to that provider (svg-text-ask.js). */
export const SVG_DIRECT_PROVIDERS = Object.freeze(['openai', 'openrouter']);

export const SVG_WRITER_INSTRUCTION = 'You draw vector graphics. Answer with ONE complete SVG document and nothing else: it starts with <svg and ends with </svg>, has xmlns="http://www.w3.org/2000/svg" and a viewBox, '
  + 'no code fences, no explanation and no text outside the SVG. Draw with shapes, paths, gradients and text; do not link to anything outside the document. '
  + 'When a picture is attached, redraw it (or change it as asked) as a clean vector graphic: keep what is in it, in the same places and colours.';

const SHAPES = Object.freeze({ '1:1': [1024, 1024] });

/** The canvas a shape means, as a sentence for the model ('' for no shape: the drawing sets its own). */
export function canvasSentence(aspectRatio) {
  const match = /^(\d{1,2}):(\d{1,2})$/.exec(String(aspectRatio || ''));
  if (!match) return '';
  const [wide, high] = [Number(match[1]), Number(match[2])];
  if (!wide || !high) return '';
  const [width, height] = SHAPES[`${wide}:${high}`] || (wide >= high ? [1024, Math.round((1024 * high) / wide)] : [Math.round((1024 * wide) / high), 1024]);
  return `The canvas is ${width} by ${height}: viewBox="0 0 ${width} ${height}".`;
}

/** The SVG inside the words of a model (it may wrap it in a code fence or add a sentence), or '' when there is none. */
export function extractSvg(text) {
  const value = String(text ?? '');
  const start = value.search(/<svg[\s>]/i);
  const end = value.toLowerCase().lastIndexOf('</svg>');
  return start >= 0 && end > start ? value.slice(start, end + 6).trim() : '';
}

/**
 * The SVG at the size every picture has on the page: the longer side 1024 pixels in the shape of the drawing, as a picture of the picture makers. A drawing with only a `viewBox` has no size that a browser can give to
 * an <img> (on a card whose width follows its picture it came to 0 by 0 and the reply showed nothing: seen on staging with an NVIDIA model, 2026-11-06), and one that declares its own size (512, 300, 1920)
 * would be shown at that size, so a 1:1 picture came in three sizes (Allen, the same day). The shape is the declared width and height, or else the viewBox's; a drawing with neither is 1024 by 1024 (the canvas
 * the model is told), and one with a size but no viewBox gets the viewBox that goes with it so that it scales. Nothing else of the drawing is touched.
 */
export function withIntrinsicSize(svg) {
  const open = /<svg\b[^>]*>/i.exec(svg);
  if (!open) return svg;
  const tag = open[0];
  const number = (name) => {
    const match = new RegExp(`\\s${name}\\s*=\\s*["']\\s*([\\d.]+)(?:px)?\\s*["']`, 'i').exec(tag);
    return match ? Number(match[1]) : 0;
  };
  const box = /\sviewBox\s*=\s*["']\s*[-\d.eE]+[\s,]+[-\d.eE]+[\s,]+([\d.eE]+)[\s,]+([\d.eE]+)\s*["']/i.exec(tag);
  let [wide, high] = [number('width'), number('height')];
  if (!(wide > 0 && high > 0)) [wide, high] = box ? [Number(box[1]), Number(box[2])] : [1024, 1024];
  if (!(wide > 0 && high > 0)) [wide, high] = [1024, 1024];
  const scale = 1024 / Math.max(wide, high);
  const stripped = tag.replace(/\s(?:width|height)\s*=\s*("[^"]*"|'[^']*')/gi, '');
  const sized = stripped.replace(/<svg\b/i, `<svg width="${Math.round(wide * scale)}" height="${Math.round(high * scale)}"${box ? '' : ` viewBox="0 0 ${wide} ${high}"`}`);
  return svg.replace(tag, sized);
}

const toBase64 = (text) => {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
};

async function readError(response) {
  const text = await response.text();
  try {
    const body = JSON.parse(text);
    return body?.error?.message || body?.message || text;
  } catch {
    return text || response.statusText;
  }
}

const userText = (prompt, config) => [prompt, canvasSentence(config?.aspectRatio)].filter(Boolean).join('\n\n');

// The words of a Responses API answer.
const responsesText = (body) => (typeof body?.output_text === 'string' && body.output_text)
  || (body?.output || []).filter((item) => item?.type === 'message').flatMap((item) => item.content || []).map((part) => part?.text || '').join('');

// The words of a chat completion (a string, or a list of parts).
const chatText = (body) => {
  const content = body?.choices?.[0]?.message?.content;
  return Array.isArray(content) ? content.map((part) => part?.text || '').join('') : String(content ?? '');
};

const dataUrlPart = (url) => {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(String(url));
  return match ? { inlineData: { mimeType: match[1], data: match[2] } } : null;
};

export function createSvgWriter({ fetchImpl = (...args) => globalThis.fetch(...args), getSafetyIdentifier = async () => '', askText = null } = {}) {
  const writeOne = async ({ provider, apiKey, model, modelInfo, prompt, config = {}, inputReferences = [], signal }) => {
    const text = userText(prompt, config);
    if (!SVG_DIRECT_PROVIDERS.includes(provider)) {
      // Any other provider: the app's own request to it, as for a reply (the instruction goes in the message, with the pictures to start from).
      if (!askText) throw new Error('The model of this provider cannot be asked for an SVG here.');
      const answer = await askText({ provider, model, modelInfo, signal, parts: [{ text: `${SVG_WRITER_INSTRUCTION}\n\n${text}` }, ...inputReferences.map(dataUrlPart).filter(Boolean)] });
      const written = extractSvg(answer);
      if (!written) throw new Error('The model did not write an SVG.');
      return { images: [{ b64Json: toBase64(withIntrinsicSize(written)), mediaType: 'image/svg+xml' }] };
    }
    let response;
    if (provider === 'openai') {
      const safetyIdentifier = await getSafetyIdentifier();
      response = await fetchImpl(`${OPENAI_BASE_URL}/responses`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          instructions: SVG_WRITER_INSTRUCTION,
          input: [{ role: 'user', content: [{ type: 'input_text', text }, ...inputReferences.map((url) => ({ type: 'input_image', image_url: url }))] }],
          store: false,
          ...(config.svgWriter && config.reasoningEffort ? { reasoning: { effort: config.reasoningEffort } } : {}),
          ...(safetyIdentifier ? { safety_identifier: safetyIdentifier } : {})
        }),
        signal
      });
    } else {
      response = await fetchImpl(OPENROUTER_CHAT_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: SVG_WRITER_INSTRUCTION },
            { role: 'user', content: [{ type: 'text', text }, ...inputReferences.map((url) => ({ type: 'image_url', image_url: { url } }))] }
          ],
          ...(config.svgWriter && config.reasoningEffort ? { reasoning: { effort: config.reasoningEffort } } : {})
        }),
        signal
      });
    }
    if (!response.ok) throw new Error(await readError(response));
    const body = await response.json();
    const svg = extractSvg(provider === 'openai' ? responsesText(body) : chatText(body));
    if (!svg) throw new Error('The model did not write an SVG.');
    return { images: [{ b64Json: toBase64(withIntrinsicSize(svg)), mediaType: 'image/svg+xml' }] };
  };
  // As many SVGs as asked (a text model writes text: one request each, made together, each told which of how many it is so that they are not the same).
  return async function writeSvg(request) {
    const count = Math.min(10, Math.max(1, Math.floor(Number(request.config?.n)) || 1));
    if (count === 1) return writeOne(request);
    const settled = await Promise.allSettled(Array.from({ length: count }, (_, index) => writeOne({ ...request, prompt: `${request.prompt}\n\nThis is version ${index + 1} of ${count}: make it differ from the others in composition and style.` })));
    const images = settled.flatMap((outcome) => (outcome.status === 'fulfilled' ? outcome.value.images : []));
    if (!images.length) throw settled.find((outcome) => outcome.status === 'rejected').reason;
    return { images };
  };
}
