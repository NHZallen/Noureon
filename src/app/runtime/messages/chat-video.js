// A video attached to a message, for a model that sees pictures and calls tools but cannot take a video whole (docs/superpowers/specs/2026-11-02-chat-video-audio-design.md, §2): the video is
// not sent. The model is told in its place what the video is (its name and length, and the words said in it when speech to text made them) and looks at it by itself with view_project_file,
// which takes frames from it (the same tool as for the videos of a project: src/data/project-files-tool.js; the page cuts them with ffmpeg.wasm, the server with ffmpeg from the copy kept in
// the person's cloud). What the page learns about the file is kept with the part of the message (`part.mediaInfo`: { hash, duration }), so it is learned once. Page only.

import { modelSupportsUploadedFile } from '../shell/model-registry.js';
import { hasTranscript } from '../transcription/transcript-parts.js';
import { formatTime } from '../../../data/project-media.js';

import { CHAT_VIDEO_PREFIX } from '../../../data/project-piece-id.js';

export { CHAT_VIDEO_PREFIX };
const isVideo = (part) => Boolean(part?.inlineData && /^video\//i.test(String(part.inlineData.mimeType || '')) && typeof part.inlineData.data === 'string' && part.inlineData.data);
const fromBase64 = (data) => Uint8Array.from(atob(data), (character) => character.charCodeAt(0));
const hex = (buffer) => [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');

/** The videos of a message that the model is to look at with the tool: it sees pictures and calls tools (`canLook`), and cannot take this video itself. */
export const lookableVideoParts = (parts, modelInfo, canLook) => (canLook && Array.isArray(parts) ? parts.filter((part) => isVideo(part) && !modelSupportsUploadedFile(modelInfo, { inlineData: part.inlineData })) : []);

/** `part.mediaInfo` ({ hash (sha256 of the bytes: the name of the copy in the cloud), duration (seconds) }) made when it is not there yet; resolves false for a video that cannot be read. */
async function learn(part, { getToolbox, cryptoProvider }) {
  if (part.mediaInfo?.hash && part.mediaInfo.duration > 0) return true;
  try {
    const bytes = fromBase64(part.inlineData.data);
    const hash = hex(await cryptoProvider.subtle.digest('SHA-256', bytes));
    const media = await (await getToolbox()).open({ data: bytes, name: part.inlineData.name || '', mime: part.inlineData.mimeType });
    if (!media) return false;
    try {
      const found = await media.probe();
      if (!found.hasVideo || !(found.duration > 0)) return false;
      part.mediaInfo = { hash, duration: found.duration };
      return true;
    } finally {
      await media.close();
    }
  } catch {
    return false;
  }
}

/**
 * Learns the videos of `parts` to be looked at. Resolves the entries for the tool ([{ id, name, kind: 'video', size, fileHash, mimeType, duration, attached, bytes() }], `bytes()` gives the
 * file as { mimeType, data (base64) } for the page's own frames) and the parts they come from. A video that cannot be read is left out (it goes as it did before).
 */
export async function prepareChatVideos(parts, modelInfo, canLook, { getToolbox = async () => (await import('../projects/ffmpeg-wasm.js')).mediaToolbox, cryptoProvider = globalThis.crypto } = {}) {
  const found = [];
  const used = new Set();
  for (const part of lookableVideoParts(parts, modelInfo, canLook)) {
    if (!(await learn(part, { getToolbox, cryptoProvider }))) continue;
    const base = String(part.inlineData.name || 'video').replace(/\s+/g, ' ').trim().slice(0, 120) || 'video';
    let name = base;
    for (let count = 2; used.has(name); count += 1) name = `${base.replace(/\.[a-z0-9]{1,5}$/i, '')} (${count})${/\.[a-z0-9]{1,5}$/i.exec(base)?.[0] || ''}`;
    used.add(name);
    found.push({ part, entry: { id: `${CHAT_VIDEO_PREFIX}${part.mediaInfo.hash.slice(0, 16)}`, name, kind: 'video', kindText: `video ${formatTime(part.mediaInfo.duration)}`, size: Math.floor(part.inlineData.data.length * 0.75), fileHash: part.mediaInfo.hash, mimeType: part.inlineData.mimeType, duration: part.mediaInfo.duration, attached: false, bytes: async () => ({ mimeType: part.inlineData.mimeType, data: part.inlineData.data }) } });
  }
  return { entries: found.map((item) => item.entry), parts: found.map((item) => item.part), byPart: new Map(found.map((item) => [item.part, item.entry])) };
}

/** The note that stands for a video in the request (with the transcript, when there is one). */
export function chatVideoNote(part, entry) {
  const label = part.inlineData.attachmentLabel ? `[${part.inlineData.attachmentLabel}]` : `[Video: ${entry.name}]`;
  const lines = [`${label} A video of ${formatTime(entry.duration)}. You cannot watch it whole: look at it with the tool view_project_file (file: "${entry.name}"). "at" is the second to look from: you are shown 4 frames over the next 30 seconds; with no "at", 4 frames over the whole video. To find where something is shown or said, search_project_files (file: "${entry.name}") names the moments that match. Look only at what the question needs, and do not say that you looked unless asked.`];
  if (hasTranscript(part)) lines.push(`Transcript of what is said in the video, written by a speech to text model (${part.transcript.model || 'unknown model'}), each line with the second it starts at. It may have mistakes.\n${part.transcript.text.trim()}`);
  else lines.push('No transcript of what is said in it is given.');
  return { text: lines.join('\n') };
}

/** `parts` with each prepared video replaced by its note (the same list when there is none). The message itself keeps the video. */
export function withChatVideoNotes(parts, prepared) {
  if (!prepared?.entries?.length) return parts;
  return parts.map((part) => (prepared.byPart.has(part) ? chatVideoNote(part, prepared.byPart.get(part)) : part));
}
