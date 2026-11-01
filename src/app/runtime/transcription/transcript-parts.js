// A recording or a video the model cannot take whole, as the words that were said in it (docs/superpowers/specs/2026-11-02-chat-video-audio-design.md, §3): the part of the message keeps its
// transcript (`part.transcript`: { text, model, at }, written by transcription/page-transcription.js, kept and synced with the message), and for a model that cannot read the file itself the file
// is replaced by a text part that says what it is and gives the lines. Pure: the page and the server both put a request together with it (provider-request-support.js).

import { modelSupportsUploadedFile } from '../shell/model-registry.js';

export const TRANSCRIPT_IN_REQUEST_CHARS = 60_000;
const isTimed = (mimeType) => /^(audio|video)\//i.test(String(mimeType || ''));

/** Whether a part is a recording or a video that has its transcript. */
export const hasTranscript = (part) => Boolean(part?.inlineData && isTimed(part.inlineData.mimeType) && typeof part.transcript?.text === 'string' && part.transcript.text.trim());

/** The text part that stands for the file. `label` is the line that names it (its number and name, from attachment-labels.js) when there is one. */
export function transcriptTextPart(part, label = '') {
  const kind = /^video\//i.test(part.inlineData.mimeType) ? 'video' : 'recording';
  const name = part.inlineData.name || kind;
  const text = part.transcript.text.trim();
  const cut = text.length > TRANSCRIPT_IN_REQUEST_CHARS ? `${text.slice(0, TRANSCRIPT_IN_REQUEST_CHARS)}\n[The transcript goes on; it was cut here.]` : text;
  const head = label || `[${kind === 'video' ? 'Video' : 'Recording'}: ${name}]`;
  return { text: `${head}\nTranscript of what is said in this ${kind}, written by a speech to text model (${part.transcript.model || 'unknown model'}), each line with the time it starts at. It may have mistakes.${kind === 'video' ? ' Only the words are given: the pictures of the video are not.' : ''}\n${cut}` };
}

/**
 * The parts with each recording and video that the model cannot read, and that has a transcript, replaced by its transcript. `labelOf(part)` gives the line that names a file (optional).
 * The same list when there is nothing to replace.
 */
export function withTranscriptText(parts, modelInfo, labelOf = () => '') {
  if (!Array.isArray(parts) || !parts.some(hasTranscript)) return parts;
  return parts.map((part) => (hasTranscript(part) && !modelSupportsUploadedFile(modelInfo, { inlineData: part.inlineData }) ? transcriptTextPart(part, labelOf(part)) : part));
}
