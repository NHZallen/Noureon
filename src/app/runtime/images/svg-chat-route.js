// A text model asked for an SVG in a chat (docs/superpowers/specs/2026-11-06-gpt-image-2-6-design.md §6): when the Decisions model is sure that the person wants a vector picture, the model of the chat writes
// the SVG and it is shown and kept as a picture. Without the answer of the Decisions model (no key, slow, paused) nothing changes: the model answers in words, as before.

import { decisionsFor, verdictOf } from '../decisions/decision-store.js';
import { SVG_WRITER_PROVIDERS } from './svg-writer.js';

// A text reply turned into a picture is a bigger step than a tool: it needs a sure yes.
export const SVG_CHAT_THRESHOLD = 0.8;

const textOf = (parts = []) => parts.map((part) => (typeof part?.text === 'string' ? part.text : '')).filter(Boolean).join('\n').trim();

/** Does the model of this chat write an SVG for this message? Only models of the providers that can be asked for one (OpenAI, OpenRouter) and that are not picture makers themselves. */
export function chatWritesSvg({ modelInfo, userParts }) {
  if (!SVG_WRITER_PROVIDERS.includes(modelInfo?.provider)) return false;
  return verdictOf(decisionsFor(textOf(userParts)), 'svg', SVG_CHAT_THRESHOLD) === true;
}

/** The model as the picture lifecycle needs it: SVGs (as many as the Count asks, up to 10), nothing of a picture maker's options. */
export const svgWriterModelInfo = (modelInfo) => ({ ...modelInfo, supportedImageFormats: ['svg'], supportedImageOptions: [], supportedImageAspectRatios: undefined, supportedImageResolutions: undefined, maxImageCount: 10, minImageReferences: 0, maxImageReferences: 16 });

/** Runs the picture lifecycle with the model of the chat as the one that writes the SVG; `options` are those of lifecycle.run (without the model). */
export const run = (lifecycle, { modelInfo, ...options }) => lifecycle.run({ ...options, modelInfo: svgWriterModelInfo(modelInfo), svgByTextModel: true });
