// A text model asked for an SVG in a chat (docs/superpowers/specs/2026-11-06-gpt-image-2-6-design.md §6): when the Decisions model is sure that the person wants a vector picture, the model of the chat writes
// the SVG and it is shown and kept as a picture. Without the answer of the Decisions model (no key, slow, paused) nothing changes: the model answers in words, as before.

import { decisionsFor, verdictOf } from '../decisions/decision-store.js';

// A text reply turned into a picture is a bigger step than a tool: it needs a sure yes.
export const SVG_CHAT_THRESHOLD = 0.8;

const textOf = (parts = []) => parts.map((part) => (typeof part?.text === 'string' ? part.text : '')).filter(Boolean).join('\n').trim();

/** The id of the SVG picture the person marked in the editor and sent back to be changed (`targetedEdit.svg` of a picture part), or ''. */
export const svgEditSource = (userParts = []) => userParts.map((part) => part?.inlineData?.targetedEdit?.svg).find(Boolean) || '';

/** The words that go with an SVG to change: its code, and what the marked picture is. */
export const svgEditPrompt = (code) => `The attached picture is the drawing below with colored marks drawn on it that show where it is to be changed. Change the drawing as asked, only where it is marked and where the words say, keep everything else as it is, draw no marks, and answer with the complete new SVG.\n\nThe SVG code of the drawing:\n${code}`;

/** The text of an SVG held as a data address, or ''. */
export const svgTextOfDataUrl = (url) => {
  const match = /^data:[^;,]+;base64,(.*)$/s.exec(String(url));
  if (!match) return '';
  try {
    return new TextDecoder().decode(Uint8Array.from(atob(match[1]), (character) => character.charCodeAt(0)));
  } catch {
    return '';
  }
};

/** Does the model of this chat write an SVG for this message? Any text model of any provider (a picture maker is not asked: it makes its own pictures). */
export function chatWritesSvg({ modelInfo, userParts }) {
  if (!modelInfo?.provider) return false;
  // A drawing sent back from the editor is changed whatever the words say ("make it orange" does not ask for a vector picture by itself).
  if (svgEditSource(userParts)) return true;
  return verdictOf(decisionsFor(textOf(userParts)), 'svg', SVG_CHAT_THRESHOLD) === true;
}

/** The model as the picture lifecycle needs it: SVGs (as many as the Count asks, up to 10), nothing of a picture maker's options. */
export const svgWriterModelInfo = (modelInfo) => ({ ...modelInfo, supportedImageFormats: ['svg'], supportedImageOptions: [], supportedImageAspectRatios: undefined, supportedImageResolutions: undefined, maxImageCount: 10, minImageReferences: 0, maxImageReferences: 16 });

/** Runs the picture lifecycle with the model of the chat as the one that writes the SVG; `options` are those of lifecycle.run (without the model). */
export const run = (lifecycle, { modelInfo, ...options }) => lifecycle.run({ ...options, modelInfo: svgWriterModelInfo(modelInfo), svgByTextModel: true });
